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

test("cat persona carries recent visible conversation into a follow-up", () => {
  const prompt = persona.buildCatPersonaPrompt({
    catName: "보리",
    userPrompt: "그중에서 두 번째 장소만 더 알려줘.",
    conversationHistory: [
      { role: "user", content: "부천 실내 나들이 장소를 추천해줘." },
      {
        role: "assistant",
        content: "한국만화박물관과 아트벙커 B39를 추천할게.",
      },
    ],
  });

  assert.match(prompt, /Recent conversation, oldest to newest/);
  assert.match(prompt, /User: 부천 실내 나들이 장소를 추천해줘/);
  assert.match(prompt, /Cat: 한국만화박물관과 아트벙커 B39를 추천할게/);
  assert.match(prompt, /두 번째 장소만 더 알려줘/);
  assert.match(prompt, /Do not greet as if this were the first message/);
});

test("cat persona carries its style-based individual temperament", () => {
  const prompt = persona.buildCatPersonaPrompt({
    catName: "참치",
    userPrompt: "오늘 뭐 하고 놀까?",
    personalityLabel: "장난꾸러기",
    personalityDescription: "앉아서 놀다가 신나게 돌아다니는 친구예요.",
  });

  assert.match(prompt, /individual temperament is "장난꾸러기"/);
  assert.match(prompt, /신나게 돌아다니는 친구/);
  assert.match(prompt, /without reducing accuracy/);
});
