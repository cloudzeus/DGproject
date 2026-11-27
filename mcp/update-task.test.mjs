import test from "node:test";
import assert from "node:assert/strict";
import { TaskService } from "./task-service.mjs";

function createUpdateFixture() {
  const operator = { id: "operator-1", email: "operator@example.com", isAIAgent: false };
  const agent = { id: "agent-1", agentKey: "test-agent", isAIAgent: true };
  const tasks = ["task-1", "task-2", "task-3"].map((id) => ({
    id,
    projectId: "project-1",
    status: "todo",
    activeAIAgentId: agent.id,
    estimatedHours: null,
    project: { workspaceId: "workspace-1" },
  }));
  tasks.push({
    id: "other-project-task",
    projectId: "project-2",
    status: "todo",
    activeAIAgentId: agent.id,
    estimatedHours: null,
    project: { workspaceId: "workspace-2" },
  });
  let dependencies = [{ taskId: "task-1", dependsOnId: "task-2" }];
  const activities = [];

  function taskWithDependencies(task) {
    return {
      ...task,
      dependencies: dependencies
        .filter((dependency) => dependency.taskId === task.id)
        .map((dependency) => ({
          ...dependency,
          dependsOn: tasks.find((candidate) => candidate.id === dependency.dependsOnId),
        })),
    };
  }

  const tx = {
    user: { findUnique: async ({ where }) => where.agentKey ? agent : operator },
    task: {
      findUnique: async ({ where }) => {
        const task = tasks.find((candidate) => candidate.id === where.id);
        return task ? taskWithDependencies(task) : null;
      },
      findMany: async ({ where }) => tasks.filter((task) => where.id.in.includes(task.id)),
      update: async ({ where, data }) => {
        const task = tasks.find((candidate) => candidate.id === where.id);
        Object.assign(task, data);
        return taskWithDependencies(task);
      },
    },
    taskDependency: {
      findMany: async () => dependencies.map((dependency) => ({ ...dependency })),
      deleteMany: async ({ where }) => {
        dependencies = dependencies.filter((dependency) => !(
          dependency.taskId === where.taskId && where.dependsOnId.in.includes(dependency.dependsOnId)
        ));
      },
      upsert: async ({ where, create }) => {
        const key = where.taskId_dependsOnId;
        if (!dependencies.some((dependency) => dependency.taskId === key.taskId && dependency.dependsOnId === key.dependsOnId)) {
          dependencies.push({ ...create });
        }
      },
    },
    activity: { create: async ({ data }) => { activities.push(data); return data; } },
  };
  const service = new TaskService({ ...tx, $transaction: async (callback) => callback(tx) }, { operatorUserEmail: operator.email });
  return {
    service,
    agent,
    tasks,
    activities,
    dependencyIds: (taskId) => dependencies.filter((dependency) => dependency.taskId === taskId).map((dependency) => dependency.dependsOnId),
  };
}

test("update_task writes hours and incrementally changes real dependencies", async () => {
  const fixture = createUpdateFixture();
  const updated = await fixture.service.updateTask({
    task_id: "task-1",
    agent_key: fixture.agent.agentKey,
    hours: 3.5,
    dependencies: { add: ["task-3", "task-3"], remove: ["task-2"] },
  });

  assert.equal(updated.estimatedHours, 3.5);
  assert.deepEqual(fixture.dependencyIds("task-1"), ["task-3"]);
  assert.equal(fixture.tasks[1].estimatedHours, null);
  assert.equal(fixture.activities.length, 1);
  assert.equal(fixture.activities[0].metadata.event, "task_details_updated");
  assert.deepEqual(fixture.activities[0].metadata.addedDependencies, ["task-3"]);
});

test("update_task rejects cycles and cross-project dependencies without writes", async () => {
  const fixture = createUpdateFixture();
  await assert.rejects(
    fixture.service.updateTask({ task_id: "task-2", agent_key: fixture.agent.agentKey, dependencies: { add: ["task-1"] } }),
    (error) => error.code === "DEPENDENCY_CYCLE",
  );
  await assert.rejects(
    fixture.service.updateTask({ task_id: "task-1", agent_key: fixture.agent.agentKey, dependencies: { add: ["other-project-task"] } }),
    (error) => error.code === "INVALID_DEPENDENCY",
  );
  assert.deepEqual(fixture.dependencyIds("task-1"), ["task-2"]);
  assert.deepEqual(fixture.dependencyIds("task-2"), []);
  assert.equal(fixture.activities.length, 0);
});

test("update_task requires a real change and preserves existing dependencies on repeat", async () => {
  const fixture = createUpdateFixture();
  await assert.rejects(
    fixture.service.updateTask({ task_id: "task-1", agent_key: fixture.agent.agentKey }),
    (error) => error.code === "NO_CHANGES",
  );
  await fixture.service.updateTask({ task_id: "task-1", agent_key: fixture.agent.agentKey, dependencies: { add: ["task-2"] } });
  assert.deepEqual(fixture.dependencyIds("task-1"), ["task-2"]);
});
