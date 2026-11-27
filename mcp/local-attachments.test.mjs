import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  detectAttachmentMimeType,
  MAX_ATTACHMENT_BYTES,
  readAttachmentFromPath,
} from "./attachments.mjs";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(process.cwd(), ".mcp-local-attachment-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("local attachments are read from absolute paths with detected metadata", async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = join(directory, "screen.png");
  await writeFile(filePath, Buffer.from(PNG_BASE64, "base64"));

  const file = await readAttachmentFromPath(filePath);
  assert.equal(file.buffer.toString("base64"), PNG_BASE64);
  assert.equal(file.fileName, "screen.png");
  assert.equal(file.mimeType, "image/png");
  assert.equal(detectAttachmentMimeType("photo.JPEG"), "image/jpeg");
  assert.equal(detectAttachmentMimeType("unknown.bin"), "application/octet-stream");
});

test("local attachment errors distinguish invalid, missing and empty files", async (t) => {
  const directory = await temporaryDirectory(t);
  await assert.rejects(readAttachmentFromPath("relative.png"), (error) => error.code === "INVALID_FILE_PATH");
  await assert.rejects(readAttachmentFromPath(join(directory, "missing.png")), (error) => error.code === "FILE_NOT_FOUND");
  await assert.rejects(readAttachmentFromPath(directory), (error) => error.code === "INVALID_FILE_PATH");

  const emptyPath = join(directory, "empty.png");
  await writeFile(emptyPath, "");
  await assert.rejects(readAttachmentFromPath(emptyPath), (error) => error.code === "EMPTY_FILE");
});

test("oversized local files are rejected before being read", async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = join(directory, "oversized.png");
  const handle = await open(filePath, "w");
  await handle.truncate(MAX_ATTACHMENT_BYTES + 1);
  await handle.close();

  await assert.rejects(readAttachmentFromPath(filePath), (error) => error.code === "FILE_TOO_LARGE");
});
