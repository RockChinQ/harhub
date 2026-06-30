export interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean | string[]>;
}
