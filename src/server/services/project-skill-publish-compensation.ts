export type ProjectPublishErrorKind = "known-failure" | "commit-unknown";
export type ProjectPublishState = "published" | "not-published" | "unknown";
export type ProjectPublishRecovery = "keep-published" | "restore-old" | "preserve-both";

export function resolveProjectPublishRecovery(
  _errorKind: ProjectPublishErrorKind,
  state: ProjectPublishState
): ProjectPublishRecovery {
  if (state === "published") return "keep-published";
  if (state === "not-published") return "restore-old";
  return "preserve-both";
}
