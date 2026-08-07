import { ArrowLeft, ArrowRight, BookOpen, Github } from "lucide-react";

import { Button } from "../components/ui/button";
import { blogPosts, findBlogPost } from "../content/blog-posts";

const sourceImage = (name: string) => `https://rockchin.top/images/${name}`;

export function BlogPage({ slug, isSignedIn }: { slug?: string; isSignedIn: boolean }) {
  const post = findBlogPost(slug);

  return (
    <main className="min-h-svh bg-[#fffdf8] text-[#17202a]">
      <MarketingHeader isSignedIn={isSignedIn} />
      {slug && !post ? <BlogNotFound /> : post ? <BlogArticle /> : <BlogIndex />}
      <MarketingFooter />
    </main>
  );
}

function MarketingHeader({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#17202a]/10 bg-[#fffdf8]/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-3" aria-label="Harhub home">
          <img src="/brand/harhub-icon.svg" alt="" className="h-10 w-10" />
          <span className="text-lg font-black tracking-[-0.04em]">harhub</span>
        </a>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="font-bold text-[#17202a] hover:bg-[#f2f0ea] hover:text-[#17202a]"><a href="/blog">Blog</a></Button>
          <Button asChild variant="ghost" className="hidden font-bold text-[#17202a] hover:bg-[#f2f0ea] hover:text-[#17202a] sm:inline-flex"><a href="/docs/"><BookOpen /> Docs</a></Button>
          <Button asChild className="bg-[#17202a] font-black text-white hover:bg-[#2b3944]"><a href="/projects">{isSignedIn ? "Open app" : "Sign in"}<ArrowRight /></a></Button>
        </nav>
      </div>
    </header>
  );
}

