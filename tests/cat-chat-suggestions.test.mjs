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

test("a new cat gets exactly three capability suggestions", () => {
  const result = suggestions.buildCatChatSuggestions({
    events: [],
    focusedCatId: "cat-1",
    department: "coding",
    backend: "local-session",
  });

  assert.equal(result.length, 3);
  assert.match(result[0], /오류/);
  assert.match(result[1], /구현/);
  assert.match(result[2], /개선/);
});

test("recent questions produce three related follow-up suggestions", () => {
  const result = suggestions.buildCatChatSuggestions({
    events: [
      {
        type: "task.queued",
        threadId: "cat-1",
        prompt: "팝업 버튼의 글자 크기와 정렬을 개선해줘.",
      },
      {
        type: "task.queued",
        threadId: "cat-1",
        prompt: "모바일 화면에서 팝업이 깨지는 오류를 고쳐줘.",
      },
    ],
    focusedCatId: "cat-1",
    department: "design",
    backend: "local-session",
  });

  assert.equal(result.length, 3);
  assert.match(result[0], /팝업 버튼의 글자 크기와 정렬/);
  assert.match(result[1], /스타일/);
  assert.match(result[2], /글자 크기·정렬·눌림 상태/);
});

test("the removed connection sentence is never reused as a suggestion theme", () => {
  const result = suggestions.buildCatChatSuggestions({
    events: [
      {
        type: "task.queued",
        threadId: "cat-1",
        prompt:
          "도구를 사용하지 말고 현재 Codex와 연결되었다는 사실을 한 문장으로 알려줘.",
      },
    ],
    focusedCatId: "cat-1",
    department: "general",
    backend: "pm-worker",
  });

  assert.equal(result.length, 3);
  assert.ok(result.every((item) => !item.includes("도구를 사용하지 말고")));
  assert.match(result[0], /아이디어/);
});
