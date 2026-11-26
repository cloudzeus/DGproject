import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentToMcpResult,
  decodeFileContent,
  isImageAttachment,
  isTextAttachment,
  safeFileName,
} from "./attachments.mjs";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("file content accepts text and canonical base64", () => {
  assert.equal(decodeFileContent({ text_content: "hello" }).toString("utf8"), "hello");
  assert.equal(decodeFileContent({ content_base64: PNG_BASE64 }).toString("base64"), PNG_BASE64);
  assert.throws(() => decodeFileContent({ content_base64: "not base64!" }), (error) => error.code === "INVALID_FILE_CONTENT");
  assert.throws(() => decodeFileContent({ text_content: "x", content_base64: PNG_BASE64 }), (error) => error.code === "INVALID_FILE_CONTENT");
});

test("file names cannot traverse storage paths", () => {
  assert.equal(safeFileName("../../screenshot.png"), "screenshot.png");
  assert.equal(safeFileName("folder\\image.png"), "image.png");
  assert.throws(() => safeFileName("..."), (error) => error.code === "INVALID_FILE_NAME");
});

test("text attachments are returned inline", () => {
  const result = attachmentToMcpResult({
    attachment: { id: "a1", url: "https://cdn.example/a.txt", size: 5 },
    mimeType: "text/plain",
    text: "hello",
  });
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(JSON.parse(result.content[0].text).text, "hello");
});

test("screenshots are returned as MCP image content", () => {
  const result = attachmentToMcpResult({
    attachment: { id: "a2", url: "https://cdn.example/screen.png", size: 68 },
    mimeType: "image/png",
    data: PNG_BASE64,
  });
  assert.equal(result.content[1].type, "image");
  assert.equal(result.content[1].mimeType, "image/png");
  assert.equal(result.content[1].data, PNG_BASE64);
  assert.ok(isImageAttachment("image/png"));
  assert.ok(!isImageAttachment("image/svg+xml"));
  assert.ok(isTextAttachment("application/json"));
});

test("other binary attachments are embedded as resources", () => {
  const result = attachmentToMcpResult({
    attachment: { id: "a3", url: "https://cdn.example/spec.pdf", size: 100 },
    mimeType: "application/pdf",
    data: PNG_BASE64,
  });
  assert.equal(result.content[1].type, "resource");
  assert.equal(result.content[1].resource.blob, PNG_BASE64);
});
