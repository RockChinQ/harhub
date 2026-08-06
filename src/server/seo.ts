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
      prerenderedBody: `<main><header><p>Harhub Blog</p><h1>Notes on building better agent infrastructure.</h1><p>Product thinking, engineering decisions, and field notes from building Harhub in the open.</p></header><article><time datetime="2026-08-05">August 5, 2026</time><h2><a href="/blog/harhub-introduction">整了个为团队管理 Skills、MCPs 资产的工具</a></h2><p>为什么团队需要一个连接 Library、GitHub Projects 与 reviewable PR 的 Harness 资产控制平面。</p></article></main>`
    };
  }

  if (pathname === "/blog/harhub-introduction") {
    return {
      title: "整了个为团队管理 Skills、MCPs 资产的工具 — Harhub Blog",
      description: "从散落在 GitHub 仓库里的 Skills，到可治理、可分发、可回流并通过 reviewable PR 更新的团队 Harness 资产。",
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
        headline: "整了个为团队管理 Skills、MCPs 资产的工具",
        description: "从散落在 GitHub 仓库里的 Skills，到可治理、可分发、可回流并通过 reviewable PR 更新的团队 Harness 资产。",
        datePublished: "2026-08-05T00:00:00Z",
        inLanguage: "zh-CN",
        image: SOCIAL_IMAGE,
        author: { "@type": "Person", name: "RockChinQ", url: "https://rockchin.top/" },
        publisher: { "@id": ORGANIZATION_ID },
        mainEntityOfPage: `${ORIGIN}/blog/harhub-introduction`,
        isPartOf: { "@id": `${ORIGIN}/blog#blog` }
      },
      prerenderedBody: `<main><article><header><time datetime="2026-08-05">August 5, 2026</time><h1>整了个为团队管理 Skills、MCPs 资产的工具</h1><p>从散落在 GitHub 仓库里的 Skills，到可治理、可分发、可回流并通过 reviewable PR 更新的团队 Harness 资产。</p></header><p>团队内的 Skill 越来越多，新产品要使用已有 Skill 时，逐个筛选并复制到新仓库既麻烦，也会让内容变成无法随来源更新的副本。</p><p>Harhub 是 Harness Hub 的简称，基于 GitHub 生态治理 Skills 和 MCPs。Harhub 使用 Library 存储团队资产，并通过 Projects 绑定 GitHub 仓库。</p><h2>不只是 starter</h2><p>Harhub 承担团队 Harness 资产的存储、整理、分发和回流流程。管理员连接 GitHub App 并导入仓库后，Harhub 会扫描任意路径下的 SKILL.md 及相关资源。</p><h3>绑定现有资产</h3><p>仓库内已有的 Skills 可以经过 Review 加入 Library，也可以通过 ZIP 或兼容的 skills 命令导入。</p><h3>管理项目中的 Skills</h3><p>团队可以在 Harhub 中向 Project 添加或删除 Skills。Harhub 将改动转为可审查的 pull request，合并后重新同步仓库 inventory。</p><h3>资产改动回流</h3><p>当 Skills 在 Codex、Claude Code 或其他本地环境中被修改并推送到 GitHub，Harhub 会检测 drift。Review 后，最新内容可以回流到全局 Library，并保留版本记录。</p><p><a href="https://github.com/RockChinQ/harhub">Harhub 开源仓库</a></p></article></main>`
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
