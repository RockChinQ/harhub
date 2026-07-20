import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { slugify } from "../shared/markdown.js";
import {
  SKILL_FILES_CHECKSUM_ALGORITHM,
  type StorageStatus,
  type StoredObject
} from "../shared/types.js";

const DEFAULT_REGION = "us-east-1";
const DIRECTORY_CONTENT_TYPE = "application/vnd.harhub.skill-directory" as const;
const S3_BATCH_SIZE = 1000;
const IO_CONCURRENCY = 16;

export interface StoredSkillFile {
  path: string;
  content: Buffer;
}

export interface UploadSkillFilesInput {
  workspaceId: string;
  skillName: string;
  files: StoredSkillFile[];
  checksum: string;
}

export function getStorageStatus(): StorageStatus {
  const config = readStorageConfig();
  return {
    provider: "s3",
    configured: Boolean(config.bucket),
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    prefix: config.prefix,
    publicBaseUrl: config.publicBaseUrl
  };
}

export async function uploadSkillFiles(input: UploadSkillFilesInput): Promise<StoredObject> {
  const config = readStorageConfig();
  if (!config.bucket) {
    throw new Error("S3 storage is not configured. Set HARHUB_S3_BUCKET before uploading skills.");
  }
  if (input.files.length === 0) throw new Error("A Skill must contain at least one file.");

  const key = buildSkillDirectoryKey(config.prefix, input.workspaceId, input.skillName);
  const client = createS3Client(config);
  const storage: StoredObject = {
    provider: "s3",
    layout: "files",
    bucket: config.bucket,
    key,
    region: config.region,
    endpoint: config.endpoint,
    size: input.files.reduce((total, file) => total + file.content.byteLength, 0),
    fileCount: input.files.length,
    contentType: DIRECTORY_CONTENT_TYPE,
    checksum: input.checksum,
    checksumAlgorithm: SKILL_FILES_CHECKSUM_ALGORITHM,
    uploadedAt: new Date().toISOString()
  };

  try {
    await forEachConcurrent(input.files, IO_CONCURRENCY, async (file) => {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: `${key}${file.path}`,
        Body: file.content,
        ContentType: fileContentType(file.path),
        Metadata: {
          workspace: input.workspaceId,
          skill: input.skillName,
          checksum: input.checksum,
          "checksum-algorithm": SKILL_FILES_CHECKSUM_ALGORITHM
        }
      }));
    });
  } catch (error) {
    await deletePrefix(client, config.bucket, key).catch(() => undefined);
    throw error;
  }

  return storage;
}

export async function deleteStoredObject(object: StoredObject): Promise<void> {
  if (object.provider !== "s3") return;
  const config = configForStoredObject(object);
  const bucket = object.bucket || config.bucket;
  if (!bucket) return;

  await deletePrefix(createS3Client(config), bucket, object.key);
}

export async function readStoredSkillFiles(object: StoredObject): Promise<StoredSkillFile[]> {
  if (object.provider !== "s3") {
    throw new Error(`Unsupported storage provider: ${object.provider}`);
  }

  const config = configForStoredObject(object);
  const bucket = object.bucket || config.bucket;
  if (!bucket) throw new Error("S3 storage is not configured.");

  const client = createS3Client(config);
  const keys = await listPrefixKeys(client, bucket, object.key);
  if (keys.length === 0) throw new Error("Stored Skill directory is empty or missing.");

  const files: StoredSkillFile[] = [];
  await forEachConcurrent(keys, IO_CONCURRENCY, async (key) => {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    files.push({
      path: key.slice(object.key.length),
      content: await bodyToBuffer(result.Body)
    });
  });

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function deletePrefix(client: S3Client, bucket: string, prefix: string): Promise<void> {
  const keys = await listPrefixKeys(client, bucket, prefix);
  for (let offset = 0; offset < keys.length; offset += S3_BATCH_SIZE) {
    const batch = keys.slice(offset, offset + S3_BATCH_SIZE);
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
        Quiet: true
      }
    }));
  }
}

async function listPrefixKeys(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    }));
    for (const object of result.Contents ?? []) {
      if (object.Key && object.Key.startsWith(prefix) && object.Key.length > prefix.length) {
        keys.push(object.Key);
      }
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys.sort((left, right) => left.localeCompare(right));
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const blobBody = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof blobBody.transformToByteArray === "function") {
    return Buffer.from(await blobBody.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function forEachConcurrent<T>(
  values: T[],
  concurrency: number,
  callback: (value: T) => Promise<void>
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += concurrency) {
    const results = await Promise.allSettled(
      values.slice(offset, offset + concurrency).map(callback)
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}

function readStorageConfig() {
  return {
    bucket: process.env.HARHUB_S3_BUCKET?.trim(),
    region: process.env.HARHUB_S3_REGION?.trim() || process.env.AWS_REGION?.trim() || DEFAULT_REGION,
    endpoint: process.env.HARHUB_S3_ENDPOINT?.trim(),
    prefix: normalizePrefix(process.env.HARHUB_S3_PREFIX),
    publicBaseUrl: process.env.HARHUB_S3_PUBLIC_BASE_URL?.trim(),
    forcePathStyle: readBoolean(process.env.HARHUB_S3_FORCE_PATH_STYLE)
  };
}

function configForStoredObject(object: StoredObject): ReturnType<typeof readStorageConfig> {
  const current = readStorageConfig();
  return {
    ...current,
    bucket: object.bucket || current.bucket,
    region: object.region || current.region,
    endpoint: object.endpoint || current.endpoint
  };
}

function createS3Client(config: ReturnType<typeof readStorageConfig>): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle
  });
}

function buildSkillDirectoryKey(prefix: string, workspaceId: string, skillName: string): string {
  const slug = slugify(skillName) || "skill";
  return `${prefix}workspaces/${workspaceId}/skills/${slug}/${Date.now()}-${randomUUID()}/`;
}

function fileContentType(filePath: string): string {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (filePath === "SKILL.md" || extension === ".md" || extension === ".mdx") {
    return "text/markdown; charset=utf-8";
  }
  if ([".txt", ".csv", ".tsv", ".sh", ".py", ".js", ".ts", ".css", ".html"].includes(extension)) {
    return "text/plain; charset=utf-8";
  }
  if (extension === ".json") return "application/json";
  if ([".yaml", ".yml"].includes(extension)) return "application/yaml";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

function normalizePrefix(value: string | undefined): string {
  const cleaned = value?.trim().replace(/^\/+|\/+$/g, "");
  return cleaned ? `${cleaned}/` : "";
}

function readBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return undefined;
}
