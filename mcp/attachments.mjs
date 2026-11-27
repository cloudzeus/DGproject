import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute } from "node:path";
import { McpServiceError, assertCondition } from "./workflow.mjs";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "image/svg+xml",
]);

export function isTextAttachment(mimeType) {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  return normalized.startsWith("text/") || TEXT_MIME_TYPES.has(normalized) || normalized.endsWith("+json") || normalized.endsWith("+xml");
}

export function isImageAttachment(mimeType) {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  return normalized.startsWith("image/") && normalized !== "image/svg+xml";
}

export function safeFileName(value) {
  const baseName = value.normalize("NFKC").replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = baseName.replace(/[\0-\x1F\x7F]/g, "-").replace(/^\.+/, "").trim();
  assertCondition(cleaned.length > 0 && cleaned !== "." && cleaned !== "..", "INVALID_FILE_NAME", "A valid file name is required.");
  return cleaned.slice(0, 180);
}

const FILE_EXTENSION_MIME_TYPES = new Map(Object.entries({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".zip": "application/zip",
}));

export function detectAttachmentMimeType(filePath) {
  return FILE_EXTENSION_MIME_TYPES.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function localFileError(error) {
  const code = error?.code === "ENOENT"
    ? "FILE_NOT_FOUND"
    : ["EACCES", "EPERM"].includes(error?.code)
      ? "FILE_PERMISSION_DENIED"
      : "FILE_READ_FAILED";
  return new McpServiceError(code, `Unable to read the local attachment: ${error.message}`);
}

export async function readAttachmentFromPath(filePath) {
  assertCondition(isAbsolute(filePath), "INVALID_FILE_PATH", "file_path must be an absolute path accessible to the MCP server.");
  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch (error) {
    throw localFileError(error);
  }
  assertCondition(fileStats.isFile(), "INVALID_FILE_PATH", "file_path must point to a regular file.");
  assertCondition(fileStats.size > 0, "EMPTY_FILE", "Empty files cannot be uploaded.");
  assertCondition(fileStats.size <= MAX_ATTACHMENT_BYTES, "FILE_TOO_LARGE", `Files cannot exceed ${MAX_ATTACHMENT_BYTES} bytes.`);

  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch (error) {
    throw localFileError(error);
  }
  return {
    buffer,
    fileName: safeFileName(basename(filePath)),
    mimeType: detectAttachmentMimeType(filePath),
  };
}

export function decodeFileContent({ content_base64, text_content }) {
  assertCondition(Boolean(content_base64) !== Boolean(text_content), "INVALID_FILE_CONTENT", "Provide exactly one of content_base64 or text_content.");
  if (text_content != null) return Buffer.from(text_content, "utf8");

  assertCondition(content_base64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(content_base64), "INVALID_FILE_CONTENT", "content_base64 is not valid base64.");
  const buffer = Buffer.from(content_base64, "base64");
  assertCondition(buffer.toString("base64") === content_base64, "INVALID_FILE_CONTENT", "content_base64 is not canonical base64.");
  return buffer;
}

function allowedDownloadHosts() {
  return new Set([
    process.env.BUNNY_CDN_HOSTNAME,
    ...(process.env.MCP_ATTACHMENT_ALLOWED_HOSTS ?? "").split(","),
  ].map((host) => host?.trim().toLowerCase()).filter(Boolean));
}

async function responseBuffer(response, maximumBytes) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  assertCondition(declaredLength <= maximumBytes, "FILE_TOO_LARGE", `Attachment exceeds the ${maximumBytes} byte download limit.`);
  if (!response.body) return Buffer.alloc(0);

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    assertCondition(size <= maximumBytes, "FILE_TOO_LARGE", `Attachment exceeds the ${maximumBytes} byte download limit.`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function downloadAttachment(attachment) {
  assertCondition(attachment.size <= MAX_ATTACHMENT_BYTES, "FILE_TOO_LARGE", `Attachment exceeds the ${MAX_ATTACHMENT_BYTES} byte download limit.`);
  let url;
  try {
    url = new URL(attachment.url);
  } catch {
    throw new McpServiceError("INVALID_ATTACHMENT_URL", "The attachment does not have a valid URL.");
  }
  let response;
  for (let redirectCount = 0; ; redirectCount += 1) {
    assertCondition(url.protocol === "https:", "ATTACHMENT_HOST_NOT_ALLOWED", "Only HTTPS attachments can be read.");
    assertCondition(allowedDownloadHosts().has(url.hostname.toLowerCase()), "ATTACHMENT_HOST_NOT_ALLOWED", `Attachment host '${url.hostname}' is not in the MCP download allowlist.`);
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "manual" });
    } catch (error) {
      throw new McpServiceError("ATTACHMENT_DOWNLOAD_FAILED", `Attachment download failed: ${error.message}`);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    assertCondition(redirectCount < 3, "ATTACHMENT_DOWNLOAD_FAILED", "Attachment download exceeded the redirect limit.");
    const location = response.headers.get("location");
    assertCondition(location, "ATTACHMENT_DOWNLOAD_FAILED", "Attachment redirect did not include a location.");
    url = new URL(location, url);
  }
  assertCondition(response.ok, "ATTACHMENT_DOWNLOAD_FAILED", `Attachment download returned HTTP ${response.status}.`);

  const buffer = await responseBuffer(response, MAX_ATTACHMENT_BYTES);
  return {
    attachment,
    mimeType: attachment.mimeType.toLowerCase().split(";")[0].trim(),
    data: buffer.toString("base64"),
    text: isTextAttachment(attachment.mimeType) ? buffer.toString("utf8") : undefined,
  };
}

