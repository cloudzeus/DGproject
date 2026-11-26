import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCanApprove,
  buildTaskDescription,
  McpServiceError,
  timerUpdate,
  unfinishedDependencies,
} from "./workflow.mjs";

test("timer starts, pauses and preserves accumulated work", () => {
  const startedAt = new Date("2026-01-01T10:00:00.000Z");
  const task = { status: "todo", inProgressStartedAt: null, inProgressAccumulatedMs: 0n };
  assert.deepEqual(timerUpdate(task, "in_progress", startedAt), { inProgressStartedAt: startedAt });

  const running = { ...task, status: "in_progress", inProgressStartedAt: startedAt };
  const paused = timerUpdate(running, "review", new Date("2026-01-01T10:05:00.000Z"));
  assert.equal(paused.inProgressStartedAt, null);
  assert.equal(paused.inProgressAccumulatedMs, 300000n);
});

test("unfinished dependencies expose the actual blockers", () => {
  const task = {
    dependencies: [
      { dependsOn: { id: "a", title: "Done", status: "done" } },
      { dependsOn: { id: "b", title: "Pending", status: "review" } },
    ],
  };
  assert.deepEqual(unfinishedDependencies(task), [{ id: "b", title: "Pending", status: "review" }]);
});

test("approval respects designated approver, owner and admin", () => {
  const project = { ownerId: "owner", approverId: "approver" };
  assert.doesNotThrow(() => assertCanApprove({ project, user: { id: "owner", role: "member" } }));
  assert.doesNotThrow(() => assertCanApprove({ project, user: { id: "approver", role: "member" } }));
  assert.doesNotThrow(() => assertCanApprove({ project, user: { id: "admin", role: "admin" } }));
  assert.throws(
    () => assertCanApprove({ project, user: { id: "manager", role: "manager" } }),
    (error) => error instanceof McpServiceError && error.code === "FORBIDDEN",
  );
});

test("task feed description includes acceptance criteria and related files", () => {
  const description = buildTaskDescription({
    description: "Fix login",
    acceptance_criteria: ["Existing users can sign in"],
    related_files: ["auth.ts"],
  });
  assert.match(description, /Fix login/);
  assert.match(description, /### Acceptance criteria/);
  assert.match(description, /Existing users can sign in/);
  assert.match(description, /`auth\.ts`/);
});
