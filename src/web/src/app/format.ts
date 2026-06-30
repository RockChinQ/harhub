import type { AssetRecord, StorageStatus } from "../../../shared/types";

export function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function shortHash(value?: string): string {
  return value ? value.slice(0, 16) : "-";
}

export function healthBadgeClass(health: AssetRecord["health"]): string {
  if (health === "error") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (health === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (health === "unknown") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  return "border-blue-200 bg-blue-50 text-blue-950";
}

export function uploadStatusLabel(storage?: StorageStatus): string {
  if (!storage?.configured) return "Uploads need setup";
  return "Ready to accept skill packages";
}

export function uploadErrorMessage(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);
  if (/s3|bucket|object storage|harhub_s3/i.test(message)) {
    return "Uploads are not configured yet. Ask an administrator to enable package uploads before continuing.";
  }
  return message;
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
