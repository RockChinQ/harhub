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
    title: "整了个为团队管理 Skills、MCPs 资产的工具",
    excerpt: "为什么团队需要一个连接 Library、GitHub Projects 与 reviewable PR 的 Harness 资产控制平面。",
    publishedAt: "2026-08-05",
    author: "RockChinQ",
    tags: ["Harhub", "Harness", "Skills", "MCP"]
  }
];

export function findBlogPost(slug?: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}
