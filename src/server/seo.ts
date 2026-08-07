export interface SeoMetadata {
  title: string;
  description: string;
  canonical: string;
  type: "website" | "article";
  locale: string;
  image: string;
  imageAlt: string;
  robots: string;
  publishedTime?: string;
  author?: string;
  jsonLd: Record<string, unknown>;
  statusCode?: number;
  prerenderedBody?: string;
}

const ORIGIN = "https://harhub.rcpd.cc";
const SOCIAL_IMAGE = `${ORIGIN}/brand/harhub-preview.png`;
const ORGANIZATION_ID = `${ORIGIN}/#organization`;

const organization = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "Harhub",
  url: ORIGIN,
  logo: `${ORIGIN}/brand/harhub-icon.svg`,
  sameAs: ["https://github.com/RockChinQ/harhub"]
};

export function seoMetadataForPath(pathname: string): SeoMetadata {
  if (pathname === "/blog") {
    return {
      title: "Harhub Blog — Agent Skills, MCPs, and GitHub workflows",
      description: "Product thinking, engineering decisions, and field notes about governing Agent Skills and MCP assets across GitHub repositories.",
      canonical: `${ORIGIN}/blog`,
      type: "website",
      locale: "en_US",
      image: SOCIAL_IMAGE,
      imageAlt: "Harhub Library to GitHub repository workflow",
      robots: "index, follow, max-image-preview:large",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Blog",
        "@id": `${ORIGIN}/blog#blog`,
        name: "Harhub Blog",
        url: `${ORIGIN}/blog`,
        description: "Product thinking, engineering decisions, and field notes from building Harhub in the open.",
        publisher: { "@id": ORGANIZATION_ID },
        blogPost: [{ "@id": `${ORIGIN}/blog/harhub-introduction#article` }]
      },
      prerenderedBody: `<main><header><p>Harhub Blog</p><h1>Notes on building better agent infrastructure.</h1><p>Product thinking, engineering decisions, and field notes from building Harhub in the open.</p></header><article><time datetime="2026-08-05">August 5, 2026</time><h2><a href="/blog/harhub-introduction">Harhub：面向团队的 Agent Skills 与 MCP 资产治理平台</a></h2><p>Harhub 基于 GitHub 连接团队资产库与项目仓库，让 Agent Skills 和 MCP 配置的收录、分发、变更审查与版本回流形成完整工作流。</p></article></main>`
    };
  }

  if (pathname === "/blog/harhub-introduction") {
    return {
      title: "Harhub：面向团队的 Agent Skills 与 MCP 资产治理平台 — Harhub Blog",
      description: "Harhub 基于 GitHub 连接团队资产库与项目仓库，让 Agent Skills 和 MCP 配置的收录、分发、变更审查与版本回流形成完整工作流。",
      canonical: `${ORIGIN}/blog/harhub-introduction`,
      type: "article",
      locale: "zh_CN",
      image: SOCIAL_IMAGE,
      imageAlt: "Harhub 团队 Agent Skills 与 MCP 资产治理工作流",
      robots: "index, follow, max-image-preview:large",
      publishedTime: "2026-08-05T00:00:00Z",
      author: "RockChinQ",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "@id": `${ORIGIN}/blog/harhub-introduction#article`,
        headline: "Harhub：面向团队的 Agent Skills 与 MCP 资产治理平台",
        description: "Harhub 基于 GitHub 连接团队资产库与项目仓库，让 Agent Skills 和 MCP 配置的收录、分发、变更审查与版本回流形成完整工作流。",
        datePublished: "2026-08-05T00:00:00Z",
        inLanguage: "zh-CN",
        image: SOCIAL_IMAGE,
        author: { "@type": "Person", name: "RockChinQ", url: "https://rockchin.top/" },
        publisher: { "@id": ORGANIZATION_ID },
        mainEntityOfPage: `${ORIGIN}/blog/harhub-introduction`,
        isPartOf: { "@id": `${ORIGIN}/blog#blog` }
      },
      prerenderedBody: `<main><article><header><time datetime="2026-08-05">August 5, 2026</time><h1>Harhub：面向团队的 Agent Skills 与 MCP 资产治理平台</h1><p>Harhub 基于 GitHub 连接团队资产库与项目仓库，让 Agent Skills 和 MCP 配置的收录、分发、变更审查与版本回流形成完整工作流。</p></header><p>随着团队在多个项目中持续使用 coding agents，可复用的 Agent Skills 与 MCP 配置逐渐成为一类需要长期维护的工程资产。它们通常分散在不同的 GitHub 仓库中，复制后的内容也难以跟随来源更新。</p><h2>从项目文件到团队资产</h2><p>Harhub 是 Harness Hub 的简称。它通过 Library 管理团队可复用的 Agent Skills 与 MCP 配置，并通过 Projects 连接实际代码仓库。</p><p>管理员连接 GitHub App 并导入仓库后，Harhub 会扫描仓库中的 Agent Skills，索引 SKILL.md 和相关资源文件。团队完成审查后，可以将仓库中的 Skill 收录到 Library。</p><h2>贯通资产的完整生命周期</h2><p>Harhub 管理团队 Harness 资产从收录、版本化到项目分发和变更回流的完整过程，并将关键变更放回 GitHub 的代码审查流程中。</p><h3>收录既有资产</h3><p>团队可以从 Project 中审查并收录现有 Skills，也可以上传 ZIP 包或通过兼容的 npx skills add 命令导入远程 Skill。</p><h3>将资产分发到项目</h3><p>Harhub 将资产的新增或删除转换为可审查的 pull request。合并后，Harhub 重新扫描仓库并更新 Project inventory。</p><h3>审查并回流仓库变更</h3><p>当开发者在本地修改 Skills 并推送到 GitHub 后，Harhub 会检测仓库中的资产变更。团队审查并确认同步后，新内容会回流到 Library，成为该资产的新版本。</p><h2>以 GitHub 审查流程为治理边界</h2><p>Harhub 在 Library 与代码仓库之间维护明确的资产关系，同时保留团队既有的 GitHub 权限、分支保护与代码审查机制。</p><p><a href="https://github.com/RockChinQ/harhub">Harhub 开源仓库</a></p><p>本文由 RockChinQ 撰写，原文首发于 <a href="https://rockchin.top/posts/harhub-introduction/">rockchin.top</a>。</p></article></main>`
    };
  }

  if (pathname.startsWith("/blog/")) {
    return noindexMetadata(pathname, "Article not found — Harhub Blog", "The requested Harhub Blog article does not exist.", 404);
  }

  if (pathname !== "/") {
    const applicationRoute = /^\/(skills|mcps|projects|forge|workspace|account)(\/|$)/.test(pathname);
    return noindexMetadata(
      pathname,
      applicationRoute ? "Harhub application" : "Page not found — Harhub",
      applicationRoute ? "Harhub workspace application." : "The requested Harhub page does not exist.",
      applicationRoute ? 200 : 404
    );
  }

  return {
    title: "Harhub — Agent Skills and MCP asset control for GitHub teams",
    description: "Govern reusable Agent Skills and MCP assets, connect GitHub repositories, detect drift, and turn changes into reviewable pull requests.",
    canonical: `${ORIGIN}/`,
    type: "website",
    locale: "en_US",
    image: SOCIAL_IMAGE,
    imageAlt: "Harhub Library to GitHub repository workflow",
    robots: "index, follow, max-image-preview:large",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        { "@type": "WebSite", "@id": `${ORIGIN}/#website`, name: "Harhub", url: `${ORIGIN}/`, description: "Agent Skills and MCP asset control for GitHub teams.", publisher: { "@id": ORGANIZATION_ID } },
        { "@type": "SoftwareApplication", "@id": `${ORIGIN}/#software`, name: "Harhub", applicationCategory: "DeveloperApplication", operatingSystem: "Web", url: `${ORIGIN}/`, description: "Govern reusable Agent Skills and MCP assets across GitHub repositories.", codeRepository: "https://github.com/RockChinQ/harhub", publisher: { "@id": ORGANIZATION_ID } }
      ]
    },
    prerenderedBody: `<main><header><h1>Keep every repo in sync.</h1><p>Harhub governs reusable Agent Skills and MCP assets, connects GitHub repositories, detects drift, and turns changes into reviewable pull requests.</p><p><a href="/projects">Open Harhub</a> <a href="/docs/">Read the docs</a> <a href="/blog">Harhub Blog</a></p></header><section><h2>Library to repository to reviewable PR</h2><p>Store reusable assets in the Harhub Library, inventory Skills and MCP configurations in connected repositories, and review proposed changes before merge.</p></section></main>`
  };
}

