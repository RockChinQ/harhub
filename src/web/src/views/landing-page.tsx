import {
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  Command,
  FileArchive,
  Github,
  ShieldCheck,
  Sparkles
} from "lucide-react";

import { Button } from "../components/ui/button";

const capabilities = [
  {
    title: "Skill asset control",
    description: "Upload zip packages, validate standard SKILL.md metadata, and keep approved assets discoverable."
  },
  {
    title: "Workspace governance",
    description: "Manage teams, roles, invitations, and shared catalogs without scattering agent context across repos."
  },
  {
    title: "CLI to cloud",
    description: "Scan local repositories, package Skills, and publish them to a hosted or self-managed Harhub workspace."
  }
];

const proofPoints = [
  "Agent Skills first",
  "S3-compatible storage",
  "Workspace tenants",
  "OAuth and email login"
];

export function LandingPage({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <main className="h-svh overflow-y-auto bg-white text-slate-950">
      <section className="relative min-h-svh overflow-hidden bg-slate-950 text-white">
        <img
          src="/brand/harhub-preview.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex h-14 shrink-0 items-center justify-between gap-4">
            <a href="/" className="flex min-w-0 items-center gap-3" aria-label="Harhub home">
              <img src="/brand/harhub-icon.svg" alt="" className="h-9 w-9 shrink-0" />
              <span className="truncate text-sm font-semibold tracking-wide">Harhub</span>
            </a>
            <nav className="flex items-center gap-2">
              <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
                <a href="/docs/">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  Docs
                </a>
              </Button>
              <Button asChild variant="secondary" className="bg-white text-slate-950 hover:bg-blue-50">
                <a href="/skills">
                  {isSignedIn ? "Open app" : "Sign in"}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            </nav>
          </header>

          <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.75fr)]">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-3 py-1 text-xs font-medium text-blue-100">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Asset control for agent teams
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal sm:text-6xl lg:text-7xl">
                Keep your agent Skills trusted, reusable, and ready to ship.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
                Harhub gives teams a shared control plane for Agent Skills: upload packages,
                validate the official contract, preview contents, and invite collaborators into
                workspace-scoped asset libraries.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-blue-600 text-white hover:bg-blue-500">
                  <a href="/skills">
                    Launch Harhub
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="/docs/">
                    Read the docs
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
              <div className="mt-8 grid max-w-xl grid-cols-2 gap-3 text-sm text-slate-200 sm:grid-cols-4">
                {proofPoints.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-2xl shadow-blue-950/40 backdrop-blur">
              <img
                src="/brand/harhub-preview.png"
                alt="Harhub Skills workspace preview"
                className="aspect-[4/3] w-full rounded-md object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b bg-white px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {capabilities.map((item, index) => {
            const Icon = index === 0 ? FileArchive : index === 1 ? ShieldCheck : Command;
            return (
              <article key={item.title} className="rounded-lg border bg-white p-6 shadow-sm">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="text-base font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-slate-50 px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 rounded-lg border bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-600">
              <Boxes className="h-4 w-4" aria-hidden="true" />
              Built for the broader harness layer
            </div>
            <h2 className="text-2xl font-semibold">Skills today. MCPs, rules, and instructions next.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Harhub starts with the most concrete agent asset type, then keeps the product
              boundary ready for more harness assets without inventing a competing Skill format.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <a href="https://github.com/RockChinQ/harhub">
                <Github className="h-4 w-4" aria-hidden="true" />
                GitHub
              </a>
            </Button>
            <Button asChild>
              <a href="/docs/guide/getting-started">
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
