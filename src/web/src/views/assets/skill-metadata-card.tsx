import type { ReactNode } from "react";

const CORE_KEYS = new Set([
  "name",
  "description",
  "argument-hint",
  "argument_hint",
  "intent",
  "type",
  "theme",
  "estimated-time",
  "estimated_time",
  "best-for",
  "best_for",
  "scenarios"
]);

export function SkillMetadataCard({ metadata }: { metadata: Record<string, unknown> }) {
  const name = readText(metadata, "name");
  const description = readText(metadata, "description");
  const argumentHint = readText(metadata, "argument-hint", "argument_hint");
  const intent = readText(metadata, "intent");
  const type = readText(metadata, "type");
  const theme = readText(metadata, "theme");
  const estimatedTime = readText(metadata, "estimated-time", "estimated_time");
  const bestFor = readTextList(metadata, "best-for", "best_for");
  const scenarios = readTextList(metadata, "scenarios");
  const additionalEntries = Object.entries(metadata).filter(
    ([key, value]) => !CORE_KEYS.has(key) && hasVisibleValue(value)
  );
  const summaryValues = [type, theme, estimatedTime].filter(
    (value): value is string => Boolean(value)
  );

  return (
    <section className="mb-8 border-b border-zinc-200 pb-6" aria-label="Skill metadata">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            {name ? humanizeName(name) : "Skill details"}
          </h2>
          {summaryValues.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
              {summaryValues.map((value, index) => (
                <span key={`${value}-${index}`} className="flex items-center gap-x-2">
                  {index > 0 ? <span aria-hidden="true">·</span> : null}
                  {humanizeValue(value)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {name ? <div className="mt-1 font-mono text-xs text-zinc-500">{name}</div> : null}
        {description ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-700">{description}</p>
        ) : null}
      </div>

      {intent || argumentHint || bestFor.length > 0 || scenarios.length > 0 || additionalEntries.length > 0 ? (
        <dl className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200">
          {intent ? (
            <MetadataRow label="What it does">
              <p>{intent}</p>
            </MetadataRow>
          ) : null}
          {argumentHint ? (
            <MetadataRow label="Expected input">
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-800">
                {argumentHint}
              </code>
            </MetadataRow>
          ) : null}
          {bestFor.length > 0 ? (
            <MetadataRow label="Best for">
              <TextList items={bestFor} />
            </MetadataRow>
          ) : null}
          {scenarios.length > 0 ? (
            <MetadataRow label="Example scenarios">
              <TextList items={scenarios} ordered />
            </MetadataRow>
          ) : null}
          {additionalEntries.map(([key, value]) => (
            <MetadataRow key={key} label={humanizeLabel(key)}>
              <MetadataValue value={value} />
            </MetadataRow>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function MetadataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-sm leading-6 text-zinc-700">{children}</dd>
    </div>
  );
}

function TextList({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const className = ordered ? "list-decimal space-y-1 pl-4" : "list-disc space-y-1 pl-4";
  const children = items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>);

  return ordered ? <ol className={className}>{children}</ol> : <ul className={className}>{children}</ul>;
}

function MetadataValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return <TextList items={value.filter(hasVisibleValue).map(formatValue)} />;
  }

  if (value && typeof value === "object") {
    return (
      <dl className="space-y-1">
        {Object.entries(value).filter(([, item]) => hasVisibleValue(item)).map(([key, item]) => (
          <div key={key} className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">{humanizeLabel(key)}:</dt>
            <dd className="min-w-0 break-words">{formatValue(item)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return <>{formatValue(value)}</>;
}

function readText(metadata: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return undefined;
}

function readTextList(metadata: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = metadata[key];
    if (!Array.isArray(value)) continue;
    return value
      .filter((item): item is string | number | boolean =>
        ["string", "number", "boolean"].includes(typeof item)
      )
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  return [];
}

function hasVisibleValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) {
    return value.some((item) => item !== null && item !== undefined && item !== "");
  }
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "Complex value";
  }
}

function humanizeName(value: string): string {
  return humanizeValue(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeValue(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : value;
}

function humanizeLabel(value: string): string {
  return humanizeValue(value);
}
