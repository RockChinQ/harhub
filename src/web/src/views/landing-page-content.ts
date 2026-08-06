export interface LandingPageContent {
  eyebrow: string;
  headline: string;
  description: string;
  primaryAction: string;
  primaryHref: string;
  proofPoints: string[];
}

export function landingPageContent(isSignedIn: boolean): LandingPageContent {
  return {
    eyebrow: "Repository-native control for agent teams",
    headline: "Keep your agent setup consistent across repositories.",
    description:
      "Connect GitHub to inventory Skills, MCP configurations, rules, and instructions. Roll out approved assets through reviewable pull requests, detect drift, and bring proven repository improvements back to the team Library.",
    primaryAction: isSignedIn ? "Open Projects" : "Start your repository inventory",
    primaryHref: "/projects",
    proofPoints: [
      "GitHub App inventory",
      "Skills and MCP versions",
      "Reviewable pull requests",
      "Drift and reverse sync"
    ]
  };
}