export function attachmentToMcpResult(result) {
  const metadata = {
    attachment: result.attachment,
    mimeType: result.mimeType,
    size: result.attachment.size,
  };
  if (result.text != null) {
    return { content: [{ type: "text", text: JSON.stringify({ ...metadata, text: result.text }, null, 2) }] };
  }

  const content = [{ type: "text", text: JSON.stringify(metadata, null, 2) }];
  if (isImageAttachment(result.mimeType)) {
    content.push({ type: "image", data: result.data, mimeType: result.mimeType });
  } else {
    content.push({ type: "resource", resource: { uri: result.attachment.url, mimeType: result.mimeType, blob: result.data } });
  }
  return { content };
}

function bunnyConfiguration() {
  const { BUNNY_ACCESS_KEY, BUNNY_STORAGE_API_HOST, BUNNY_STORAGE_ZONE, BUNNY_CDN_HOSTNAME } = process.env;
  assertCondition(
    BUNNY_ACCESS_KEY && BUNNY_STORAGE_API_HOST && BUNNY_STORAGE_ZONE && BUNNY_CDN_HOSTNAME,
    "STORAGE_NOT_CONFIGURED",
    "Bunny CDN storage environment variables are required for file uploads.",
  );
  return { BUNNY_ACCESS_KEY, BUNNY_STORAGE_API_HOST, BUNNY_STORAGE_ZONE, BUNNY_CDN_HOSTNAME };
}

export async function uploadAttachmentToBunny({ parentKind, parentId, fileName, mimeType, buffer }) {
  const config = bunnyConfiguration();
  const storagePath = `${parentKind === "task" ? "tasks" : "projects"}/${parentId}/${randomUUID()}-${safeFileName(fileName)}`;
  const response = await fetch(`https://${config.BUNNY_STORAGE_API_HOST}/${config.BUNNY_STORAGE_ZONE}/${storagePath}`, {
    method: "PUT",
    headers: { AccessKey: config.BUNNY_ACCESS_KEY, "Content-Type": mimeType },
    body: buffer,
    signal: AbortSignal.timeout(30000),
  });
  assertCondition(response.ok, "ATTACHMENT_UPLOAD_FAILED", `Bunny CDN upload returned HTTP ${response.status}.`);
  return { storagePath, url: `https://${config.BUNNY_CDN_HOSTNAME}/${storagePath}` };
}

export async function deleteBunnyObject(storagePath) {
  const config = bunnyConfiguration();
  const response = await fetch(`https://${config.BUNNY_STORAGE_API_HOST}/${config.BUNNY_STORAGE_ZONE}/${storagePath}`, {
    method: "DELETE",
    headers: { AccessKey: config.BUNNY_ACCESS_KEY },
    signal: AbortSignal.timeout(30000),
  });
  return response.ok || response.status === 404;
}
