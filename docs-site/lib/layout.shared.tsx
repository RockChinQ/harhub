import Image from "next/image";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <span className="flex items-center gap-2 font-semibold"><Image className="harhub-mark" src="/docs/harhub-icon.svg" alt="" width={28} height={28} />Harhub</span> },
    links: [
      { text: "使用流程", url: "/workflow" },
      { text: "Agent 使用", url: "/agent" },
      { text: "打开 Harhub", url: "https://harhub.rcpd.cc", external: true }
    ],
    githubUrl: "https://github.com/RockChinQ/harhub"
  };
}
