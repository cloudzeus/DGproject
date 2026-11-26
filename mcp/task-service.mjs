import {
  McpServiceError,
  assertCanApprove,
  assertCondition,
  buildTaskDescription,
  timerUpdate,
  unfinishedDependencies,
} from "./workflow.mjs";
import {
  decodeFileContent,
  deleteBunnyObject,
  downloadAttachment,
  MAX_ATTACHMENT_BYTES,
  safeFileName,
  uploadAttachmentToBunny,
} from "./attachments.mjs";

const TASK_INCLUDE = {
  project: {
    include: {
      workspace: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true } },
      approver: { select: { id: true, name: true, email: true } },
    },
  },
  activeAIAgent: { select: { id: true, name: true, agentKey: true } },
  assignees: { include: { user: { select: { id: true, name: true, email: true, isAIAgent: true, agentKey: true } } } },
  dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
  comments: { include: { author: { select: { id: true, name: true, email: true, agentKey: true } } }, orderBy: { createdAt: "asc" } },
  attachments: true,
  resolutions: { orderBy: { submittedAt: "desc" } },
};

export class TaskService {
  constructor(prisma, {
    operatorUserId = process.env.MCP_OPERATOR_USER_ID,
    operatorUserEmail = process.env.MCP_OPERATOR_USER_EMAIL,
    now = () => new Date(),
  } = {}) {
    this.prisma = prisma;
    this.operatorUserId = operatorUserId?.trim() || null;
    this.operatorUserEmail = operatorUserEmail?.trim() || null;
    this.now = now;
  }

  async operator(tx = this.prisma) {
    assertCondition(this.operatorUserEmail || this.operatorUserId, "CONFIGURATION_REQUIRED", "Set MCP_OPERATOR_USER_EMAIL (recommended) or MCP_OPERATOR_USER_ID for user assignments and reviews.");
    const where = this.operatorUserEmail ? { email: this.operatorUserEmail } : { id: this.operatorUserId };
    const user = await tx.user.findUnique({ where });
    assertCondition(user && !user.isAIAgent, "OPERATOR_NOT_FOUND", "The configured MCP operator user does not exist or is an AI agent. Sign in to the PMS with that Microsoft account first.");
    return user;
  }

  async agent(tx, agentKey) {
    const agent = await tx.user.findUnique({ where: { agentKey } });
    assertCondition(agent?.isAIAgent, "AGENT_NOT_FOUND", `AI agent '${agentKey}' is not registered. Call register_agent first.`);
    return agent;
  }

  async registerAgent({ agent_key, display_name }) {
    return this.prisma.user.upsert({
      where: { agentKey: agent_key },
      create: {
        email: `agent-${agent_key}@mcp.local`,
        name: display_name,
        agentKey: agent_key,
        isAIAgent: true,
        userType: "employee",
        role: "member",
      },
      update: { name: display_name, isAIAgent: true, userType: "employee" },
      select: { id: true, name: true, agentKey: true, isAIAgent: true, createdAt: true },
    });
  }

  async listAgents() {
    return this.prisma.user.findMany({
      where: { isAIAgent: true },
      select: { id: true, name: true, agentKey: true, createdAt: true },
      orderBy: { name: "asc" },
    });
  }

