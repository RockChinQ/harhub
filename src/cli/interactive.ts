import path from "node:path";
import readline from "node:readline";
import { createInterface } from "node:readline/promises";
import type { SkillRecord, ValidationIssue } from "../shared/types.js";

export function canUseInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function promptText(input: {
  label: string;
  defaultValue?: string;
  required?: boolean;
}): Promise<string | undefined> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const suffix = input.defaultValue ? ` [${input.defaultValue}]` : "";
    while (true) {
      const answer = (await rl.question(`${input.label}${suffix}: `)).trim();
      const value = answer || input.defaultValue;
      if (value || input.required === false) return value;
    }
  } finally {
    rl.close();
  }
}

export async function promptSecret(label: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    let value = "";
    const stdin = process.stdin;
    const stdout = process.stdout;
    const wasRaw = stdin.isRaw;

    function cleanup(): void {
      stdin.off("data", onData);
      if (stdin.setRawMode) stdin.setRawMode(wasRaw);
      stdin.pause();
    }

    function finish(): void {
      cleanup();
      stdout.write("\n");
      resolve(value.trim() || undefined);
    }

    function cancel(): void {
      cleanup();
      stdout.write("\n");
      reject(new Error("Cancelled."));
    }

    function onData(chunk: Buffer | string): void {
      const text = chunk.toString("utf8");
      if (text === "\u0003") {
        cancel();
        return;
      }

      if (text === "\r" || text === "\n") {
        finish();
        return;
      }

      if (text === "\u007f" || text === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }

      for (const char of text) {
        if (char >= " " && char !== "\u007f") {
          value += char;
          stdout.write("*");
        }
      }
    }

    stdout.write(`${label}: `);
    stdin.setEncoding("utf8");
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

export async function selectSkillsForUpload(input: {
  skills: SkillRecord[];
  issues: ValidationIssue[];
}): Promise<SkillRecord[] | undefined> {
  const choices = input.skills.map((skill) => {
    const skillIssues = input.issues.filter((issue) => issue.skillId === skill.id);
    const errorCount = skillIssues.filter((issue) => issue.severity === "error").length;
    return {
      skill,
      errorCount,
      selected: errorCount === 0
    };
  });
  const selectableCount = choices.filter((choice) => choice.errorCount === 0).length;

  if (selectableCount === 0) return [];

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const wasRaw = stdin.isRaw;
    let cursor = choices.findIndex((choice) => choice.errorCount === 0);
    if (cursor < 0) cursor = 0;

    function cleanup(): void {
      stdin.off("data", onData);
      if (stdin.setRawMode) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\x1b[?25h");
    }

    function complete(value: SkillRecord[] | undefined): void {
      cleanup();
      stdout.write("\n");
      resolve(value);
    }

    function fail(error: Error): void {
      cleanup();
      stdout.write("\n");
      reject(error);
    }

    function move(delta: number): void {
      if (choices.length === 0) return;
      let next = cursor;
      for (let count = 0; count < choices.length; count += 1) {
        next = (next + delta + choices.length) % choices.length;
        if (choices[next]?.errorCount === 0) {
          cursor = next;
          return;
        }
      }
    }

    function toggleCurrent(): void {
      const choice = choices[cursor];
      if (choice && choice.errorCount === 0) {
        choice.selected = !choice.selected;
      }
    }

    function toggleAll(): void {
      const validChoices = choices.filter((choice) => choice.errorCount === 0);
      const shouldSelect = validChoices.some((choice) => !choice.selected);
      for (const choice of validChoices) {
        choice.selected = shouldSelect;
      }
    }

    function render(): void {
      stdout.write("\x1b[2J\x1b[H\x1b[?25l");
      stdout.write("Select skills to upload\n");
      stdout.write("Use Up/Down, Space to toggle, A to select all, Enter to upload, Q to cancel.\n\n");

      choices.forEach((choice, index) => {
        const pointer = index === cursor ? ">" : " ";
        const mark = choice.errorCount > 0 ? "-" : choice.selected ? "x" : " ";
        const skillDir = path.relative(process.cwd(), path.dirname(choice.skill.source.absolutePath));
        const status = choice.errorCount > 0 ? ` invalid (${choice.errorCount} error(s))` : "";
        stdout.write(`${pointer} [${mark}] ${choice.skill.name}  ${skillDir}${status}\n`);
      });
    }

    function onData(chunk: Buffer | string): void {
      const key = chunk.toString("utf8");

      if (key === "\u0003") {
        fail(new Error("Cancelled."));
        return;
      }

      if (key === "\u001b[A") {
        move(-1);
        render();
        return;
      }

      if (key === "\u001b[B") {
        move(1);
        render();
        return;
      }

      if (key === " ") {
        toggleCurrent();
        render();
        return;
      }

      if (key === "a" || key === "A") {
        toggleAll();
        render();
        return;
      }

      if (key === "q" || key === "Q" || key === "\u001b") {
        complete(undefined);
        return;
      }

      if (key === "\r" || key === "\n") {
        complete(choices.filter((choice) => choice.selected && choice.errorCount === 0).map((choice) => choice.skill));
      }
    }

    stdin.setEncoding("utf8");
    if (stdin.setRawMode) stdin.setRawMode(true);
    readline.emitKeypressEvents(stdin);
    stdin.resume();
    stdin.on("data", onData);
    render();
  });
}