function noindexMetadata(pathname: string, title: string, description: string, statusCode: number): SeoMetadata {
  return {
    title,
    description,
    canonical: `${ORIGIN}${pathname}`,
    type: "website",
    locale: "en_US",
    image: SOCIAL_IMAGE,
    imageAlt: "Harhub",
    robots: "noindex, nofollow",
    jsonLd: {},
    statusCode,
    prerenderedBody: statusCode === 404 ? `<main><h1>Page not found</h1><p>${description}</p></main>` : ""
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function escapeJsonForHtml(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function injectSeoMetadata(html: string, metadata: SeoMetadata): string {
  const tags = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="robots" content="${escapeHtml(metadata.robots)}" />`,
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:type" content="${metadata.type}" />`,
    `<meta property="og:url" content="${escapeHtml(metadata.canonical)}" />`,
    `<meta property="og:locale" content="${metadata.locale}" />`,
    `<meta property="og:site_name" content="Harhub" />`,
    `<meta property="og:image" content="${escapeHtml(metadata.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeHtml(metadata.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(metadata.image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(metadata.imageAlt)}" />`,
    metadata.publishedTime ? `<meta property="article:published_time" content="${metadata.publishedTime}" />` : "",
    metadata.author ? `<meta property="article:author" content="${escapeHtml(metadata.author)}" />` : "",
    Object.keys(metadata.jsonLd).length ? `<script type="application/ld+json">${escapeJsonForHtml(metadata.jsonLd)}</script>` : ""
  ].filter(Boolean).join("\n    ");

  return html
    .replace('<html lang="en">', `<html lang="${metadata.locale === "zh_CN" ? "zh-CN" : "en"}">`)
    .replace("<!--seo-head-->", tags)
    .replace("<!--seo-body-->", metadata.prerenderedBody ?? "");
}
