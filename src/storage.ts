import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { slugify } from "./markdown.js";
import type { StorageStatus, StoredObject } from "./types.js";

const DEFAULT_REGION = "us-east-1";

export interface UploadObjectInput {
  workspaceId: string;
  objectName: string;
  originalName: string;
  body: Buffer;
  contentType: string;
  checksum?: string;
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

export async function uploadSkillZipObject(input: UploadObjectInput): Promise<StoredObject> {
  const config = readStorageConfig();
  if (!config.bucket) {
    throw new Error("S3 storage is not configured. Set HARHUB_S3_BUCKET before uploading skills.");
  }

  const key = buildSkillZipKey(config.prefix, input.workspaceId, input.objectName);
  const client = createS3Client(config);
  const result = await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: {
        workspaceId: input.workspaceId,
        originalName: input.originalName,
        ...(input.checksum ? { checksum: input.checksum } : {})
      }
    })
  );

  return {
    provider: "s3",
    bucket: config.bucket,
    key,
    region: config.region,
    endpoint: config.endpoint,
    url: objectUrl(config, key),
    size: input.body.byteLength,
    contentType: input.contentType,
    checksum: input.checksum,
    etag: result.ETag?.replace(/^"|"$/g, ""),
    uploadedAt: new Date().toISOString(),
    originalName: input.originalName
  };
}

export async function deleteStoredObject(object: StoredObject): Promise<void> {
  if (object.provider !== "s3") return;
  const config = readStorageConfig();
  const bucket = object.bucket || config.bucket;
  if (!bucket) return;

  const client = createS3Client(config);
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: object.key
    })
  );
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

function createS3Client(config: ReturnType<typeof readStorageConfig>): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle
  });
}

function buildSkillZipKey(prefix: string, workspaceId: string, objectName: string): string {
  const slug = slugify(objectName) || "skill";
  return `${prefix}workspaces/${workspaceId}/skills/${slug}/${Date.now()}-${randomUUID()}.zip`;
}

function objectUrl(config: ReturnType<typeof readStorageConfig>, key: string): string | undefined {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/+$/g, "")}/${key}`;
  }

  if (!config.bucket || config.endpoint) return undefined;
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
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
