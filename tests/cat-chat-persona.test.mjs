import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../app/cat-chat-persona.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const persona = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("cat persona keeps the raw user request and chosen cat name", () => {
  const prompt = persona.buildCatPersonaPrompt({
    catName: "보리",
    userPrompt: "오늘 뉴스를 세 줄로 알려줘.",
  });

  assert.match(prompt, /Agent Forest cat persona/);
  assert.match(prompt, /보리/);
  assert.match(prompt, /오늘 뉴스를 세 줄로 알려줘\./);
  assert.match(prompt, /Reply in the user's language/);
  assert.match(prompt, /at most once/);
});

test("cat persona does not let role-play outrank correct work", () => {
  const prompt = persona.buildCatPersonaPrompt({
    catName: "   ",
    userPrompt: "테스트를 실행해줘.",
  });

  assert.match(prompt, /코치 모모/);
  assert.match(prompt, /accuracy and actually completing the task/);
  assert.match(prompt, /Never claim that work is complete/);
});
