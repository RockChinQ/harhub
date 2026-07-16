import path from "node:path";

import type { SkillPackageFile } from "../../features/skills/index.js";
import type {
  AssetFilePreview,
  AssetFileSummary,
  AssetFileTreeNode,
  AssetPreview,
  AssetRecord
} from "../../shared/types.js";
import {
  MAX_PREVIEW_BYTES,
  MAX_PREVIEW_CHARS
} from "../config.js";

export function buildAssetPreview(
  asset: AssetRecord,
  inputFiles: SkillPackageFile[],
  requestedPath?: string
): AssetPreview {
  const files = inputFiles.slice().sort((left, right) => left.path.localeCompare(right.path));
  const fallbackPath = files.find((file) => file.path === "SKILL.md")?.path ?? files[0]?.path;
  const selectedFile = files.find((file) => file.path === (requestedPath || fallbackPath));

  return {
    asset,
    tree: buildFileTree(files),
    files: files.map(fileSummary),
    selectedFile: selectedFile ? filePreview(selectedFile) : undefined
  };
}

function buildFileTree(files: SkillPackageFile[]): AssetFileTreeNode[] {
  type MutableNode = AssetFileTreeNode & { childMap?: Map<string, MutableNode> };
  const roots = new Map<string, MutableNode>();

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
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
          ...(isFile ? { size: file.content.byteLength } : { children: [], childMap: new Map() })
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

  return finalizeFileTree(roots.values());
}

function finalizeFileTree(
  nodes: Iterable<AssetFileTreeNode & { childMap?: Map<string, AssetFileTreeNode> }>
): AssetFileTreeNode[] {
  return Array.from(nodes)
    .sort((left, right) =>
      left.type === right.type
        ? left.name.localeCompare(right.name)
        : left.type === "directory" ? -1 : 1
    )
    .map((node) => ({
      name: node.name,
      path: node.path,
      type: node.type,
      size: node.size,
      children: node.childMap ? finalizeFileTree(node.childMap.values()) : undefined
    }));
}

function fileSummary(file: SkillPackageFile): AssetFileSummary {
  return {
    path: file.path,
    name: path.posix.basename(file.path),
    size: file.content.byteLength,
    isText: isTextFile(file.path)
  };
}

function filePreview(file: SkillPackageFile): AssetFilePreview {
  const isText = isTextFile(file.path);
  const base = {
    path: file.path,
    name: path.posix.basename(file.path),
    size: file.content.byteLength,
    isText
  };

  if (!isText) return { ...base, truncated: false };

  const content = file.content.toString("utf8");
  return {
    ...base,
    truncated: file.content.byteLength > MAX_PREVIEW_BYTES || content.length > MAX_PREVIEW_CHARS,
    content: content.slice(0, MAX_PREVIEW_CHARS)
  };
}

function isTextFile(filePath: string): boolean {
  const name = filePath.toLowerCase();
  const extension = path.posix.extname(name);
  return (
    name.endsWith("skill.md") ||
    [
      ".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".csv", ".tsv",
      ".xml", ".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".py",
      ".sh", ".toml", ".ini", ".env", ".gitignore", ".license"
    ].includes(extension)
  );
}
