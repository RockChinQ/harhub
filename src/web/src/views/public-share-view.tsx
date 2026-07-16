import { Check, Copy, Download, Loader2, PackageOpen, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import type { AssetShareResponse } from "../../../shared/types";
import { healthBadgeClass } from "../app/format";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { getPublicAssetShare } from "../lib/api";

export function PublicShareView({ shareToken }: { shareToken: string }) {
  const [share, setShare] = useState<AssetShareResponse | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState<"harhub" | "skills" | undefined>();

  useEffect(() => {
    let active = true;
    setShare(undefined);
    setError(undefined);
    getPublicAssetShare(shareToken)
      .then((nextShare) => {
        if (active) setShare(nextShare);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      active = false;
    };
  }, [shareToken]);

  async function copyInstallCommand(kind: "harhub" | "skills", command: string) {
    await navigator.clipboard.writeText(command);
    setCopied(kind);
    window.setTimeout(() => setCopied(undefined), 1800);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-2xl">
        {!share && !error ? (
          <CardContent className="flex min-h-72 items-center justify-center pt-6 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            Loading shared skill…
          </CardContent>
        ) : null}

        {error ? (
          <>
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <PackageOpen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </div>
              <CardTitle>Share unavailable</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The owner may have revoked this link or deleted the skill.
            </CardContent>
          </>
        ) : null}

        {share ? (
          <>
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <PackageOpen className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-2xl">{share.asset.displayName}</CardTitle>
                <Badge variant="secondary" className={healthBadgeClass(share.asset.health)}>
                  {share.asset.health}
                </Badge>
              </div>
              <CardDescription className="pt-2 text-base leading-6">
                {share.asset.description || share.asset.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                {share.asset.validation.errors === 0
                  ? "This package has no validation errors."
                  : `${share.asset.validation.errors} validation error(s) reported.`}
              </div>

              <div className="grid gap-2">
                <div>
                  <div className="text-sm font-medium">Install with the Harhub CLI</div>
                  <div className="text-xs text-muted-foreground">
                    Downloads the verified package and installs it into your selected Agent.
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input readOnly value={share.cliCommand} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={() => copyInstallCommand("harhub", share.cliCommand)} aria-label="Copy Harhub CLI command">
                    {copied === "harhub" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <div>
                  <div className="text-sm font-medium">Install with the Agent Skills CLI</div>
                  <div className="text-xs text-muted-foreground">
                    Works with Codex, Claude Code, Cursor, OpenCode, and other compatible Agents.
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input readOnly value={share.skillsCliCommand} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={() => copyInstallCommand("skills", share.skillsCliCommand)} aria-label="Copy Agent Skills CLI command">
                    {copied === "skills" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3">
              <Button asChild>
                <a href={share.downloadUrl}>
                  <Download aria-hidden="true" />
                  Download {share.fileName}
                </a>
              </Button>
              <span className="text-xs text-muted-foreground">Shared from Harhub</span>
            </CardFooter>
          </>
        ) : null}
      </Card>
    </main>
  );
}
