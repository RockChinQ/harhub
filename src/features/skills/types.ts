export interface ScanOptions {
  roots: string[];
}

export interface SkillMetadataUpdate {
  description?: string;
  owner?: string;
  tags?: string[];
  lifecycleState?: string;
  agents?: string[];
}
