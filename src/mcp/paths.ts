import {
  existsSync,
  realpathSync,
  statSync
} from "node:fs";
import path from "node:path";

function configuredRoots(): string[] {
  const configured = process.env.HARHUB_MCP_ALLOWED_ROOTS;
  if (!configured?.trim()) return [process.cwd()];
  return configured
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
}

export class AllowedPaths {
  readonly roots: string[];

  constructor(roots = configuredRoots()) {
    if (roots.length === 0) throw new Error("At least one MCP file root is required.");
    this.roots = roots.map((root) => canonicalExistingDirectory(root));
  }

  readable(value: string): string {
    const candidate = realpathSync(path.resolve(value));
    this.assertAllowed(candidate);
    return candidate;
  }

  writable(value: string): string {
    const candidate = path.resolve(value);
    const existingAncestor = nearestExistingAncestor(candidate);
    this.assertAllowed(realpathSync(existingAncestor));
    return candidate;
  }

  output(value: string | undefined, fallbackName: string): string {
    const requested = this.writable(value ?? path.join(process.cwd(), fallbackName));
    return existsSync(requested) && statSync(requested).isDirectory()
      ? this.writable(path.join(requested, fallbackName))
      : requested;
  }

  private assertAllowed(candidate: string): void {
    const allowed = this.roots.some((root) =>
      candidate === root || candidate.startsWith(`${root}${path.sep}`)
    );
    if (!allowed) {
      throw new Error(
        `Path is outside HARHUB_MCP_ALLOWED_ROOTS: ${candidate}`
      );
    }
  }
}

function canonicalExistingDirectory(value: string): string {
  const absolute = realpathSync(path.resolve(value));
  if (!statSync(absolute).isDirectory()) {
    throw new Error(`MCP file root is not a directory: ${absolute}`);
  }
  return absolute;
}

function nearestExistingAncestor(value: string): string {
  let candidate = value;
  while (!existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  if (!existsSync(candidate)) {
    throw new Error(`No existing parent was found for ${value}.`);
  }
  return candidate;
}
