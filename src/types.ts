export type SkillLifecycleState =
  | "experimental"
  | "stable"
  | "deprecated"
  | "archived";

export type SkillValidationSeverity = "error" | "warning";

export interface SkillSource {
  root: string;
  path: string;
  absolutePath: string;
  repository?: string;
  branch?: string;
  commit?: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  displayName: string;
  slug: string;
  description: string;
  owner?: string;
  packageName?: string;
  lifecycleState: SkillLifecycleState;
  tags: string[];
  agents: string[];
  contentHash: string;
  headings: string[];
  resources: {
    scripts: string[];
    references: string[];
    assets: string[];
  };
  source: SkillSource;
  discoveredAt: string;
}

export interface SkillCatalog {
  schemaVersion: 1;
  generatedAt: string;
  skills: SkillRecord[];
}

export interface ValidationIssue {
  severity: SkillValidationSeverity;
  code: string;
  message: string;
  path?: string;
  skillId?: string;
}

export interface SkillPackageManifest {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    owner?: string;
    description?: string;
    tags?: string[];
  };
  spec?: {
    version?: string;
    maturity?: SkillLifecycleState;
    compatibility?: {
      agents?: string[];
    };
    artifacts?: Array<{
      type?: string;
      path?: string;
      tags?: string[];
      owner?: string;
    }>;
  };
}
