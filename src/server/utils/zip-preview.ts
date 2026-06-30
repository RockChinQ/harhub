import path from "node:path";
import JSZip, { type JSZipObject } from "jszip";
import {
  MAX_PREVIEW_BYTES,
  MAX_PREVIEW_CHARS
} from "../config.js";
import type {
  AssetFilePreview,
  AssetFileSummary,
  AssetFileTreeNode,
  AssetPreview,
  AssetRecord
} from "../../shared/types.js";

export async function buildAssetPreview(
  asset: AssetRecord,
  buffer: Buffer,
  requestedPath?: string
): Promise<AssetPreview> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .sort((a, b) => a.name.localeCompare(b.name));
  const fallbackPath = metadataString(asset, "skillEntry") || entries[0]?.name;
  const selectedEntry = entries.find((entry) => entry.name === (requestedPath || fallbackPath));

  return {
    asset,
    tree: buildZipTree(entries),
    files: entries.map(zipEntrySummary),
    selectedFile: selectedEntry ? await zipEntryPreview(selectedEntry) : undefined
  };
}

function metadataString(asset: AssetRecord, key: string): string | undefined {
  const value = asset.metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildZipTree(entries: JSZipObject[]): AssetFileTreeNode[] {
  type MutableNode = AssetFileTreeNode & { childMap?: Map<string, MutableNode> };
  const roots = new Map<string, MutableNode>();

  for (const entry of entries) {
    const parts = entry.name.split("/").filter(Boolean);
    let level = roots;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = level.get(part);

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
          ...(isFile ? { size: zipEntrySize(entry) } : { children: [], childMap: new Map() })
        };
        level.set(part, node);
      }

      if (!isFile) {
        node.type = "directory";
        node.children ??= [];
        node.childMap ??= new Map();
        level = node.childMap;
      }
    });
  }

  return finalizeZipTree(roots.values());
}

function finalizeZipTree(
  nodes: Iterable<AssetFileTreeNode & { childMap?: Map<string, AssetFileTreeNode> }>
): AssetFileTreeNode[] {
  return Array.from(nodes)
    .sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1
    )
    .map((node) => ({
      name: node.name,
      path: node.path,
      type: node.type,
      size: node.size,
      children: node.childMap ? finalizeZipTree(node.childMap.values()) : undefined
    }));
}

function zipEntrySummary(entry: JSZipObject): AssetFileSummary {
  return {
    path: entry.name,
    name: path.posix.basename(entry.name),
    size: zipEntrySize(entry),
    isText: isTextZipEntry(entry.name)
  };
}

async function zipEntryPreview(entry: JSZipObject): Promise<AssetFilePreview> {
  const size = zipEntrySize(entry);
  const isText = isTextZipEntry(entry.name);
  const base = {
    path: entry.name,
    name: path.posix.basename(entry.name),
    size,
    isText
  };

  if (!isText) {
    return {
      ...base,
      truncated: false
    };
  }

  const content = await entry.async("string");
  return {
    ...base,
    truncated: size > MAX_PREVIEW_BYTES || content.length > MAX_PREVIEW_CHARS,
    content: content.slice(0, MAX_PREVIEW_CHARS)
  };
}

function zipEntrySize(entry: JSZipObject): number {
  const data = (entry as unknown as { _data?: { uncompressedSize?: number } })._data;
  return data?.uncompressedSize ?? 0;
}

function isTextZipEntry(filePath: string): boolean {
  const name = filePath.toLowerCase();
  const extension = path.posix.extname(name);
  return (
    name.endsWith("skill.md") ||
    [
      ".md",
      ".mdx",
      ".txt",
      ".json",
      ".yaml",
      ".yml",
      ".csv",
      ".tsv",
      ".xml",
      ".html",
      ".css",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".sh",
      ".toml",
      ".ini",
      ".env",
      ".gitignore",
      ".license"
    ].includes(extension)
  );
}
