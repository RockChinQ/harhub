import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 3310);
export const MAX_UPLOAD_BYTES = Number(process.env.HARHUB_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);
export const MAX_PREVIEW_BYTES = 256 * 1024;
export const MAX_PREVIEW_CHARS = 120_000;
