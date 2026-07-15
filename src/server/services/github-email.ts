interface GitHubProfileEmailSource {
  email?: unknown;
}

export function resolveGitHubEmail(profile: GitHubProfileEmailSource): string {
  if (typeof profile.email === "string" && profile.email.trim()) {
    return profile.email.trim();
  }

  throw new Error(
    "GitHub sign-in requires a public email. Add a public email to your GitHub profile and try again."
  );
}
