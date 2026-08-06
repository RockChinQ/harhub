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
    <article>
      <header className="border-b border-[#17202a]/10 bg-[#f2f0ea] px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto max-w-[900px]">
          <a href="/blog" className="mb-10 inline-flex items-center gap-2 text-sm font-black text-[#65717b] hover:text-[#17202a]"><ArrowLeft className="h-4 w-4" /> Back to Blog</a>
          <div className="mb-5 flex flex-wrap items-center gap-3 text-sm font-bold text-[#65717b]"><time dateTime="2026-08-05">August 5, 2026</time><span aria-hidden="true">·</span><span>RockChinQ</span></div>
          <h1 className="text-4xl font-black leading-[1.02] tracking-[-0.055em] sm:text-6xl">整了个为团队管理 Skills、MCPs 资产的工具</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-[#65717b]">从散落在仓库里的 Skills，到可治理、可分发、可回流的团队 Harness 资产。</p>
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
      <p>前两周我 +1 在搞 Dify 的新版 RAG，几个人发现团队内的 Skill 越来越多。如果有新产品要用到已有的 Skill，还得全部筛选并拷贝到新仓库，显得很麻烦。于是他整了个叫 harness-starter 的东西，主要为非技术人员打造：比如公司内的非研发同事有需求，打算用 Codex / Claude Code 自己 vibe 一个新的产品来解决问题，harness-starter 就会根据用户的初始描述提出一系列跟进问题，例如产品主要面向哪些用户、交付形式、产品细节、所使用的技术栈等，然后根据这一堆 context 挑选团队内已有的 Skills，结合预制模板生成一整个可以直接交接给 coding agent 的框架。</p>
      <p>但是做着就发现有很多问题。首先是 Harness 资产的来源：以 Skills 为例，目前团队里已有的 Skills 都散落在各个仓库里，需要让 Codex 扫描一遍放入 harness-starter 仓库里才能使用，而存进来的也只是副本，没法随来源更新。其次是新项目所使用的 Harness 资产，在来源更新之后也没办法高效地被更新；Harness 资产的双向路径都没有被打通。为了解决这些复杂问题，有必要引入一个新的平台来承接团队间 Harness 资产管理的工作了。</p>
      <img className={imageClass} src={sourceImage("20260805-210502.png")} alt="Harness starter workflow" loading="lazy" />
      <p>目前暂定名为 <strong>Harhub</strong>，Harness Hub 的简称，同样是基于 GitHub 生态去做各类 Skills / MCPs 的治理路径。Harhub 内部建立 Library 存储资产，而引入 Anchor / Projects 的概念绑定 GitHub 仓库：</p>
      <img className={imageClass} src={sourceImage("20260805-210725.png")} alt="Harhub Projects and Library" loading="lazy" />
      <p>Harhub 仍然是强绑定于 GitHub 的，便于团队快速引入。工作区管理员只需要绑定 GitHub App 并导入 GitHub 仓库，Harhub 即可自动扫描并索引仓库内任何路径下的 Skill 完整内容，包括 SKILL.md 和相关资源文件。</p>
      <img className={imageClass} src={sourceImage("20260805-211551.png")} alt="Harhub repository inventory" loading="lazy" />
      <p>在 Review 之后，即可添加到 Library 里。</p>
      <p>同样地，我们也把 harness-starter 的功能整合进了 Harhub。在 Forge 页面简单描述需求、回答跟进问题，内置 AI 将自动选取相关的 Skills 和 MCP，放入 <code className="rounded-md bg-[#f2f0ea] px-1.5 py-1 font-mono text-sm text-[#17202a]">.harness</code> 目录里。</p>
      <img className={imageClass} src={sourceImage("20260805-220215.png")} alt="Harhub Forge" loading="lazy" />

      <h2>不只是 starter</h2>
      <p>做完这一套之后，就发现 harness-starter / Harhub 不只是一个可以根据业务需求生成 Harness 骨架的工具了，更可以承担团队内 Harness 资产（Skills / MCPs，以及后续会支持的 AGENTS.md 规则）的治理平台，接管存储、整理、分发、回流等全流程。</p>

      <h3>绑定现有资产</h3>
      <p>通过已有 Project 绑定，并入库仓库内已有的 Skills。也支持直接上传 zip 文件到 Library，或者通过 npx skills 命令下载来自 skills.sh 的 Skills。</p>
      <img className={imageClass} src={sourceImage("20260805-221700.png")} alt="Bind repository Skills to Harhub Library" loading="lazy" />

      <h3>增删改查各个项目的 Skills</h3>
      <p>现在不需要把仓库克隆到本地，即可在 Harhub 平台上闭环，把 Skills 添加到 Project：</p>
      <img className={imageClass} src={sourceImage("20260806-161852.png")} alt="Add Library Skills to a Project" loading="lazy" />
      <img className={imageClass} src={sourceImage("20260806-163034.png")} alt="Review a Harhub change proposal" loading="lazy" />
      <p>Harhub 会自动为这次更改提出 PR，合并之后即会同步索引到 Project 里。对应的删除操作也是一样的路径。</p>

      <h3>资产改动回流</h3>
      <p>还有一种情况：我们在其他地方（比如本地的 Codex / Claude Code）修改了项目中的 Skills 等内容，希望能同步回全局 Library。修改推送到 GitHub 后，Harhub 会自动检测到 Skills 文件的变化：</p>
      <img className={imageClass} src={sourceImage("20260806-163416.png")} alt="Harhub detects repository Skill changes" loading="lazy" />
      <img className={imageClass} src={sourceImage("20260806-163441.png")} alt="Review repository drift in Harhub" loading="lazy" />
      <p>在 Review 更改并同步之后，即可在全局 Library 中看到这个 Skill 的最新内容已经被同步到团队资产库。</p>
      <img className={imageClass} src={sourceImage("20260806-162902.png")} alt="Updated Skill in the Library" loading="lazy" />
      <img className={imageClass} src={sourceImage("20260806-162915.png")} alt="Version history for a Harhub asset" loading="lazy" />
      <p>并且更改也会被版本化记录。</p>

      <div className="mt-12 rounded-3xl border-2 border-[#17202a] bg-[#f5d85b] p-7 shadow-[5px_5px_0_#17202a] sm:p-9">
        <h2 className="!pt-0">现在开始使用 Harhub</h2>
        <p className="mt-3 text-[#46515a]">连接你的 GitHub 仓库，开始建立团队可治理、可复用的 Harness 资产库。</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button asChild className="bg-[#17202a] font-black text-white hover:bg-[#2b3944]"><a href="/projects">Open Harhub<ArrowRight /></a></Button><Button asChild variant="outline" className="bg-white font-black"><a href="https://github.com/RockChinQ/harhub"><Github /> View source</a></Button></div>
      </div>
      <p className="pt-4 text-sm text-[#65717b]">本文首发于 <a className="font-bold underline underline-offset-4" href="https://rockchin.top/posts/harhub-introduction/">rockchin.top</a>，现同步收录于 Harhub Blog。</p>
    </div>
  );
}

function BlogNotFound() {
  return <section className="px-5 py-28 text-center sm:px-8"><div className="mx-auto max-w-xl"><div className="text-sm font-black uppercase tracking-[0.15em] text-[#e45b3c]">404</div><h1 className="mt-4 text-5xl font-black tracking-[-0.055em]">Article not found.</h1><p className="mt-5 text-[#65717b]">This Harhub Blog article does not exist.</p><Button asChild className="mt-8 bg-[#17202a] font-black text-white"><a href="/blog"><ArrowLeft /> Back to Blog</a></Button></div></section>;
}

function MarketingFooter() {
  return <footer className="border-t border-[#17202a]/10 bg-[#f2f0ea] px-5 py-8 sm:px-8"><div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-4 text-sm font-bold text-[#65717b] sm:flex-row"><span>© 2026 Harhub</span><div className="flex gap-5"><a href="/docs/" className="hover:text-[#17202a]">Docs</a><a href="https://github.com/RockChinQ/harhub" className="hover:text-[#17202a]">GitHub</a></div></div></footer>;
}
