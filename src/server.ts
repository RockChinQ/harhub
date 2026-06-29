import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CATALOG_PATH, createCatalog, readCatalog, writeCatalog } from "./catalog.js";
import { createSkillSkeleton, filterCatalog, findSkill, scanSkills, validateSkills } from "./skills.js";
import type { ValidationIssue } from "./types.js";

const PORT = Number(process.env.PORT ?? 3300);
const CATALOG_PATH = path.resolve(process.cwd(), process.env.HARHUB_CATALOG ?? DEFAULT_CATALOG_PATH);

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    catalogPath: CATALOG_PATH,
    cwd: process.cwd()
  });
});

app.get("/api/skills", (req, res) => {
  const catalog = loadOrCreateCatalog();
  const skills = filterCatalog(catalog, {
    tag: stringQuery(req.query.tag),
    owner: stringQuery(req.query.owner),
    packageName: stringQuery(req.query.package)
  });

  res.json({
    catalogPath: CATALOG_PATH,
    generatedAt: catalog.generatedAt,
    skills
  });
});

app.get("/api/skills/:query", (req, res) => {
  const catalog = loadOrCreateCatalog();
  const skill = findSkill(catalog, req.params.query);

  if (!skill) {
    res.status(404).json({ error: "Skill not found" });
    return;
  }

  res.json(skill);
});

app.post("/api/skills/scan", (req, res) => {
  const roots = readPathList(req.body?.paths);
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const catalog = createCatalog(skills);

  writeCatalog(CATALOG_PATH, catalog);

  res.status(hasErrors(issues) ? 422 : 200).json({
    catalogPath: CATALOG_PATH,
    generatedAt: catalog.generatedAt,
    skills,
    issues
  });
});

app.post("/api/skills/validate", (req, res) => {
  const roots = readPathList(req.body?.paths);
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);

  res.status(hasErrors(issues) ? 422 : 200).json({
    skills,
    issues
  });
});

app.post("/api/skills", (req, res) => {
  const body = req.body as {
    name?: string;
    dir?: string;
    description?: string;
    owner?: string;
    tags?: string[];
  };

  if (!body.name?.trim()) {
    res.status(400).json({ error: "Skill name is required" });
    return;
  }

  const skillPath = createSkillSkeleton({
    name: body.name,
    dir: body.dir?.trim() || "skills",
    description: body.description,
    owner: body.owner,
    tags: Array.isArray(body.tags) ? body.tags : []
  });

  const skills = scanSkills({ roots: [process.cwd()] });
  const issues = validateSkills(skills);
  const catalog = createCatalog(skills);
  writeCatalog(CATALOG_PATH, catalog);

  res.status(201).json({
    path: skillPath,
    catalogPath: CATALOG_PATH,
    skills,
    issues
  });
});

const webRoot = path.resolve(process.cwd(), "dist/web");
if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webRoot, "index.html"));
  });
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Harhub API listening on http://127.0.0.1:${PORT}`);
});

function loadOrCreateCatalog() {
  if (existsSync(CATALOG_PATH)) {
    const catalog = readCatalog(CATALOG_PATH);
    const needsRefresh = catalog.skills.some(
      (skill) => !skill.displayName || !skill.resources
    );
    if (!needsRefresh) {
      return catalog;
    }
  }

  const skills = scanSkills({ roots: [process.cwd()] });
  const catalog = createCatalog(skills);
  writeCatalog(CATALOG_PATH, catalog);
  return catalog;
}

function readPathList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [process.cwd()];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function stringQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
