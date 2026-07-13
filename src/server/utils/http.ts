import type { Request, Response } from "express";
import type { ValidationIssue, WorkspaceRole } from "../../shared/types.js";

export function sendError(res: Response, error: unknown, status: number): void {
  res.status(status).json({
    error: error instanceof Error ? error.message : String(error)
  });
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export function getBearerToken(req: Request): string | undefined {
  const authorization = req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return undefined;
  return authorization.slice("Bearer ".length).trim();
}

export function readWorkspaceRole(value: unknown): WorkspaceRole {
  if (value === "owner" || value === "admin" || value === "member" || value === "viewer") {
    return value;
  }

  return "member";
}

export function readOptionalStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function stringQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
