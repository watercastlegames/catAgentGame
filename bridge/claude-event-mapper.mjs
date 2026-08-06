function cleanText(value, maxLength = 4_000) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function baseEvent(context, overrides) {
  return {
    source: "claude",
    mode: "claude",
    taskId: context.taskId,
    // PM Worker의 공용 서버가 멈춘 동안 Claude Code가 대신 답할 때는
    // 실제 Claude 세션 ID 대신 원래 고양이 대화 ID로 이벤트를 돌려보낸다.
    threadId: context.conversationThreadId ?? context.threadId,
    turnId: context.turnId,
    agentId: context.agentId,
    agentName: context.agentName ?? null,
    seatId: context.seatId ?? null,
    department: context.department,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function toolCopy(toolName) {
  if (/^(Read|Glob|Grep|WebFetch|WebSearch)$/i.test(toolName)) {
    return ["자료를 살펴보고 있어요", "필요한 정보와 파일을 확인하고 있어요."];
  }
  if (/^(Edit|Write|NotebookEdit)$/i.test(toolName)) {
    return ["파일을 다듬고 있어요", "Claude Code가 작업 결과를 파일에 반영하고 있어요."];
  }
  if (/^(Bash|PowerShell)$/i.test(toolName)) {
    return ["로컬 도구를 사용하고 있어요", "Claude Code가 필요한 명령을 실행하고 있어요."];
  }
  return ["도구를 사용하고 있어요", `${toolName || "Claude Code 도구"} 작업을 진행하고 있어요.`];
}

export function mapClaudeMessage(message, context) {
  if (!message || typeof message !== "object") return [];

  if (message.type === "system" && message.subtype === "init") {
    return [
      baseEvent(context, {
        type: "agent.status",
        status: "moving",
        location: context.department,
        title: "Claude Code 작업을 시작했어요",
        detail: "담당 고양이가 자기 자리로 이동하고 있어요.",
      }),
    ];
  }

  if (message.type === "assistant" && Array.isArray(message.message?.content)) {
    const events = [];
    for (const part of message.message.content) {
      if (part?.type === "text") {
        const text = cleanText(part.text);
        if (text) context.lastMessage = text;
      }
      if (part?.type === "tool_use") {
        const [title, detail] = toolCopy(cleanText(part.name, 80));
        events.push(
          baseEvent(context, {
            type: "agent.status",
            status: "working",
            location: context.department,
            title,
            detail,
            itemType: part.name,
          }),
        );
      }
    }
    return events;
  }

  if (message.type === "result") {
    const result = cleanText(message.result) || context.lastMessage;
    context.lastMessage = result;
    context.usage = message.usage ?? null;
    if (message.is_error || message.subtype !== "success") {
      return [
        baseEvent(context, {
          type: "task.failed",
          status: "failed",
          location: context.department,
          title: "Claude Code 작업 중 문제가 생겼어요",
          detail: result || "Claude Code 실행이 완료되지 않았어요.",
          result,
          usage: context.usage,
        }),
      ];
    }
    return [
      baseEvent(context, {
        type: "task.result",
        status: "reporting",
        location: "queue",
        title: "Claude Code 답변을 가져왔어요",
        detail: "고양이를 눌러 새 답변을 확인해 주세요.",
        result,
        usage: context.usage,
      }),
      baseEvent(context, {
        type: "task.completed",
        status: "completed",
        location: "queue",
        title: "Claude Code 작업이 완료됐어요",
        detail: result || "Claude Code 작업이 정상적으로 완료됐어요.",
        result,
        usage: context.usage,
      }),
    ];
  }

  return [];
}
