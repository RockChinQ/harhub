import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Harhub",
  description: "Asset control for agent teams.",
  base: "/docs/",
  cleanUrls: true,
  outDir: "../dist/web/docs",
  head: [
    ["link", { rel: "icon", href: "/docs/harhub-icon.svg", type: "image/svg+xml" }],
    ["meta", { name: "theme-color", content: "#2563eb" }]
  ],
  themeConfig: {
    logo: "/harhub-icon.svg",
    siteTitle: "Harhub",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Product Notes", link: "/00-overview" },
      { text: "Demo", link: "https://harhub.rcpd.cc" }
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Agent Skills", link: "/guide/agent-skills" },
          { text: "CLI", link: "/guide/cli" },
          { text: "Deployment", link: "/guide/deployment" }
        ]
      },
      {
        text: "Product Notes",
        collapsed: true,
        items: [
          { text: "00 Overview", link: "/00-overview" },
          { text: "01 Problem and Gap Analysis", link: "/01-problem-and-gap-analysis" },
          { text: "02 Market Positioning", link: "/02-market-positioning" },
          { text: "03 Requirements", link: "/03-requirements" },
          { text: "04 Product Design", link: "/04-product-design" },
          { text: "05 Architecture", link: "/05-architecture" },
          { text: "06 Skill Standard", link: "/06-skill-standard" },
          { text: "07 SaaS MVP", link: "/07-saas-mvp" },
          { text: "08 Roadmap", link: "/08-roadmap" },
          { text: "09 MVP TODO", link: "/09-mvp-todo" },
          { text: "10 Sharing and Installation Loop", link: "/10-sharing-and-installation-loop" }
        ]
      }
    ],
    search: {
      provider: "local"
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/RockChinQ/harhub" }
    ],
    footer: {
      message: "Harhub is currently available as a beta release.",
      copyright: "Copyright © 2026 Harhub contributors"
    }
  }
});
