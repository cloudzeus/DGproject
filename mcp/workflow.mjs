export class McpServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "McpServiceError";
    this.code = code;
  }
}

export function assertCondition(condition, code, message) {
  if (!condition) throw new McpServiceError(code, message);
}

export function timerUpdate(task, nextStatus, now) {
  const wasRunning = task.status === "in_progress";
  const willRun = nextStatus === "in_progress";
  if (wasRunning === willRun) return {};

  if (wasRunning) {
    const startedAt = task.inProgressStartedAt ?? now;
    const elapsed = Math.max(0, now.getTime() - startedAt.getTime());
    return {
      inProgressStartedAt: null,
      inProgressAccumulatedMs: BigInt(task.inProgressAccumulatedMs ?? 0) + BigInt(elapsed),
    };
  }

  return { inProgressStartedAt: now };
}

export function unfinishedDependencies(task) {
  return (task.dependencies ?? [])
    .map((dependency) => dependency.dependsOn)
    .filter((dependency) => dependency && dependency.status !== "done")
    .map(({ id, title, status }) => ({ id, title, status }));
}

export function hasDependencyCycle(edges, taskId, dependencyIds) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (edge.taskId === taskId) continue;
    if (!adjacency.has(edge.taskId)) adjacency.set(edge.taskId, new Set());
    adjacency.get(edge.taskId).add(edge.dependsOnId);
  }
  adjacency.set(taskId, new Set(dependencyIds));

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return visit(taskId);
}

export function canApprove({ project, user }) {
  if (user.role === "admin" || project.ownerId === user.id) return true;
  return project.approverId != null && project.approverId === user.id;
}

export function assertCanApprove({ project, user }) {
  // Match the PMS rule: a designated approver restricts entry to done. Without
  // one, the configured operator may approve; with one, owner/approver/admin may.
  if (project.approverId != null) {
    assertCondition(
      canApprove({ project, user }),
      "FORBIDDEN",
      "Only the project owner, designated approver, or an admin can approve this resolution.",
    );
  }
}

export function buildTaskDescription({ description, acceptance_criteria = [], related_files = [] }) {
  const sections = [description?.trim() || ""];
  if (acceptance_criteria.length > 0) {
    sections.push(["### Acceptance criteria", ...acceptance_criteria.map((item) => `- ${item}`)].join("\n"));
  }
  if (related_files.length > 0) {
    sections.push(["### Related files", ...related_files.map((item) => `- \`${item}\``)].join("\n"));
  }
  return sections.filter(Boolean).join("\n\n") || null;
}
