export interface GitHubProfileEmailSource {
  id?: unknown;
  login?: unknown;
  name?: unknown;
  email?: unknown;
}

export interface GitHubEmailRecordSource {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
}

export interface ResolvedGitHubEmail {
  email: string;
  emailVerified: boolean;
}

export function resolveGitHubEmail(
  profile: GitHubProfileEmailSource,
  emailRecords: GitHubEmailRecordSource[]
): ResolvedGitHubEmail {
  const verifiedRecords = emailRecords.filter(
    (record): record is GitHubEmailRecordSource & { email: string; verified: true } =>
      record.verified === true && typeof record.email === "string" && Boolean(record.email.trim())
  );
  const publicEmail = typeof profile.email === "string" ? profile.email.trim() : "";
  const selected =
    verifiedRecords.find(
      (record) => record.email.trim().toLowerCase() === publicEmail.toLowerCase()
    ) ??
    verifiedRecords.find((record) => record.primary === true) ??
    verifiedRecords[0];
  if (selected) {
    return { email: selected.email.trim(), emailVerified: true };
  }

  throw new Error("GitHub did not return a verified email.");
}
