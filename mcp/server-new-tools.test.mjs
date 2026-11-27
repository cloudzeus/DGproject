import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.mjs";

test("MCP schemas expose shared comments, task updates and path uploads", async () => {
  const service = {
    addTaskComment: async (args) => args,
    updateTask: async (args) => args,
    uploadTaskAttachment: async (args) => ({ id: "attachment-1", ...args }),
  };
  const server = createMcpServer(service);
  const client = new Client({ name: "mcp-new-tools-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    const pathUpload = tools.find((tool) => tool.name === "upload_task_attachment");
    assert.ok(pathUpload);
    assert.ok(pathUpload.inputSchema.properties.file_path);
    assert.equal(pathUpload.inputSchema.properties.content_base64, undefined);
    assert.ok(tools.some((tool) => tool.name === "update_task"));

    const internalResult = await client.callTool({
      name: "add_task_comment",
      arguments: { task_id: "task-1", agent_key: "test-agent", comment: "Internal" },
    });
    assert.equal(JSON.parse(internalResult.content[0].text).visibility, "internal");

    const sharedResult = await client.callTool({
      name: "add_task_comment",
      arguments: { task_id: "task-1", agent_key: "test-agent", comment: "Shared", visibility: "shared" },
    });
    assert.equal(JSON.parse(sharedResult.content[0].text).visibility, "shared");

    const updateResult = await client.callTool({
      name: "update_task",
      arguments: { task_id: "task-1", agent_key: "test-agent", hours: 2.5, dependencies: { add: ["task-2"] } },
    });
    const update = JSON.parse(updateResult.content[0].text);
    assert.equal(update.hours, 2.5);
    assert.deepEqual(update.dependencies, { add: ["task-2"], remove: [] });

    const uploadResult = await client.callTool({
      name: "upload_task_attachment",
      arguments: { task_id: "task-1", agent_key: "test-agent", file_path: "/tmp/screenshot.png" },
    });
    const upload = JSON.parse(uploadResult.content[0].text);
    assert.equal(upload.file_path, "/tmp/screenshot.png");
    assert.equal(upload.visibility, "internal");
  } finally {
    await client.close();
    await server.close();
  }
});
