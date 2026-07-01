export const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\b(?:password|token|secret|api[_-]?key)\s*[:=]\s*["']?[^\s"']{12,}/i
];

export const OFFICIAL_SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/;
export const RESERVED_SKILL_NAME_WORDS = ["anthropic", "claude"];
export const XML_TAG_PATTERN = /<\/?[A-Za-z][^>]*>/;
export const STANDARD_FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools"
]);
