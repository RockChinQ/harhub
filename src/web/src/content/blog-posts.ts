export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  author: string;
  tags: string[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "harhub-introduction",
    title: "Harhub：面向团队的 Agent Skills 与 MCP 资产治理平台",
    excerpt: "Harhub 基于 GitHub 连接团队资产库与项目仓库，让 Agent Skills 和 MCP 配置的收录、分发、变更审查与版本回流形成完整工作流。",
    publishedAt: "2026-08-05",
    author: "RockChinQ",
    tags: ["Harhub", "Harness", "Skills", "MCP"]
  }
];

export function findBlogPost(slug?: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}
