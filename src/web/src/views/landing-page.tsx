import { ArrowRight, BookOpen, Check, Github, GitPullRequestArrow, LibraryBig, Radar, RefreshCcw } from "lucide-react";

import { Button } from "../components/ui/button";
import { landingPageContent } from "./landing-page-content";

const steps = [
  { number: "01", title: "Map the harness", body: "Connect GitHub and see Skills, MCP configurations, rules, and instructions across repositories.", icon: Radar },
  { number: "02", title: "Share what works", body: "Keep approved, versioned assets in one Library and roll them out through reviewable pull requests.", icon: LibraryBig },
  { number: "03", title: "Keep improving", body: "Spot drift, preserve intentional overrides, and bring proven repository improvements back to the team.", icon: RefreshCcw }
];

export function LandingPage({ isSignedIn }: { isSignedIn: boolean }) {
  const content = landingPageContent(isSignedIn);
  return (
    <main className="h-svh overflow-y-auto bg-[#f2f0ea] text-[#17202a]">
      <section className="relative overflow-hidden border-b border-[#17202a]/10 bg-[#fffdf8] text-[#17202a]">
        <div className="relative mx-auto flex min-h-svh max-w-[1440px] flex-col px-5 py-5 sm:px-8 lg:px-12">
          <header className="flex h-16 items-center justify-between rounded-2xl border border-[#17202a]/12 bg-white/75 px-3 shadow-sm backdrop-blur sm:px-5">
            <a href="/" className="flex items-center gap-3" aria-label="Harhub home">
              <img src="/brand/harhub-icon.svg" alt="" className="h-10 w-10" />
              <span className="text-lg font-black tracking-[-0.04em]">harhub</span>
              <span className="hidden text-xs font-bold uppercase tracking-[0.14em] text-[#65717b] sm:inline">Harness together</span>
            </a>
            <nav className="flex items-center gap-2">
              <Button asChild variant="ghost" className="hidden text-[#17202a] hover:bg-[#f2f0ea] hover:text-[#17202a] sm:inline-flex"><a href="/blog">Blog</a></Button>
              <Button asChild variant="ghost" className="hidden text-[#17202a] hover:bg-[#f2f0ea] hover:text-[#17202a] sm:inline-flex"><a href="/docs/"><BookOpen /> Docs</a></Button>
              <Button asChild className="bg-[#17202a] font-black text-white hover:bg-[#2b3944]"><a href={content.primaryHref}>{isSignedIn ? "Open app" : "Sign in"}<ArrowRight /></a></Button>
            </nav>
          </header>

          <div className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
            <div className="max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#17202a]/15 bg-[#f2f0ea] px-4 py-2 text-xs font-black uppercase tracking-[0.13em] text-[#65717b]">Repository-native control for agent teams</div>
              <h1 className="text-[clamp(3.4rem,7vw,7.2rem)] font-black leading-[0.9] tracking-[-0.07em]">Make your agent setup <span className="text-[#e45b3c]">click.</span></h1>
              <p className="mt-8 max-w-xl text-lg leading-8 text-[#65717b]">{content.description}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-[#e45b3c] font-black text-white shadow-[4px_4px_0_#f5d85b] hover:bg-[#c94d32]"><a href={content.primaryHref}>{content.primaryAction}<ArrowRight /></a></Button>
                <Button asChild size="lg" variant="outline" className="font-black"><a href="/docs/">Read the docs<BookOpen /></a></Button>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-[#65717b]">
                {content.proofPoints.map((point) => <span key={point} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#287f65]" />{point}</span>)}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[680px]">
              <div className="absolute -left-4 top-8 z-10 -rotate-3 rounded-xl border-2 border-[#17202a] bg-[#f5d85b] px-3 py-2 text-xs font-black shadow-[3px_3px_0_#17202a] sm:-left-7">Verified ✓</div>
              <img src="/brand/harhub-harness-map.svg" alt="Harhub connects repositories, a shared Library, drift review, and pull requests" className="w-full drop-shadow-[0_20px_30px_rgba(23,32,42,0.14)]" />
            </div>
          </div>
          <a href="#workflow" className="mx-auto mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-[#65717b]">Explore the loop <ArrowRight className="h-4 w-4" /></a>
        </div>
      </section>

      <section id="workflow" className="border-b border-[#17202a]/15 bg-[#fffdf8] px-5 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1320px]">
          <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-[#e45b3c]"><GitPullRequestArrow className="h-5 w-5" /> One clear loop</div><h2 className="max-w-2xl text-4xl font-black leading-none tracking-[-0.055em] sm:text-5xl">From repository change to shared confidence.</h2></div><p className="max-w-lg text-base leading-7 text-[#65717b]">The Library and the repository work together. Harhub keeps the handoff visible, reviewable, and easy to repeat.</p></div>
          <div className="grid gap-5 md:grid-cols-3">{steps.map(({ number, title, body, icon: Icon }, index) => <article key={title} className="rounded-3xl border-2 border-[#17202a] bg-white p-7 shadow-[6px_6px_0_#17202a] transition-transform hover:-translate-y-1"><div className="mb-8 flex items-center justify-between"><div className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#17202a] ${index === 0 ? "bg-[#fff0eb] text-[#e45b3c]" : index === 1 ? "bg-[#edf0ff] text-[#4c64d9]" : "bg-[#e8f6f0] text-[#287f65]"}`}><Icon className="h-7 w-7" /></div><span className="font-mono text-sm font-black text-[#a5adb1]">{number}</span></div><h3 className="text-2xl font-black tracking-[-0.04em]">{title}</h3><p className="mt-3 text-sm leading-6 text-[#65717b]">{body}</p></article>)}</div>
        </div>
      </section>

      <section className="bg-[#f5d85b] px-5 py-20 sm:px-8 lg:px-12"><div className="mx-auto grid max-w-[1320px] items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]"><div><div className="mb-5 inline-flex items-center gap-2 rounded-full border-2 border-[#17202a] bg-[#17202a] px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#f5d85b]"><LibraryBig className="h-4 w-4" /> Built for the whole harness</div><h2 className="text-4xl font-black leading-none tracking-[-0.055em] sm:text-5xl">Less copy-paste.<br />More shared momentum.</h2><p className="mt-5 max-w-xl text-base font-medium leading-7 text-[#46515a]">Versioned Skills and MCP configurations live in the Library. Repository-owned rules and instructions stay visible. Every rollout remains reviewable through GitHub.</p></div><div className="rounded-3xl border-2 border-[#17202a] bg-[#fffdf8] p-6 shadow-[8px_8px_0_#17202a] sm:p-8"><div className="grid gap-3 sm:grid-cols-2">{content.proofPoints.map((point, index) => <div key={point} className="flex items-center gap-3 rounded-2xl border border-[#17202a]/15 bg-white p-4"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index % 2 ? "bg-[#e8f6f0] text-[#287f65]" : "bg-[#fff0eb] text-[#e45b3c]"}`}><Check className="h-5 w-5" /></span><span className="text-sm font-black">{point}</span></div>)}</div><div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end"><Button asChild variant="outline" className="font-black"><a href="https://github.com/RockChinQ/harhub"><Github /> View on GitHub</a></Button><Button asChild className="bg-[#ff704f] font-black text-white hover:bg-[#e45b3c]"><a href="/docs/guide/getting-started">Get started<ArrowRight /></a></Button></div></div></div></section>
    </main>
  );
}
