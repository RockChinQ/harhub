import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assetsView = readFileSync(new URL("../src/web/src/views/assets/assets-view.tsx", import.meta.url), "utf8");
const commandForm = readFileSync(new URL("../src/web/src/views/assets/import-skills-command-form.tsx", import.meta.url), "utf8");

test("Add Skill keeps ZIP upload as the default and exposes command import as a separate tab", () => {
  assert.match(assetsView, /useState<SkillAddMethod>\("zip"\)/);
  assert.match(assetsView, /TabsTrigger value="zip"/);
  assert.match(assetsView, /TabsTrigger value="command"/);
  assert.match(assetsView, /TabsContent value="zip"/);
  assert.match(assetsView, /<UploadSkillZipForm/);
  assert.match(assetsView, /TabsContent value="command"/);
  assert.match(assetsView, /<ImportSkillsCommandForm/);
});

test("command import guidance is hidden behind a tooltip instead of filling the popover", () => {
  assert.match(commandForm, /TooltipTrigger/);
  assert.match(commandForm, /TooltipContent/);
  assert.doesNotMatch(commandForm, />\s*Examples\s*</);
  assert.doesNotMatch(commandForm, /<p className="text-xs leading-5 text-muted-foreground">/);
});
