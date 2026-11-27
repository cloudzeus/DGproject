import test from "node:test";
import assert from "node:assert/strict";
import { TaskService } from "./task-service.mjs";

function createEmailFixture({ sendError = null } = {}) {
  const operator = { id: "operator-1", email: "operator@example.com", role: "admin", isAIAgent: false };
  const agent = { id: "agent-1", agentKey: "test-agent", isAIAgent: true };
  const task = {
    id: "task-1",
    projectId: "project-1",
    title: "Customer question",
    status: "done",
    activeAIAgentId: agent.id,
    createdById: operator.id,
    project: { id: "project-1", name: "Project", ownerId: operator.id, approverId: null },
    assignees: [{ userId: operator.id }],
    resolutions: [{ id: "resolution-1", status: "approved", summary: "The answer" }],
  };
  let storedMessage = null;
  const sentCalls = [];
  const prisma = {
    user: {
      findUnique: async ({ where }) => where.agentKey ? agent : operator,
    },
    task: {
      findUnique: async () => task,
    },
    emailMessage: {
      findFirst: async () => storedMessage,
      create: async ({ data }) => {
        storedMessage = { id: "email-1", ingestedAt: new Date(), ...data };
        return storedMessage;
      },
      update: async ({ data }) => {
        storedMessage = { ...storedMessage, ...data };
        return storedMessage;
      },
    },
  };
  const resolutionEmail = {
    render: ({ subject }) => ({ subject: subject?.trim() || "Rendered subject", html: "<p>The answer</p>" }),
    sendMail: async (...args) => {
      sentCalls.push(args);
      if (sendError) throw sendError;
    },
  };
  const service = new TaskService(prisma, {
    operatorUserEmail: operator.email,
    now: () => new Date("2026-11-26T20:00:00.000Z"),
    resolutionEmail,
  });
  return { service, sentCalls, getMessage: () => storedMessage, operator };
}

test("resolution email sends once, normalizes recipients and persists the audit row", async () => {
  const fixture = createEmailFixture();
  const input = {
    task_id: "task-1",
    agent_key: "test-agent",
    to: ["Person@Example.com"],
    cc: ["person@example.com", "Copy@Example.com"],
  };

  const first = await fixture.service.sendTaskResolutionEmail(input);
  assert.equal(first.already_sent, false);
  assert.equal(first.email.status, "sent");
  assert.equal(first.email.toAddresses, "person@example.com");
  assert.equal(first.email.ccAddresses, "copy@example.com");
  assert.equal(first.email.appliedNote, "mcp_resolution:resolution-1");
  assert.equal(first.email.sentAt.toISOString(), "2026-11-26T20:00:00.000Z");
  assert.equal(fixture.sentCalls.length, 1);
  assert.equal(fixture.sentCalls[0][0], fixture.operator.id);
  assert.deepEqual(fixture.sentCalls[0][1].to, ["person@example.com"]);
  assert.deepEqual(fixture.sentCalls[0][1].cc, ["copy@example.com"]);

  const second = await fixture.service.sendTaskResolutionEmail(input);
  assert.equal(second.already_sent, true);
  assert.equal(fixture.sentCalls.length, 1);
});

test("Outlook failure is returned and persisted without pretending the email was sent", async () => {
  const fixture = createEmailFixture({ sendError: new Error("Mailbox unavailable") });
  await assert.rejects(
    fixture.service.sendTaskResolutionEmail({ task_id: "task-1", agent_key: "test-agent", to: ["person@example.com"] }),
    (error) => error.code === "EMAIL_SEND_FAILED" && error.message.includes("Mailbox unavailable"),
  );
  assert.equal(fixture.getMessage().status, "failed");
  assert.equal(fixture.getMessage().sentAt, null);
  assert.match(fixture.getMessage().appliedNote, /send_failed: Mailbox unavailable/);
});

test("MCP status changes reuse the full PMS notification payload", async () => {
  const calls = [];
  const service = new TaskService({}, { onStatusChange: async (payload) => calls.push(payload) });
  const task = {
    id: "task-1",
    projectId: "project-1",
    title: "Task",
    status: "review",
    createdById: "creator-1",
    project: { name: "Project", approverId: "approver-1", ownerId: "owner-1" },
    assignees: [{ userId: "assignee-1" }],
  };
  await service.emitStatusChange({ task, from: "in_progress", actorId: "operator-1" });
  assert.deepEqual(calls, [{
    taskId: "task-1",
    projectId: "project-1",
    actorId: "operator-1",
    from: "in_progress",
    to: "review",
    approverId: "approver-1",
    taskTitle: "Task",
    projectName: "Project",
    createdById: "creator-1",
    ownerId: "owner-1",
    assigneeIds: ["assignee-1"],
  }]);
});
