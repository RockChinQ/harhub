import path from "node:path";

export const STATE_PATH = ".harhub/state.json";

export function getStatePath(): string {
  return path.resolve(process.cwd(), process.env.HARHUB_STATE ?? STATE_PATH);
}

export function getWorkspaceAssetCatalogPath(workspaceId: string): string {
  return path.resolve(process.cwd(), `.harhub/workspaces/${workspaceId}/assets.json`);
}
