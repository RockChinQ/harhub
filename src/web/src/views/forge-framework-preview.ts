import type {
  AssetFilePreview,
  AssetFileTreeNode,
  HarnessTemplateAssetSelection,
  HarnessTemplateFile
} from "../../../shared/types";

export interface ForgeSelectedSkillTree {
  assetId: string;
  installPath: string;
  tree: AssetFileTreeNode[];
}

export interface ForgeSelectedSkillFileTarget {
  assetId: string;
  installPath: string;
  relativePath: string;
}

export function buildForgeFrameworkTree(
  files: HarnessTemplateFile[],
  skillTrees: ForgeSelectedSkillTree[]
): AssetFileTreeNode[] {
  const entries: Array<{ path: string; size?: number }> = files.map((file) => ({
    path: file.path
  }));

  for (const skill of skillTrees) {
    for (const file of flattenFiles(skill.tree)) {
      entries.push({
        path: joinPath(skill.installPath, file.path),
        size: file.size
      });
    }
  }

  return buildTree(entries);
}

export function resolveForgeSkillFile(
  selectedAssets: HarnessTemplateAssetSelection[],
  selectedPath: string | undefined
): ForgeSelectedSkillFileTarget | undefined {
  if (!selectedPath) return undefined;

  for (const asset of selectedAssets) {
    const installPath = trimSlashes(asset.installPath);
    const prefix = `${installPath}/`;
    if (!selectedPath.startsWith(prefix)) continue;

    const relativePath = selectedPath.slice(prefix.length);
    if (!relativePath) return undefined;
    return { assetId: asset.id, installPath, relativePath };
  }

  return undefined;
}

export function prefixForgeSkillFilePreview(
  file: AssetFilePreview,
  installPath: string
): AssetFilePreview {
  return {
    ...file,
    path: joinPath(installPath, file.path)
  };
}

function flattenFiles(nodes: AssetFileTreeNode[]): AssetFileTreeNode[] {
  return nodes.flatMap((node) => node.type === "file"
    ? [node]
    : flattenFiles(node.children ?? []));
}

function buildTree(entries: Array<{ path: string; size?: number }>): AssetFileTreeNode[] {
  type MutableNode = AssetFileTreeNode & { childMap?: Map<string, MutableNode> };
  const roots = new Map<string, MutableNode>();

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
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
          ...(isFile
            ? { size: entry.size }
            : { children: [], childMap: new Map<string, MutableNode>() })
        };
        level.set(part, node);
      }

      if (!isFile) {
        node.type = "directory";
        node.children ??= [];
        node.childMap ??= new Map<string, MutableNode>();
        level = node.childMap;
      }
    });
  }

  return finalizeTree(roots.values());
}

function finalizeTree(nodes: Iterable<AssetFileTreeNode & {
  childMap?: Map<string, AssetFileTreeNode>;
}>): AssetFileTreeNode[] {
  return Array.from(nodes)
    .sort((left, right) => left.type === right.type
      ? left.name.localeCompare(right.name)
      : left.type === "directory" ? -1 : 1)
    .map((node) => ({
      name: node.name,
      path: node.path,
      type: node.type,
      size: node.size,
      children: node.childMap ? finalizeTree(node.childMap.values()) : undefined
    }));
}

function joinPath(parent: string, child: string): string {
  return [trimSlashes(parent), trimSlashes(child)].filter(Boolean).join("/");
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}
