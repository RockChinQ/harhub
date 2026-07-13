interface GitHubProfileEmailSource {
  id: number;
  login?: unknown;
  email?: unknown;
}

interface GitHubEmailRecord {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
}

export function resolveGitHubEmail(
  profile: GitHubProfileEmailSource,
  emails: unknown
): string {
  if (typeof profile.email === "string" && profile.email.trim()) {
    return profile.email.trim();
  }

  const verifiedEmails = Array.isArray(emails)
    ? emails.filter(
        (item): item is GitHubEmailRecord =>
          item !== null &&
          typeof item === "object" &&
          typeof item.email === "string" &&
          item.email.trim().length > 0 &&
          item.verified === true
      )
    : [];
  const selected =
    verifiedEmails.find((item) => item.primary === true) ?? verifiedEmails[0];
  if (typeof selected?.email === "string") return selected.email.trim();

  const login =
    typeof profile.login === "string" && profile.login.trim()
      ? profile.login.trim()
      : "github";
  return `${profile.id}+${login}@users.noreply.github.com`;
}
