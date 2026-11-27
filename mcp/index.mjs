import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.mjs";
import { TaskService } from "./task-service.mjs";
import appServices from "./app-services.cjs";

// MCP clients do not necessarily start the process with this repository as cwd.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const prisma = new PrismaClient({ log: ["error"] });
const app = appServices.loadAppServices();
const service = new TaskService(prisma, {
  onStatusChange: app.notifyTaskStatusChange,
  resolutionEmail: {
    sendMail: app.sendMail,
    render: app.renderResolutionEmail,
    getFromAddress: app.getMailFromAddress,
  },
});
const server = createMcpServer(service);

async function shutdown() {
  await server.close();
  await Promise.all([prisma.$disconnect(), app.prisma.$disconnect()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(new StdioServerTransport());
console.error("[a-sisyphus-mcp] Connected to the PMS database via stdio.");
