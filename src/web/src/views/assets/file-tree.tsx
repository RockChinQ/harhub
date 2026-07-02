import { FileText, Folder, FolderOpen } from "lucide-react";

import type { AssetFileTreeNode } from "../../../../shared/types";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

export function FileTree({
  nodes,
  selectedPath,
  onSelect,
  depth = 0
}: {
  nodes: AssetFileTreeNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
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
            </Button>
            {node.children?.length ? (
              <FileTree
                nodes={node.children}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
