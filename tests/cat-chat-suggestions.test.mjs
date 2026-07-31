import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../app/cat-chat-suggestions.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const suggestions = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("a new cat starts with three fun daily conversation ideas", () => {
  const result = suggestions.buildCatChatSuggestions({
    events: [],
    focusedCatId: "cat-1",
    department: "coding",
    backend: "local-session",
  });

  assert.equal(result.length, 3);
  assert.match(result[0], /뉴스/);
  assert.match(result[1], /주식시장/);
  assert.match(result[2], /운세/);
});

test("topic memory survives serialization and keeps a cat's dominant interest", () => {
  let memory = suggestions.createEmptyCatChatTopicMemory();
  memory = suggestions.rememberCatChatTopic(memory, {
    catId: "cat-1",
    prompt: "오늘의 주식시장 분위기를 재미있게 알려줘.",
    createdAt: 100,
  });
  memory = suggestions.rememberCatChatTopic(memory, {
    catId: "cat-1",
    prompt: "요즘 나스닥에서 흥미로운 업종이 뭐야?",
    createdAt: 200,
  });
  memory = suggestions.rememberCatChatTopic(memory, {
    catId: "cat-2",
    prompt: "오늘 뉴스 브리핑을 해줘.",
    createdAt: 300,
  });
  const restored = suggestions.parseCatChatTopicMemory(
    JSON.stringify(memory),
  );
  const result = suggestions.buildCatChatSuggestions({
    events: [],
    memory: restored,
    focusedCatId: "cat-1",
    department: "coding",
    backend: "puter",
  });

  assert.equal(restored.entries.length, 3);
  assert.equal(result.length, 3);
  assert.ok(result.every((item) => /시장|업종/.test(item)));
});

test("recent news questions produce three new news conversations", () => {
  const result = suggestions.buildCatChatSuggestions({
    events: [
      {
        type: "task.queued",
        threadId: "cat-1",
        prompt: "오늘 뉴스 중에서 재미있는 소식만 브리핑해줘.",
      },
      {
        type: "task.queued",
        threadId: "cat-1",
        prompt: "요즘 국제 뉴스에서 중요한 이슈가 뭐야?",
      },
    ],
    focusedCatId: "cat-1",
    department: "general",
    backend: "local-session",
  });

  assert.equal(result.length, 3);
  assert.ok(result.every((item) => item.includes("뉴스")));
});

test("old event history migrates into durable topic memory", () => {
  const memory = suggestions.seedCatChatTopicMemoryFromEvents(
    [
      {
        type: "task.queued",
        threadId: "cat-1",
        prompt: "오늘 운세랑 행운의 색을 재미로 알려줘.",
      },
      {
        type: "task.completed",
        threadId: "cat-1",
        prompt: "응답은 기억하지 않아야 해.",
      },
    ],
    "fallback-cat",
  );

  assert.equal(memory.entries.length, 1);
  assert.equal(memory.entries[0].catId, "cat-1");
  assert.equal(memory.entries[0].topic, "fortune");
});

test("the removed connection sentence never becomes remembered history", () => {
  const memory = suggestions.rememberCatChatTopic(
    suggestions.createEmptyCatChatTopicMemory(),
    {
      catId: "cat-1",
      prompt:
        "도구를 사용하지 말고 현재 Codex와 연결되었다는 사실을 한 문장으로 알려줘.",
      createdAt: 100,
    },
  );
  const result = suggestions.buildCatChatSuggestions({
    events: [],
    memory,
    focusedCatId: "cat-1",
    department: "general",
    backend: "pm-worker",
  });

  assert.equal(memory.entries.length, 0);
  assert.equal(result.length, 3);
  assert.ok(result.every((item) => !item.includes("도구를 사용하지 말고")));
  assert.match(result[0], /뉴스/);
});
