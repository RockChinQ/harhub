import { FileText, Folder, FolderOpen } from "lucide-react";

import type { AssetFileTreeNode } from "../../../../shared/types";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

export function FileTree({
  nodes,
  selectedPath,
  onSelect,
  markers,
  depth = 0
}: {
  nodes: AssetFileTreeNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  markers?: Readonly<Record<string, string>>;
  depth?: number;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const isFile = node.type === "file";
        const isSelected = selectedPath === node.path;
        return (
          <div key={node.path}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-auto w-full min-w-0 justify-start gap-1.5 px-2 py-1.5 text-left text-xs font-normal",
                isFile ? "hover:bg-accent" : "cursor-default text-muted-foreground hover:bg-transparent",
                isSelected && "bg-blue-50 text-blue-950"
              )}
              style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
              onClick={() => {
                if (isFile) onSelect(node.path);
              }}
            >
              {isFile ? (
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : node.children?.length ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
            {node.children?.length ? (
              <FileTree
                nodes={node.children}
                selectedPath={selectedPath}
                onSelect={onSelect}
                markers={markers}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
