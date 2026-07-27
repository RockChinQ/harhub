import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";

const basePath = process.env.HARHUB_DOCS_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.harhub.rcpd.cc"),
  title: { default: "Harhub 文档", template: "%s | Harhub 文档" },
  description: "Harhub 用户与 Agent 操作文档：管理、复用并交付团队的 Agent Skills。",
  icons: { icon: `${basePath}/harhub-icon.svg` },
  openGraph: { images: [`${basePath}/harhub-social-preview.png`] }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN" suppressHydrationWarning><body className="flex min-h-screen flex-col"><RootProvider search={{ enabled: true }}>{children}</RootProvider></body></html>;
}
