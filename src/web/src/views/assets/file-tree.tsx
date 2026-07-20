import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";

import type { AssetFileTreeNode } from "../../../../shared/types";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

const NO_COLLAPSED_PATHS: readonly string[] = [];

export function FileTree({
  nodes,
  selectedPath,
  onSelect,
  markers,
  defaultCollapsedPaths = NO_COLLAPSED_PATHS,
  collapsedPaths: controlledCollapsedPaths,
  onCollapsedPathsChange
}: {
  nodes: AssetFileTreeNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  markers?: Readonly<Record<string, string>>;
  defaultCollapsedPaths?: readonly string[];
  collapsedPaths?: readonly string[];
  onCollapsedPathsChange?: (paths: string[]) => void;
}) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(
    () => new Set(defaultCollapsedPaths)
  );
  const appliedDefaultsRef = useRef(new Set(defaultCollapsedPaths));
  const pendingDefaults = defaultCollapsedPaths.filter(
    (path) => !appliedDefaultsRef.current.has(path)
  );
  const defaultedCollapsedPaths = useMemo(() => {
    if (pendingDefaults.length === 0) return collapsedPaths;
    return new Set([...collapsedPaths, ...pendingDefaults]);
  }, [collapsedPaths, pendingDefaults]);
  const effectiveCollapsedPaths = useMemo(
    () => controlledCollapsedPaths === undefined
      ? defaultedCollapsedPaths
      : new Set(controlledCollapsedPaths),
    [controlledCollapsedPaths, defaultedCollapsedPaths]
  );

  useEffect(() => {
    if (pendingDefaults.length === 0) return;
    pendingDefaults.forEach((path) => appliedDefaultsRef.current.add(path));
    setCollapsedPaths((current) => new Set([...current, ...pendingDefaults]));
  }, [pendingDefaults]);

  function toggleDirectory(path: string): void {
    const next = new Set(effectiveCollapsedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    if (controlledCollapsedPaths === undefined) setCollapsedPaths(next);
    onCollapsedPathsChange?.([...next].sort());
  }

  return (
    <FileTreeNodes
      nodes={nodes}
      selectedPath={selectedPath}
      onSelect={onSelect}
      markers={markers}
      collapsedPaths={effectiveCollapsedPaths}
      onToggleDirectory={toggleDirectory}
      depth={0}
    />
  );
}

function FileTreeNodes({
  nodes,
  selectedPath,
  onSelect,
  markers,
  collapsedPaths,
  onToggleDirectory,
  depth
}: {
  nodes: AssetFileTreeNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  markers?: Readonly<Record<string, string>>;
  collapsedPaths: ReadonlySet<string>;
  onToggleDirectory: (path: string) => void;
  depth: number;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const isFile = node.type === "file";
        const hasChildren = Boolean(node.children?.length);
        const isCollapsed = !isFile && collapsedPaths.has(node.path);
        const isSelected = selectedPath === node.path;
        return (
          <div key={node.path}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-auto w-full min-w-0 justify-start gap-1.5 px-2 py-1.5 text-left text-xs font-normal",
                isFile || hasChildren
                  ? "hover:bg-accent"
                  : "cursor-default text-muted-foreground hover:bg-transparent",
                !isFile && "text-muted-foreground",
                isSelected && "bg-blue-50 text-blue-950"
              )}
              style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
              aria-expanded={!isFile && hasChildren ? !isCollapsed : undefined}
              onClick={() => {
                if (isFile) onSelect(node.path);
                else if (hasChildren) onToggleDirectory(node.path);
              }}
            >
              {isFile ? (
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : hasChildren ? (
                isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {markers?.[node.path] ? (
                <span
                  className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-blue-700"
                  aria-label={`${node.name} is a ${markers[node.path]}`}
                >
                  {markers[node.path]}
                </span>
              ) : null}
            </Button>
            {hasChildren && !isCollapsed ? (
              <FileTreeNodes
                nodes={node.children ?? []}
                selectedPath={selectedPath}
                onSelect={onSelect}
                markers={markers}
                collapsedPaths={collapsedPaths}
                onToggleDirectory={onToggleDirectory}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
