import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toMcpError, toMcpResult } from "./task-service.mjs";
import { attachmentToMcpResult } from "./attachments.mjs";

const agentKey = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,48}$/, "Use 2-49 lowercase letters, digits, dots, underscores, or hyphens.");
const taskStatus = z.enum(["backlog", "todo", "in_progress", "review", "done"]);
const taskPriority = z.enum(["low", "medium", "high", "urgent"]);

export function createMcpServer(service) {
  const server = new McpServer({ name: "a-sisyphus-project-tasks", version: "1.0.0" });

  function register(name, description, inputSchema, handler) {
    server.registerTool(name, { description, inputSchema }, async (args) => {
      try {
        return toMcpResult(await handler(args));
      } catch (error) {
        console.error(`[mcp:${name}]`, error);
        return toMcpError(error);
      }
    });
  }

  register("register_agent", "Register or rename the calling AI agent. Use a stable agent_key in every subsequent call.", {
    agent_key: agentKey,
    display_name: z.string().min(1).max(100),
  }, (args) => service.registerAgent(args));

  register("list_agents", "List AI agents registered in the PMS.", {}, () => service.listAgents());

  register("list_projects", "List real PMS projects with their tasks and approval owners.", {}, () => service.listProjects());

  register("get_project_context", "Get a PMS project, workspace, members, tasks and attachments.", {
    project_id: z.string().min(1),
  }, (args) => service.getProjectContext(args));

  register("list_tasks", "List real PMS tasks. Filter by project, status, priority or assigned AI agent.", {
    project_id: z.string().min(1),
    status: taskStatus.optional(),
    priority: taskPriority.optional(),
    assigned_to: agentKey.optional(),
  }, (args) => service.listTasks(args));

  register("get_task", "Get the full task package: project context, assignees, dependencies, comments, attachments and resolutions.", {
    task_id: z.string().min(1),
  }, (args) => service.getTask(args));

  register("get_task_feed", "Get the combined task feed of PMS comments, activities and resolution attempts, newest first.", {
    task_id: z.string().min(1),
    limit: z.number().int().min(1).max(500).default(100),
  }, (args) => service.getTaskFeed(args));

  register("list_files", "List real PMS attachments for one task, or all attachments belonging to one project.", {
    task_id: z.string().min(1).optional(),
    project_id: z.string().min(1).optional(),
  }, (args) => service.listFiles(args));

  server.registerTool("read_file", {
    description: "Read a PMS attachment from the CDN. Returns text inline, screenshots as MCP image content, and other binary files as embedded resources. Maximum 10 MiB.",
    inputSchema: { attachment_id: z.string().min(1) },
  }, async (args) => {
    try {
      return attachmentToMcpResult(await service.readFile(args));
    } catch (error) {
      console.error("[mcp:read_file]", error);
      return toMcpError(error);
    }
  });

  register("upload_file", "Upload a file up to 10 MiB to one PMS project or assigned task using the existing Bunny CDN. Provide exactly one parent and either text_content or canonical content_base64.", {
    task_id: z.string().min(1).optional(),
    project_id: z.string().min(1).optional(),
    agent_key: agentKey,
    file_name: z.string().min(1).max(255),
    title: z.string().max(500).optional(),
    mime_type: z.string().max(150).optional(),
    text_content: z.string().max(10 * 1024 * 1024).optional(),
    content_base64: z.string().max(14_000_000).optional(),
    visibility: z.enum(["internal", "shared"]).default("internal"),
  }, (args) => service.uploadFile(args));

  register("create_task", "Create a task in the real PMS as the configured human operator. Acceptance criteria and related files are added to its description.", {
    project_id: z.string().min(1),
    title: z.string().min(1).max(500),
    description: z.string().max(30000).optional(),
    acceptance_criteria: z.array(z.string().min(1)).max(100).default([]),
    related_files: z.array(z.string().min(1)).max(100).default([]),
    priority: taskPriority.default("medium"),
    visibility: z.enum(["internal", "shared"]).default("internal"),
    dependency_task_ids: z.array(z.string().min(1)).max(100).default([]),
    due_date: z.string().datetime().optional(),
    estimated_hours: z.number().positive().max(100000).optional(),
  }, (args) => service.createTask(args));

  register("assign_tasks", "Assign selected PMS tasks to an AI agent on behalf of the human operator. Existing agents are protected unless force=true.", {
    task_ids: z.array(z.string().min(1)).min(1).max(50),
    agent_key: agentKey,
    force: z.boolean().default(false),
  }, (args) => service.assignTasks(args));

  register("start_task", "Start an assigned task after checking that every PMS dependency is done. Also resumes a blocked task.", {
    task_id: z.string().min(1),
    agent_key: agentKey,
  }, (args) => service.startTask(args));

  register("release_task", "Release the calling agent's assignment and return the task to todo.", {
    task_id: z.string().min(1),
    agent_key: agentKey,
  }, (args) => service.releaseTask(args));

  register("report_progress", "Add an internal progress update to the PMS task feed.", {
    task_id: z.string().min(1),
    agent_key: agentKey,
    message: z.string().min(1).max(5000),
  }, (args) => service.reportProgress(args));

  register("add_task_comment", "Add an internal AI comment to the PMS task feed.", {
    task_id: z.string().min(1),
    agent_key: agentKey,
    comment: z.string().min(1).max(5000),
  }, (args) => service.addTaskComment(args));

  register("report_blocker", "Mark an in-progress AI task as blocked and record the reason in the PMS feed.", {
    task_id: z.string().min(1),
    agent_key: agentKey,
    reason: z.string().min(1).max(5000),
  }, (args) => service.reportBlocker(args));

  register("submit_resolution", "Submit a resolution attempt and move the PMS task to review. It is not done until human approval.", {
    task_id: z.string().min(1),
    agent_key: agentKey,
    summary: z.string().min(1).max(30000),
    changes: z.array(z.string().min(1)).max(500).default([]),
    commits: z.array(z.string().min(1)).max(100).default([]),
    test_results: z.array(z.object({
      name: z.string().min(1),
      status: z.enum(["passed", "failed", "skipped"]),
      details: z.string().max(10000).optional(),
    })).max(200).default([]),
    artifacts: z.array(z.string().min(1)).max(200).default([]),
    remaining_issues: z.string().max(10000).optional(),
  }, (args) => service.submitResolution(args));

  register("request_changes", "Reject the latest submitted resolution with human feedback and return the task to the AI agent.", {
    task_id: z.string().min(1),
    feedback: z.string().min(1).max(10000),
  }, (args) => service.requestChanges(args));

  register("approve_resolution", "Approve the latest resolution as the configured operator and mark the PMS task done, respecting project approver rules.", {
    task_id: z.string().min(1),
  }, (args) => service.approveResolution(args));

  return server;
}
