import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.mjs";
import { McpServiceError } from "./workflow.mjs";

test("MCP protocol exposes the PMS workflow and serializes results", async () => {
  const service = {
    listProjects: async () => [{ id: "project-1", name: "PMS", elapsed: 12n }],
    getTask: async () => { throw new McpServiceError("TASK_NOT_FOUND", "Missing test task"); },
  };
  const server = createMcpServer(service);
  const client = new Client({ name: "mcp-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 21);
    for (const name of ["list_projects", "create_project", "assign_tasks", "report_progress", "submit_resolution", "approve_resolution", "list_files", "read_file", "upload_file"]) {
      assert.ok(tools.some((tool) => tool.name === name), `Missing MCP tool: ${name}`);
    }

    const result = await client.callTool({ name: "list_projects", arguments: {} });
    assert.notEqual(result.isError, true);
    const projects = JSON.parse(result.content[0].text);
    assert.equal(projects[0].id, "project-1");
    assert.equal(projects[0].elapsed, "12");

    const missing = await client.callTool({ name: "get_task", arguments: { task_id: "missing" } });
    assert.equal(missing.isError, true);
    assert.equal(JSON.parse(missing.content[0].text).error.code, "TASK_NOT_FOUND");
  } finally {
    await client.close();
    await server.close();
  }
});
