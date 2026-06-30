import { AlertCircle, CheckCircle2 } from "lucide-react";

import type { ValidationIssue } from "../../../../shared/types";

export function ValidationIssuesList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Validation</h3>
      {issues.map((issue) => (
        <div key={`${issue.code}-${issue.message}`} className="rounded-md border px-3 py-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {issue.severity === "error" ? (
              <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-amber-600" aria-hidden="true" />
            )}
            {issue.code}
          </div>
          <p className="mt-1 text-muted-foreground">{issue.message}</p>
        </div>
      ))}
    </div>
  );
}
