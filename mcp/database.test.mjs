import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { TaskService } from "./task-service.mjs";
import { deleteBunnyObject } from "./attachments.mjs";

const runDatabaseTests = process.env.MCP_RUN_DB_TESTS === "1";
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("real Prisma/MySQL assignment, files, feed, resolution and dependency workflow", { skip: !runDatabaseTests, timeout: 180000 }, async () => {
  const prisma = new PrismaClient({ log: ["error"] });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const agentKey = `test-agent-${suffix}`;
  const uploadedStoragePaths = [];
  const temporaryDirectory = await mkdtemp(join(process.cwd(), ".mcp-db-test-"));
  let operator;
  let agent;

  try {
    operator = await prisma.user.create({
      data: {
        email: `mcp-test-operator-${suffix}@example.invalid`,
        name: "Temporary MCP Test Operator",
        role: "admin",
        userType: "employee",
      },
    });
    const service = new TaskService(prisma, { operatorUserEmail: operator.email });
    agent = await service.registerAgent({ agent_key: agentKey, display_name: "Temporary MCP Test Agent" });

    const project = await service.createProject({
      name: `MCP Test Project ${suffix}`,
      description: "Temporary integration test project",
      color: "#0078D4",
      icon: "TestTube",
    });
    assert.match(project.projectCode, /^PRJ-\d{4}-\d{3}$/);
    assert.equal(project.ownerId, operator.id);
    assert.equal(project.members[0].userId, operator.id);

    const prerequisite = await service.createTask({
      project_id: project.id,
      title: "Prerequisite",
      description: "Temporary integration test task",
      acceptance_criteria: ["The full MCP workflow persists in the PMS"],
      related_files: ["mcp/task-service.mjs"],
    });
    const dependent = await service.createTask({
      project_id: project.id,
      title: "Dependent",
      dependency_task_ids: [prerequisite.id],
    });

    const assigned = await service.assignTasks({ task_ids: [prerequisite.id, dependent.id], agent_key: agentKey });
    for (const task of assigned) {
      assert.equal(task.activeAIAgentId, agent.id);
      assert.deepEqual(task.assignees.map((assignee) => assignee.userId), [operator.id]);
      assert.ok(task.assignees.every((assignee) => assignee.user.isAIAgent === false));
    }

    const withoutDependency = await service.updateTask({
      task_id: dependent.id,
      agent_key: agentKey,
      hours: 4,
      dependencies: { remove: [prerequisite.id] },
    });
    assert.equal(withoutDependency.estimatedHours, 4);
    assert.deepEqual(withoutDependency.dependencies, []);
    const withDependency = await service.updateTask({
      task_id: dependent.id,
      agent_key: agentKey,
      dependencies: { add: [prerequisite.id] },
    });
    assert.equal(withDependency.estimatedHours, 4);
    assert.deepEqual(withDependency.dependencies.map((dependency) => dependency.dependsOnId), [prerequisite.id]);
    await assert.rejects(
      service.updateTask({ task_id: prerequisite.id, agent_key: agentKey, dependencies: { add: [dependent.id] } }),
      (error) => error.code === "DEPENDENCY_CYCLE",
    );

    const projectFile = await service.uploadFile({
      project_id: project.id,
      agent_key: agentKey,
      file_name: "notes.txt",
      text_content: "PMS project attachment integration",
      mime_type: "text/plain",
    });
    assert.equal(projectFile.uploadedById, operator.id);
    assert.equal(projectFile.uploadedBy.email, operator.email);
    uploadedStoragePaths.push(new URL(projectFile.url).pathname.slice(1));
    const screenshotPath = join(temporaryDirectory, "screenshot.png");
    await writeFile(screenshotPath, Buffer.from(PNG_BASE64, "base64"));
    const taskScreenshot = await service.uploadTaskAttachment({
      task_id: prerequisite.id,
      agent_key: agentKey,
      file_path: screenshotPath,
    });
    assert.equal(taskScreenshot.name, "screenshot.png");
    assert.equal(taskScreenshot.mimeType, "image/png");
    uploadedStoragePaths.push(new URL(taskScreenshot.url).pathname.slice(1));

    const downloadedText = await service.readFile({ attachment_id: projectFile.id });
    assert.equal(downloadedText.text, "PMS project attachment integration");
    const downloadedScreenshot = await service.readFile({ attachment_id: taskScreenshot.id });
    assert.equal(downloadedScreenshot.mimeType, "image/png");
    assert.equal(downloadedScreenshot.data, PNG_BASE64);
    assert.ok((await service.listFiles({ task_id: prerequisite.id })).some((file) => file.id === taskScreenshot.id));
    assert.equal((await service.listFiles({ project_id: project.id })).length, 2);

    await assert.rejects(
      service.startTask({ task_id: dependent.id, agent_key: agentKey }),
      (error) => error.code === "DEPENDENCIES_PENDING",
    );
    await assert.rejects(
      service.reportProgress({ task_id: prerequisite.id, agent_key: agentKey, message: "Too early" }),
      (error) => error.code === "INVALID_STATE",
    );

    await service.startTask({ task_id: prerequisite.id, agent_key: agentKey });
    const sharedComment = await service.addTaskComment({
      task_id: prerequisite.id,
      agent_key: agentKey,
      comment: "Shared MCP integration comment",
      visibility: "shared",
    });
    assert.equal(sharedComment.visibility, "shared");
    await service.reportProgress({ task_id: prerequisite.id, agent_key: agentKey, message: "Implementation complete; running checks." });
    await service.reportBlocker({ task_id: prerequisite.id, agent_key: agentKey, reason: "Waiting for a test fixture." });
    assert.equal((await service.getTask({ task_id: prerequisite.id })).aiBlockedReason, "Waiting for a test fixture.");
    await service.startTask({ task_id: prerequisite.id, agent_key: agentKey });

    const first = await service.submitResolution({
      task_id: prerequisite.id,
      agent_key: agentKey,
      summary: "First resolution attempt",
      changes: ["Added MCP integration"],
      test_results: [{ name: "integration", status: "passed" }],
    });
    assert.equal(first.task.status, "review");
    assert.equal(first.resolution.agentId, operator.id);
    assert.equal(first.resolution.agent.email, operator.email);

    const rejected = await service.requestChanges({ task_id: prerequisite.id, feedback: "Add dependency coverage." });
    assert.equal(rejected.task.status, "in_progress");
    assert.equal(rejected.resolution.status, "changes_requested");
    assert.equal(rejected.resolution.reviewedById, operator.id);

    await service.submitResolution({
      task_id: prerequisite.id,
      agent_key: agentKey,
      summary: "Final resolution with dependency coverage",
      commits: ["test-commit"],
      test_results: [{ name: "all", status: "passed" }],
    });
    const approved = await service.approveResolution({ task_id: prerequisite.id });
    assert.equal(approved.task.status, "done");
    assert.equal(approved.resolution.status, "approved");
    assert.equal(approved.resolution.agentId, operator.id);
    assert.equal(approved.resolution.reviewedById, operator.id);
    assert.ok(approved.task.completedAt);

    await service.startTask({ task_id: dependent.id, agent_key: agentKey });
    const feed = await service.getTaskFeed({ task_id: prerequisite.id });
    assert.ok(feed.filter((entry) => entry.kind === "resolution").length >= 2);
    assert.ok(feed.some((entry) => entry.kind === "comment" && entry.item.content.includes("Implementation complete")));
    assert.ok(feed.filter((entry) => entry.kind === "comment").every((entry) => entry.item.authorId === operator.id && entry.item.author.email === operator.email));
    assert.ok(feed.filter((entry) => entry.kind === "activity").every((entry) => entry.item.actorId === operator.id && entry.item.actor.email === operator.email));
    assert.ok(feed.filter((entry) => entry.kind === "resolution").every((entry) => entry.item.agentId === operator.id && entry.item.agent.email === operator.email));
    assert.equal((await service.getTask({ task_id: prerequisite.id })).resolutions.length, 2);

    const visibleProjects = await service.listProjects();
    assert.ok(visibleProjects.some((item) => item.id === project.id));
  } finally {
    for (const storagePath of uploadedStoragePaths) {
      await deleteBunnyObject(storagePath).catch(() => false);
    }
    await prisma.user.deleteMany({ where: { id: { in: [operator?.id, agent?.id].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { agentKey } });
    await prisma.$disconnect();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