  async listProjects() {
    return this.prisma.project.findMany({
      include: {
        workspace: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
        tasks: { select: { id: true, status: true, activeAIAgentId: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getProjectContext({ project_id }) {
    const project = await this.prisma.project.findUnique({
      where: { id: project_id },
      include: {
        workspace: { select: { id: true, name: true, description: true } },
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true, isAIAgent: true, agentKey: true } } } },
        tasks: {
          select: { id: true, title: true, status: true, priority: true, activeAIAgentId: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
        },
        attachments: true,
      },
    });
    assertCondition(project, "PROJECT_NOT_FOUND", `Project '${project_id}' was not found.`);
    return project;
  }

  async listTasks({ project_id, status, priority, assigned_to }) {
    let activeAIAgentId;
    if (assigned_to) activeAIAgentId = (await this.agent(this.prisma, assigned_to)).id;
    return this.prisma.task.findMany({
      where: {
        projectId: project_id,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(activeAIAgentId ? { activeAIAgentId } : {}),
      },
      include: {
        activeAIAgent: { select: { id: true, name: true, agentKey: true } },
        assignees: { include: { user: { select: { id: true, name: true, email: true, isAIAgent: true, agentKey: true } } } },
        dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
        _count: { select: { comments: true, resolutions: true } },
      },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    });
  }

  async getTask({ task_id }) {
    const task = await this.prisma.task.findUnique({ where: { id: task_id }, include: TASK_INCLUDE });
    assertCondition(task, "TASK_NOT_FOUND", `Task '${task_id}' was not found.`);
    return task;
  }

  async getTaskFeed({ task_id, limit = 100 }) {
    await this.getTask({ task_id });
    const [comments, activities, resolutions] = await Promise.all([
      this.prisma.comment.findMany({ where: { taskId: task_id }, include: { author: { select: { id: true, name: true, agentKey: true } } } }),
      this.prisma.activity.findMany({ where: { taskId: task_id }, include: { actor: { select: { id: true, name: true, agentKey: true } } } }),
      this.prisma.taskResolution.findMany({ where: { taskId: task_id }, include: { agent: { select: { id: true, name: true, agentKey: true } }, reviewedBy: { select: { id: true, name: true } } } }),
    ]);

    const feed = [
      ...comments.map((item) => ({ kind: "comment", at: item.createdAt, item })),
      ...activities.map((item) => ({ kind: "activity", at: item.createdAt, item })),
      ...resolutions.map((item) => ({ kind: "resolution", at: item.submittedAt, item })),
    ];
    return feed.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  }

  async listFiles({ task_id, project_id }) {
    assertCondition(Boolean(task_id) !== Boolean(project_id), "INVALID_PARENT", "Provide exactly one of task_id or project_id.");
    if (task_id) {
      assertCondition(await this.prisma.task.findUnique({ where: { id: task_id }, select: { id: true } }), "TASK_NOT_FOUND", `Task '${task_id}' was not found.`);
    } else {
      assertCondition(await this.prisma.project.findUnique({ where: { id: project_id }, select: { id: true } }), "PROJECT_NOT_FOUND", `Project '${project_id}' was not found.`);
    }
    return this.prisma.attachment.findMany({
      where: task_id ? { taskId: task_id } : { projectId: project_id },
      include: { uploadedBy: { select: { id: true, name: true, agentKey: true, isAIAgent: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async readFile({ attachment_id }) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachment_id },
      include: { uploadedBy: { select: { id: true, name: true, agentKey: true, isAIAgent: true } } },
    });
    assertCondition(attachment, "ATTACHMENT_NOT_FOUND", `Attachment '${attachment_id}' was not found.`);
    return downloadAttachment(attachment);
  }

  async uploadFile(input) {
    assertCondition(Boolean(input.task_id) !== Boolean(input.project_id), "INVALID_PARENT", "Provide exactly one of task_id or project_id.");
    const agent = await this.agent(this.prisma, input.agent_key);
    const task = input.task_id
      ? await this.prisma.task.findUnique({ where: { id: input.task_id }, include: { project: true } })
      : null;
    const project = task
      ? task.project
      : await this.prisma.project.findUnique({ where: { id: input.project_id } });
    assertCondition(project, "PARENT_NOT_FOUND", "The target project or task was not found.");
    if (task) {
      assertCondition(task.activeAIAgentId === agent.id, "NOT_ASSIGNED", "Only the assigned AI agent can upload files to this task.");
    }

    const buffer = decodeFileContent(input);
    assertCondition(buffer.length > 0, "EMPTY_FILE", "Empty files cannot be uploaded.");
    assertCondition(buffer.length <= MAX_ATTACHMENT_BYTES, "FILE_TOO_LARGE", `Files cannot exceed ${MAX_ATTACHMENT_BYTES} bytes.`);
    const fileName = safeFileName(input.file_name);
    const mimeType = (input.mime_type ?? (input.text_content != null ? "text/plain" : "application/octet-stream")).toLowerCase();
    assertCondition(/^[\w.+-]+\/[\w.+-]+$/.test(mimeType), "INVALID_MIME_TYPE", "A valid MIME type is required.");
    const parentKind = task ? "task" : "project";
    const parentId = task?.id ?? project.id;
    const uploaded = await uploadAttachmentToBunny({ parentKind, parentId, fileName, mimeType, buffer });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const attachment = await tx.attachment.create({
          data: {
            taskId: task?.id ?? null,
            projectId: project.id,
            name: fileName,
            title: input.title?.trim() || null,
            size: buffer.length,
            mimeType,
            url: uploaded.url,
            source: "local",
            visibility: input.visibility ?? "internal",
            uploadedById: agent.id,
          },
          include: { uploadedBy: { select: { id: true, name: true, agentKey: true, isAIAgent: true } } },
        });
        await tx.activity.create({
          data: {
            workspaceId: project.workspaceId,
            projectId: project.id,
            taskId: task?.id ?? null,
            actorId: agent.id,
            action: "updated",
            targetType: task ? "task" : "project",
            metadata: { source: "mcp", event: "file_uploaded", attachmentId: attachment.id, fileName, parentKind },
          },
        });
        return attachment;
      });
    } catch (error) {
      await deleteBunnyObject(uploaded.storagePath).catch(() => false);
      throw error;
    }
  }

  async createTask(input) {
    const operator = await this.operator();
    const project = await this.prisma.project.findUnique({ where: { id: input.project_id }, select: { id: true, workspaceId: true } });
    assertCondition(project, "PROJECT_NOT_FOUND", `Project '${input.project_id}' was not found.`);

    if (input.dependency_task_ids?.length) {
      const dependencies = await this.prisma.task.findMany({ where: { id: { in: input.dependency_task_ids } }, select: { id: true, projectId: true } });
      assertCondition(dependencies.length === new Set(input.dependency_task_ids).size, "INVALID_DEPENDENCY", "One or more dependency tasks do not exist.");
      assertCondition(dependencies.every((item) => item.projectId === input.project_id), "INVALID_DEPENDENCY", "Dependencies must belong to the same project.");
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          projectId: input.project_id,
          title: input.title,
          description: buildTaskDescription(input),
          priority: input.priority ?? "medium",
          status: "todo",
          visibility: input.visibility ?? "internal",
          dueDate: input.due_date ? new Date(input.due_date) : null,
          estimatedHours: input.estimated_hours ?? null,
          addToCalendar: false,
          addToTeams: false,
          createdById: operator.id,
          dependencies: input.dependency_task_ids?.length
            ? { create: input.dependency_task_ids.map((dependsOnId) => ({ dependsOn: { connect: { id: dependsOnId } } })) }
            : undefined,
        },
        include: TASK_INCLUDE,
      });
      await this.logActivity(tx, { task, actorId: operator.id, action: "created", metadata: { source: "mcp" } });
      return task;
    });
  }

  async assignTasks({ task_ids, agent_key, force = false }) {
    const operator = await this.operator();
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.agent(tx, agent_key);
      const assigned = [];
      for (const taskId of task_ids) {
        const task = await tx.task.findUnique({ where: { id: taskId }, include: { project: true, activeAIAgent: true } });
        assertCondition(task, "TASK_NOT_FOUND", `Task '${taskId}' was not found.`);
        assertCondition(task.status !== "done" && task.status !== "review", "INVALID_STATE", `Task '${task.title}' cannot be assigned while ${task.status}.`);
        assertCondition(
          force || !task.activeAIAgentId || task.activeAIAgentId === agent.id,
          "ASSIGNMENT_CONFLICT",
          `Task '${task.title}' is assigned to '${task.activeAIAgent?.agentKey}'. Use force=true to reassign it.`,
        );

        await tx.taskAssignee.upsert({
          where: { taskId_userId: { taskId, userId: agent.id } },
          create: { taskId, userId: agent.id },
          update: {},
        });
        const updated = await tx.task.update({
          where: { id: taskId },
          data: {
            activeAIAgentId: agent.id,
            aiBlockedReason: null,
            ...(task.status === "backlog" ? { status: "todo" } : {}),
          },
          include: TASK_INCLUDE,
        });
        await this.logActivity(tx, { task, actorId: operator.id, action: "assigned", metadata: { source: "mcp", agentKey: agent_key, previousAgentId: task.activeAIAgentId, force } });
        assigned.push(updated);
      }
      return assigned;
    });
  }

  async startTask({ task_id, agent_key }) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.agent(tx, agent_key);
      const task = await this.requireAssignedTask(tx, task_id, agent.id);
      assertCondition(!["review", "done"].includes(task.status), "INVALID_STATE", `A ${task.status} task cannot be started.`);
      const pending = unfinishedDependencies(task);
      assertCondition(pending.length === 0, "DEPENDENCIES_PENDING", "Task dependencies must be done before work starts.", { dependencies: pending });
      const now = this.now();
      const updated = await tx.task.update({
        where: { id: task_id },
        data: {
          status: "in_progress",
          aiBlockedReason: null,
          startDate: task.startDate ?? now,
          ...timerUpdate(task, "in_progress", now),
        },
        include: TASK_INCLUDE,
      });
      await this.logActivity(tx, { task, actorId: agent.id, action: "moved", metadata: { source: "mcp", from: task.status, to: "in_progress", resumed: Boolean(task.aiBlockedReason) } });
      return updated;
    });
  }

  async releaseTask({ task_id, agent_key }) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.agent(tx, agent_key);
      const task = await this.requireAssignedTask(tx, task_id, agent.id);
      assertCondition(!["review", "done"].includes(task.status), "INVALID_STATE", `A ${task.status} task cannot be released.`);
      const now = this.now();
      const updated = await tx.task.update({
        where: { id: task_id },
        data: {
          activeAIAgentId: null,
          aiBlockedReason: null,
          status: "todo",
          ...timerUpdate(task, "todo", now),
        },
        include: TASK_INCLUDE,
      });
      await tx.taskAssignee.deleteMany({ where: { taskId, userId: agent.id } });
      await this.logActivity(tx, { task, actorId: agent.id, action: "updated", metadata: { source: "mcp", event: "assignment_released", from: task.status, to: "todo" } });
      return updated;
    });
  }

  async reportProgress({ task_id, agent_key, message }) {
    return this.addAgentComment({ task_id, agent_key, content: message, event: "progress" });
  }

  async addTaskComment({ task_id, agent_key, comment }) {
    return this.addAgentComment({ task_id, agent_key, content: comment, event: "comment" });
  }

  async addAgentComment({ task_id, agent_key, content, event }) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.agent(tx, agent_key);
      const task = await this.requireAssignedTask(tx, task_id, agent.id);
      assertCondition(task.status === "in_progress", "INVALID_STATE", "Start the task before adding progress or comments.");
      const comment = await tx.comment.create({ data: { taskId: task_id, authorId: agent.id, content, visibility: "internal" } });
      await this.logActivity(tx, { task, actorId: agent.id, action: "commented", metadata: { source: "mcp", event, commentId: comment.id } });
      return comment;
    });
  }

  async reportBlocker({ task_id, agent_key, reason }) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.agent(tx, agent_key);
      const task = await this.requireAssignedTask(tx, task_id, agent.id);
      assertCondition(task.status === "in_progress", "INVALID_STATE", "Only an in-progress task can be blocked.");
      const updated = await tx.task.update({ where: { id: task_id }, data: { aiBlockedReason: reason }, include: TASK_INCLUDE });
      const comment = await tx.comment.create({ data: { taskId: task_id, authorId: agent.id, content: `[BLOCKED] ${reason}`, visibility: "internal" } });
      await this.logActivity(tx, { task, actorId: agent.id, action: "updated", metadata: { source: "mcp", event: "blocked", reason, commentId: comment.id } });
      return updated;
    });
  }

  async submitResolution(input) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.agent(tx, input.agent_key);
      const task = await this.requireAssignedTask(tx, input.task_id, agent.id);
      assertCondition(task.status === "in_progress", "INVALID_STATE", "Only an in-progress task can submit a resolution.");
      const now = this.now();
      const resolution = await tx.taskResolution.create({
        data: {
          taskId: input.task_id,
          agentId: agent.id,
          summary: input.summary,
          changes: input.changes ?? [],
          commits: input.commits ?? [],
          testResults: input.test_results ?? [],
          artifacts: input.artifacts ?? [],
          remainingIssues: input.remaining_issues ?? null,
        },
      });
      const updated = await tx.task.update({
        where: { id: input.task_id },
        data: { status: "review", aiBlockedReason: null, ...timerUpdate(task, "review", now) },
        include: TASK_INCLUDE,
      });
      await this.logActivity(tx, { task, actorId: agent.id, action: "moved", metadata: { source: "mcp", from: task.status, to: "review", resolutionId: resolution.id } });
      return { task: updated, resolution };
    });
  }

  async requestChanges({ task_id, feedback }) {
    const operator = await this.operator();
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: task_id }, include: { project: true, resolutions: { orderBy: { submittedAt: "desc" }, take: 1 } } });
      assertCondition(task, "TASK_NOT_FOUND", `Task '${task_id}' was not found.`);
      assertCondition(task.status === "review" && task.resolutions[0]?.status === "submitted", "INVALID_STATE", "The task has no submitted resolution awaiting review.");
      const now = this.now();
      const resolution = await tx.taskResolution.update({
        where: { id: task.resolutions[0].id },
        data: { status: "changes_requested", reviewFeedback: feedback, reviewedById: operator.id, reviewedAt: now },
      });
      const updated = await tx.task.update({
        where: { id: task_id },
        data: { status: "in_progress", ...timerUpdate(task, "in_progress", now) },
        include: TASK_INCLUDE,
      });
      await tx.comment.create({ data: { taskId: task_id, authorId: operator.id, content: `[CHANGES REQUESTED] ${feedback}`, visibility: "internal" } });
      await this.logActivity(tx, { task, actorId: operator.id, action: "moved", metadata: { source: "mcp", from: "review", to: "in_progress", resolutionId: resolution.id, feedback } });
      return { task: updated, resolution };
    });
  }

  async approveResolution({ task_id }) {
    const operator = await this.operator();
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: task_id }, include: { project: true, resolutions: { orderBy: { submittedAt: "desc" }, take: 1 } } });
      assertCondition(task, "TASK_NOT_FOUND", `Task '${task_id}' was not found.`);
      assertCondition(task.status === "review" && task.resolutions[0]?.status === "submitted", "INVALID_STATE", "The task has no submitted resolution awaiting review.");
      assertCanApprove({ project: task.project, user: operator });
      const now = this.now();
      const resolution = await tx.taskResolution.update({
        where: { id: task.resolutions[0].id },
        data: { status: "approved", reviewedById: operator.id, reviewedAt: now },
      });
      const updated = await tx.task.update({
        where: { id: task_id },
        data: { status: "done", completedAt: now, ...timerUpdate(task, "done", now) },
        include: TASK_INCLUDE,
      });
      await this.logActivity(tx, { task, actorId: operator.id, action: "completed", metadata: { source: "mcp", resolutionId: resolution.id } });
      return { task: updated, resolution };
    });
  }

  async requireAssignedTask(tx, taskId, agentId) {
    const task = await tx.task.findUnique({ where: { id: taskId }, include: TASK_INCLUDE });
    assertCondition(task, "TASK_NOT_FOUND", `Task '${taskId}' was not found.`);
    assertCondition(task.activeAIAgentId === agentId, "NOT_ASSIGNED", "This task is not assigned to the calling AI agent.");
    return task;
  }

  async logActivity(tx, { task, actorId, action, metadata }) {
    return tx.activity.create({
      data: {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        actorId,
        action,
        targetType: "task",
        metadata,
      },
    });
  }
}

export function toMcpResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2) }],
  };
}

export function toMcpError(error) {
  const code = error instanceof McpServiceError ? error.code : "INTERNAL_ERROR";
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: { code, message: error.message } }, null, 2) }],
  };
}