function BlogIndex() {
  return (
    <>
      <section className="border-b border-[#17202a]/10 bg-[#f2f0ea] px-5 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-5 text-sm font-black uppercase tracking-[0.15em] text-[#e45b3c]">Harhub Blog</div>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.94] tracking-[-0.06em] sm:text-7xl">Notes on building better agent infrastructure.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#65717b]">Product thinking, engineering decisions, and field notes from building Harhub in the open.</p>
        </div>
      </section>
      <section className="px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-7 text-xs font-black uppercase tracking-[0.14em] text-[#65717b]">Latest article</div>
          {blogPosts.map((post) => (
            <article key={post.slug} className="grid gap-8 rounded-3xl border-2 border-[#17202a] bg-white p-7 shadow-[6px_6px_0_#f5d85b] md:grid-cols-[1fr_auto] md:items-end sm:p-10">
              <div>
                <div className="mb-5 flex flex-wrap items-center gap-3 text-sm font-bold text-[#65717b]"><time dateTime={post.publishedAt}>August 5, 2026</time><span aria-hidden="true">·</span><span>{post.author}</span></div>
                <h2 className="max-w-3xl text-3xl font-black leading-tight tracking-[-0.045em] sm:text-5xl"><a href={`/blog/${post.slug}`} className="hover:text-[#e45b3c]">{post.title}</a></h2>
                <p className="mt-5 max-w-3xl text-base leading-7 text-[#65717b]">{post.excerpt}</p>
                <div className="mt-6 flex flex-wrap gap-2">{post.tags.map((tag) => <span key={tag} className="rounded-full border border-[#17202a]/15 bg-[#f2f0ea] px-3 py-1 text-xs font-black">{tag}</span>)}</div>
              </div>
              <Button asChild size="lg" className="bg-[#e45b3c] font-black text-white hover:bg-[#c94d32]"><a href={`/blog/${post.slug}`}>Read article<ArrowRight /></a></Button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function BlogArticle() {
  return (
    <article itemScope itemType="https://schema.org/BlogPosting">
      <header className="border-b border-[#17202a]/10 bg-[#f2f0ea] px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto max-w-[900px]">
          <a href="/blog" className="mb-10 inline-flex items-center gap-2 text-sm font-black text-[#65717b] hover:text-[#17202a]"><ArrowLeft className="h-4 w-4" /> Back to Blog</a>
          <div className="mb-5 flex flex-wrap items-center gap-3 text-sm font-bold text-[#65717b]"><time dateTime="2026-08-05">August 5, 2026</time><span aria-hidden="true">·</span><span>RockChinQ</span></div>
          <h1 itemProp="headline" className="text-4xl font-black leading-[1.02] tracking-[-0.055em] sm:text-6xl">Harhub：面向团队的 Agent Skills 与 MCP 资产治理平台</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-[#65717b]">以 GitHub 为协作基础，建立 Agent Skills 与 MCP 配置的统一资产库，并贯通收录、分发、变更审查和版本回流。</p>
          <div className="mt-7 flex flex-wrap gap-2">{["Harhub", "Harness", "Skills", "MCP"].map((tag) => <span key={tag} className="rounded-full border border-[#17202a]/15 bg-white px-3 py-1 text-xs font-black">{tag}</span>)}</div>
        </div>
      </header>
      <div className="mx-auto max-w-[900px] px-5 py-14 sm:px-8 sm:py-20">
        <ArticleBody />
      </div>
    </article>
  );
}

function ArticleBody() {
  const imageClass = "my-9 w-full rounded-2xl border border-[#17202a]/15 bg-[#f2f0ea] shadow-sm";
  return (
    <div className="space-y-7 text-[17px] leading-8 text-[#35414a] [&_h2]:pt-10 [&_h2]:text-3xl [&_h2]:font-black [&_h2]:tracking-[-0.045em] [&_h3]:pt-7 [&_h3]:text-2xl [&_h3]:font-black [&_h3]:tracking-[-0.035em] [&_p_strong]:font-black [&_p_strong]:text-[#17202a]">
      <p>随着团队在多个项目中持续使用 coding agents，可复用的 Agent Skills 与 MCP 配置逐渐成为一类需要长期维护的工程资产。它们通常分散在不同的 GitHub 仓库中。新项目需要复用既有能力时，开发者往往只能重新检索和复制文件；复制后的内容与来源脱离，后续更新也难以同步。</p>
      <p>最初，我们通过 harness-starter 验证了一条生成式工作流：用户描述产品需求并补充目标用户、交付形式和技术栈等信息，系统再从团队已有资产中选取合适的 Skills 与 MCP 配置，结合模板生成可交付给 coding agent 的项目框架。这项实践也暴露了更基础的问题：团队缺少一个统一的资产来源，以及连接资产库与项目仓库的双向更新机制。</p>
      <img className={imageClass} src={sourceImage("20260805-210502.png")} alt="Harness starter workflow" loading="lazy" />

      <h2>从项目文件到团队资产</h2>
      <p><strong>Harhub</strong>（Harness Hub）由此产生。它以 GitHub 为协作基础，通过 Library 管理团队可复用的 Agent Skills 与 MCP 配置，并通过 Projects 连接实际代码仓库。</p>
      <img className={imageClass} src={sourceImage("20260805-210725.png")} alt="Harhub Projects and Library" loading="lazy" />
      <p>工作区管理员连接 GitHub App 并导入仓库后，Harhub 会扫描仓库中的 Agent Skills，索引其 <code className="rounded-md bg-[#f2f0ea] px-1.5 py-1 font-mono text-sm text-[#17202a]">SKILL.md</code> 和相关资源文件。团队完成审查后，即可将仓库中的 Skill 收录到 Library，作为后续分发和版本管理的来源。</p>
      <img className={imageClass} src={sourceImage("20260805-211551.png")} alt="Harhub repository inventory" loading="lazy" />
      <p>Harhub 也保留了 harness-starter 所验证的生成能力。在 Forge 中，用户可以描述需求并回答补充问题；系统根据上下文选择相关的 Skills 和 MCP 配置，生成一套位于 <code className="rounded-md bg-[#f2f0ea] px-1.5 py-1 font-mono text-sm text-[#17202a]">.harness</code> 目录中的项目框架。</p>
      <img className={imageClass} src={sourceImage("20260805-220215.png")} alt="Harhub Forge" loading="lazy" />

      <h2>贯通资产的完整生命周期</h2>
      <p>Harhub 的职责不止是生成项目框架。它管理团队 Harness 资产从收录、版本化到项目分发和变更回流的完整过程，并将关键变更放回 GitHub 的代码审查流程中。</p>

      <h3>收录既有资产</h3>
      <p>团队可以从已连接的 Project 中审查并收录现有 Skills，也可以上传 ZIP 包，或通过兼容的 <code className="rounded-md bg-[#f2f0ea] px-1.5 py-1 font-mono text-sm text-[#17202a]">npx skills add</code> 命令导入远程 Skill。无论来源如何，资产都会进入统一的 Library 管理流程。</p>
      <img className={imageClass} src={sourceImage("20260805-221700.png")} alt="Bind repository Skills to Harhub Library" loading="lazy" />

      <h3>将资产分发到项目</h3>
      <p>团队可以在 Harhub 中选择 Library 资产并添加到 Project，无需先将仓库克隆到本地。</p>
      <img className={imageClass} src={sourceImage("20260806-161852.png")} alt="Add Library Skills to a Project" loading="lazy" />
      <img className={imageClass} src={sourceImage("20260806-163034.png")} alt="Review a Harhub change proposal" loading="lazy" />
      <p>Harhub 会把新增或删除操作转换为可审查的 pull request。合并后，Harhub 重新扫描仓库并更新 Project inventory，使 Library 中的管理状态与 GitHub 中的实际内容保持一致。</p>

      <h3>审查并回流仓库变更</h3>
      <p>开发者仍可在本地使用 Codex、Claude Code 或其他工具修改项目中的 Skills。变更推送到 GitHub 后，Harhub 会在下一次扫描中检测仓库中的资产变更，并将其与 Library 中的受管版本进行比较。</p>
      <img className={imageClass} src={sourceImage("20260806-163416.png")} alt="Harhub detects repository Skill changes" loading="lazy" />
      <img className={imageClass} src={sourceImage("20260806-163441.png")} alt="Review repository drift in Harhub" loading="lazy" />
      <p>团队审查差异并确认同步后，仓库中的新内容会回流到 Library，成为该资产的新版本。版本历史保留了每次已接受的变更，便于后续追踪和分发。</p>
      <img className={imageClass} src={sourceImage("20260806-162902.png")} alt="Updated Skill in the Library" loading="lazy" />
      <img className={imageClass} src={sourceImage("20260806-162915.png")} alt="Version history for a Harhub asset" loading="lazy" />

      <h2>以 GitHub 审查流程为治理边界</h2>
      <p>Harhub 不替代 GitHub，而是在 Library 与代码仓库之间维护明确的资产关系。面向项目的变更通过 pull request 进入仓库；仓库中的改动经过审查后再回流到 Library。团队因此可以继续使用既有的权限、分支保护和代码审查机制，同时获得跨项目的资产目录、版本记录与变更检测能力。</p>

      <div className="mt-12 rounded-3xl border-2 border-[#17202a] bg-[#f5d85b] p-7 shadow-[5px_5px_0_#17202a] sm:p-9">
        <h2 className="!pt-0">现在开始使用 Harhub</h2>
        <p className="mt-3 text-[#46515a]">连接 GitHub 仓库，建立可审查、可复用并保留版本记录的团队 Harness 资产库。</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button asChild className="bg-[#17202a] font-black text-white hover:bg-[#2b3944]"><a href="/projects">Open Harhub<ArrowRight /></a></Button><Button asChild variant="outline" className="bg-white font-black"><a href="https://github.com/RockChinQ/harhub"><Github /> View source</a></Button></div>
      </div>
      <p className="pt-4 text-sm text-[#65717b]">本文由 RockChinQ 撰写，原文首发于 <a className="font-bold underline underline-offset-4" href="https://rockchin.top/posts/harhub-introduction/">rockchin.top</a>。Harhub Blog 在保留原始事实与产品截图的基础上，对标题与正文结构进行了编辑整理。</p>
    </div>
  );
}

function BlogNotFound() {
  return <section className="px-5 py-28 text-center sm:px-8"><div className="mx-auto max-w-xl"><div className="text-sm font-black uppercase tracking-[0.15em] text-[#e45b3c]">404</div><h1 className="mt-4 text-5xl font-black tracking-[-0.055em]">Article not found.</h1><p className="mt-5 text-[#65717b]">This Harhub Blog article does not exist.</p><Button asChild className="mt-8 bg-[#17202a] font-black text-white"><a href="/blog"><ArrowLeft /> Back to Blog</a></Button></div></section>;
}

function MarketingFooter() {
  return <footer className="border-t border-[#17202a]/10 bg-[#f2f0ea] px-5 py-8 sm:px-8"><div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-4 text-sm font-bold text-[#65717b] sm:flex-row"><span>© 2026 Harhub</span><div className="flex gap-5"><a href="/docs/" className="hover:text-[#17202a]">Docs</a><a href="https://github.com/RockChinQ/harhub" className="hover:text-[#17202a]">GitHub</a></div></div></footer>;
}
