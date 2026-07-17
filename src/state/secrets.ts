import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getStatePath } from "./paths.js";

const SECRET_VERSION = "v1";
const LOCAL_KEY_FILE = "secrets.key";

export function encryptWorkspaceSecret(value: string, workspaceId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(workspaceId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SECRET_VERSION, iv, tag, encrypted]
    .map((part) => typeof part === "string" ? part : part.toString("base64url"))
    .join(":");
}

export function decryptWorkspaceSecret(value: string, workspaceId: string): string {
  const [version, encodedIv, encodedTag, encodedValue, ...extra] = value.split(":");
  if (
    version !== SECRET_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedValue ||
    extra.length > 0
  ) {
    throw new Error("Stored workspace secret has an unsupported format.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(encodedIv, "base64url")
    );
    decipher.setAAD(Buffer.from(workspaceId, "utf8"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new Error("Workspace AI credentials could not be decrypted.");
  }
}

function encryptionKey(): Buffer {
  const configured = process.env.HARHUB_ENCRYPTION_KEY?.trim();
  return createHash("sha256").update(configured || localEncryptionKey()).digest();
}

function localEncryptionKey(): string {
  const keyPath = path.join(path.dirname(getStatePath()), LOCAL_KEY_FILE);
  if (!existsSync(keyPath)) {
    mkdirSync(path.dirname(keyPath), { recursive: true });
    try {
      writeFileSync(keyPath, `${randomBytes(32).toString("base64url")}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      });
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error;
    }
  }
  chmodSync(keyPath, 0o600);
  const value = readFileSync(keyPath, "utf8").trim();
  if (!value) throw new Error("The local Harhub encryption key is empty.");
  return value;
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
