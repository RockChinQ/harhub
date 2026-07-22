interface GitHubProfileEmailSource {
  id?: unknown;
  login?: unknown;
  email?: unknown;
}

interface GitHubEmailRecordSource {
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

  const providerAccountId =
    typeof profile.id === "number" || typeof profile.id === "string"
      ? String(profile.id).trim()
      : "";
  if (!providerAccountId) throw new Error("GitHub profile did not include a stable account ID.");
  const login = typeof profile.login === "string" ? profile.login.trim().toLowerCase() : "";
  return {
    email: `${providerAccountId}${login ? `+${login}` : ""}@users.noreply.github.com`,
    emailVerified: false
  };
}
