import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.mjs";
import { TaskService } from "./task-service.mjs";

// MCP clients do not necessarily start the process with this repository as cwd.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const prisma = new PrismaClient({ log: ["error"] });
const service = new TaskService(prisma);
const server = createMcpServer(service);

async function shutdown() {
  await server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(new StdioServerTransport());
console.error("[a-sisyphus-mcp] Connected to the PMS database via stdio.");
