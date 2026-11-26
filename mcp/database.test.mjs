import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
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

    const workspace = await prisma.workspace.create({
      data: { name: `MCP Test Workspace ${suffix}`, ownerId: operator.id },
    });
    const project = await prisma.project.create({
      data: {
        name: `MCP Test Project ${suffix}`,
        workspaceId: workspace.id,
        ownerId: operator.id,
        approverId: operator.id,
        color: "#0078D4",
        icon: "TestTube",
      },
    });

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

    await service.assignTasks({ task_ids: [prerequisite.id, dependent.id], agent_key: agentKey });

    const projectFile = await service.uploadFile({
      project_id: project.id,
      agent_key: agentKey,
      file_name: "notes.txt",
      text_content: "PMS project attachment integration",
      mime_type: "text/plain",
    });
    uploadedStoragePaths.push(new URL(projectFile.url).pathname.slice(1));
    const taskScreenshot = await service.uploadFile({
      task_id: prerequisite.id,
      agent_key: agentKey,
      file_name: "screenshot.png",
      content_base64: PNG_BASE64,
      mime_type: "image/png",
    });
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

    const rejected = await service.requestChanges({ task_id: prerequisite.id, feedback: "Add dependency coverage." });
    assert.equal(rejected.task.status, "in_progress");
    assert.equal(rejected.resolution.status, "changes_requested");

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
    assert.ok(approved.task.completedAt);

    await service.startTask({ task_id: dependent.id, agent_key: agentKey });
    const feed = await service.getTaskFeed({ task_id: prerequisite.id });
    assert.ok(feed.filter((entry) => entry.kind === "resolution").length >= 2);
    assert.ok(feed.some((entry) => entry.kind === "comment" && entry.item.content.includes("Implementation complete")));
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
  }
});
