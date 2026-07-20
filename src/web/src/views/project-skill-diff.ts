export type ProjectSkillLineDiffKind = "unchanged" | "modified" | "added" | "removed";

export interface ProjectSkillLineDiffRow {
  kind: ProjectSkillLineDiffKind;
  before?: { line: number; text: string };
  after?: { line: number; text: string };
}

type LineOperation =
  | { kind: "equal"; text: string }
  | { kind: "remove"; text: string }
  | { kind: "add"; text: string };

const MAX_LCS_CELLS = 250_000;

export function buildProjectSkillLineDiff(
  beforeContent: string | undefined,
  afterContent: string | undefined
): ProjectSkillLineDiffRow[] {
  const before = splitLines(beforeContent);
  const after = splitLines(afterContent);
  let prefixLength = 0;
  while (
    prefixLength < before.length &&
    prefixLength < after.length &&
    before[prefixLength] === after[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength &&
    suffixLength < after.length - prefixLength &&
    before[before.length - suffixLength - 1] === after[after.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const operations: LineOperation[] = [
    ...before.slice(0, prefixLength).map((text) => ({ kind: "equal" as const, text })),
    ...diffMiddle(
      before.slice(prefixLength, before.length - suffixLength),
      after.slice(prefixLength, after.length - suffixLength)
    ),
    ...before.slice(before.length - suffixLength).map((text) => ({
      kind: "equal" as const,
      text
    }))
  ];
  return operationsToRows(operations);
}

function diffMiddle(before: string[], after: string[]): LineOperation[] {
  if (before.length === 0) return after.map((text) => ({ kind: "add", text }));
  if (after.length === 0) return before.map((text) => ({ kind: "remove", text }));
  if (before.length * after.length > MAX_LCS_CELLS) {
    return [
      ...before.map((text) => ({ kind: "remove" as const, text })),
      ...after.map((text) => ({ kind: "add" as const, text }))
    ];
  }

  const width = after.length + 1;
  const matrix = new Uint32Array((before.length + 1) * width);
  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      const index = beforeIndex * width + afterIndex;
      matrix[index] = before[beforeIndex] === after[afterIndex]
        ? matrix[(beforeIndex + 1) * width + afterIndex + 1] + 1
        : Math.max(
            matrix[(beforeIndex + 1) * width + afterIndex],
            matrix[beforeIndex * width + afterIndex + 1]
          );
    }
  }

  const operations: LineOperation[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length && afterIndex < after.length) {
    if (before[beforeIndex] === after[afterIndex]) {
      operations.push({ kind: "equal", text: before[beforeIndex] });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      matrix[(beforeIndex + 1) * width + afterIndex] >=
      matrix[beforeIndex * width + afterIndex + 1]
    ) {
      operations.push({ kind: "remove", text: before[beforeIndex] });
      beforeIndex += 1;
    } else {
      operations.push({ kind: "add", text: after[afterIndex] });
      afterIndex += 1;
    }
  }
  while (beforeIndex < before.length) {
    operations.push({ kind: "remove", text: before[beforeIndex] });
    beforeIndex += 1;
  }
  while (afterIndex < after.length) {
    operations.push({ kind: "add", text: after[afterIndex] });
    afterIndex += 1;
  }
  return operations;
}

function operationsToRows(operations: LineOperation[]): ProjectSkillLineDiffRow[] {
  const rows: ProjectSkillLineDiffRow[] = [];
  let beforeLine = 1;
  let afterLine = 1;
  let removed: Array<{ line: number; text: string }> = [];
  let added: Array<{ line: number; text: string }> = [];

  const flushChanges = () => {
    const length = Math.max(removed.length, added.length);
    for (let index = 0; index < length; index += 1) {
      const before = removed[index];
      const after = added[index];
      rows.push({
        kind: before && after ? "modified" : before ? "removed" : "added",
        ...(before ? { before } : {}),
        ...(after ? { after } : {})
      });
    }
    removed = [];
    added = [];
  };

  for (const operation of operations) {
    if (operation.kind === "equal") {
      flushChanges();
      rows.push({
        kind: "unchanged",
        before: { line: beforeLine, text: operation.text },
        after: { line: afterLine, text: operation.text }
      });
      beforeLine += 1;
      afterLine += 1;
    } else if (operation.kind === "remove") {
      removed.push({ line: beforeLine, text: operation.text });
      beforeLine += 1;
    } else {
      added.push({ line: afterLine, text: operation.text });
      afterLine += 1;
    }
  }
  flushChanges();
  return rows;
}

function splitLines(content: string | undefined): string[] {
  return content === undefined ? [] : content.replace(/\r\n?/g, "\n").split("\n");
}
