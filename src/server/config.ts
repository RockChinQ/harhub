import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 3310);
export const HOST = process.env.HOST ?? "127.0.0.1";
export const MAX_UPLOAD_BYTES = Number(process.env.HARHUB_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);
export const MAX_PREVIEW_BYTES = 256 * 1024;
export const MAX_PREVIEW_CHARS = 120_000;
export const PASSWORD_LOGIN_ENABLED = readBooleanEnv(
  process.env.HARHUB_PASSWORD_LOGIN_ENABLED,
  true
);
export const DEVELOPMENT_LOGIN_ENABLED = isDevelopmentLoginEnabled(process.env);
export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? process.env.HARHUB_RESEND_API_KEY;
export const EMAIL_FROM = process.env.HARHUB_EMAIL_FROM ?? "Harhub <onboarding@resend.dev>";
export const PUBLIC_APP_URL = process.env.HARHUB_PUBLIC_URL ?? process.env.HARHUB_APP_URL;
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? process.env.HARHUB_GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? process.env.HARHUB_GOOGLE_CLIENT_SECRET;
export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? process.env.HARHUB_GITHUB_CLIENT_ID;
export const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? process.env.HARHUB_GITHUB_CLIENT_SECRET;

export function isDevelopmentLoginEnabled(
  env: { NODE_ENV?: string; HARHUB_DEV_LOGIN_ENABLED?: string }
): boolean {
  return env.NODE_ENV === "development" && readBooleanEnv(env.HARHUB_DEV_LOGIN_ENABLED, true);
}

function readBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}
