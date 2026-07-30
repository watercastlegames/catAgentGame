const ITEM_COPY = {
  agent_message: {
    title: "답변을 정리했어요",
    activity: "결과 보고서를 작성하고 있어요",
  },
  agentMessage: {
    title: "답변을 정리했어요",
    activity: "결과 보고서를 작성하고 있어요",
  },
  reasoning: {
    title: "해결 방법을 검토하고 있어요",
    activity: "문제를 차근차근 살펴보는 중이에요",
  },
  command_execution: {
    title: "로컬 도구를 사용하고 있어요",
    activity: "필요한 작업을 안전하게 실행 중이에요",
  },
  commandExecution: {
    title: "로컬 도구를 사용하고 있어요",
    activity: "필요한 작업을 안전하게 실행 중이에요",
  },
  file_change: {
    title: "파일 변경을 준비했어요",
    activity: "작업 결과를 파일에 반영하고 있어요",
  },
  fileChange: {
    title: "파일 변경을 준비했어요",
    activity: "작업 결과를 파일에 반영하고 있어요",
  },
  mcp_tool_call: {
    title: "연결 도구를 사용하고 있어요",
    activity: "외부 도구의 결과를 기다리는 중이에요",
  },
  mcpToolCall: {
    title: "연결 도구를 사용하고 있어요",
    activity: "외부 도구의 결과를 기다리는 중이에요",
  },
  web_search: {
    title: "자료를 찾고 있어요",
    activity: "최신 자료를 확인하는 중이에요",
  },
  webSearch: {
    title: "자료를 찾고 있어요",
    activity: "최신 자료를 확인하는 중이에요",
  },
  plan: {
    title: "작업 순서를 정리했어요",
    activity: "해야 할 일을 단계별로 나누고 있어요",
  },
};

function safeText(value, maxLength = 900) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function baseEvent(context, overrides) {
  return {
    source: "codex",
    taskId: context.taskId,
    threadId: context.threadId ?? null,
    turnId: context.turnId ?? null,
    agentId: context.agentId,
    department: context.department,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function itemText(item) {
  if (typeof item?.text === "string") return safeText(item.text);
  if (typeof item?.content === "string") return safeText(item.content);
  if (!Array.isArray(item?.content)) return "";
  return safeText(
    item.content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part?.text === "string"
            ? part.text
            : "",
      )
      .join("\n"),
  );
}

function normalizeCodexEvent(raw) {
  if (!raw?.method) return raw;
  const params = raw.params ?? {};

  switch (raw.method) {
    case "thread/started":
      return {
        type: "thread.started",
        thread_id: params.thread?.id ?? params.threadId ?? null,
      };
    case "turn/started":
      return {
        type: "turn.started",
        turn_id: params.turn?.id ?? params.turnId ?? null,
      };
    case "item/started":
      return { type: "item.started", item: params.item ?? null };
    case "item/completed":
      return { type: "item.completed", item: params.item ?? null };
    case "turn/diff/updated":
      return { type: "item.started", item: { type: "fileChange" } };
    case "turn/completed": {
      const turn = params.turn ?? {};
      if (turn.status === "failed") {
        return {
          type: "turn.failed",
          error: turn.error ?? null,
          message: turn.error?.message ?? null,
        };
      }
      return {
        type: "turn.completed",
        usage: params.usage ?? turn.usage ?? null,
      };
    }
    case "error":
      return {
        type: "error",
        error: params.error ?? null,
        message: params.message ?? null,
      };
    default:
      return { type: "ignored" };
  }
}

export function mapCodexEvent(raw, context) {
  if (!raw || typeof raw !== "object") return [];
  const event = normalizeCodexEvent(raw);

  switch (event.type) {
    case "thread.started":
      return [
        baseEvent(context, {
          type: "agent.status",
          status: "briefing",
          location: "general",
          title: "새 업무를 접수했어요",
          detail: "매니저 고양이가 요청을 확인하고 있어요",
          threadId: event.thread_id ?? context.threadId ?? null,
        }),
      ];

    case "turn.started":
      return [
        baseEvent(context, {
          type: "agent.status",
          status: "moving",
          location: context.department,
          title: `${context.departmentLabel} 부서로 이동 중`,
          detail: "담당 고양이가 작업 자리로 가고 있어요",
        }),
      ];

    case "item.started": {
      const itemType = event.item?.type ?? "reasoning";
      const copy = ITEM_COPY[itemType] ?? ITEM_COPY.reasoning;
      return [
        baseEvent(context, {
          type: "agent.status",
          status: "working",
          location: context.department,
          title: copy.title,
          detail: copy.activity,
          itemType,
        }),
      ];
    }

    case "item.completed": {
      const itemType = event.item?.type ?? "unknown";
      const copy = ITEM_COPY[itemType] ?? {
        title: "한 단계 완료했어요",
        activity: "다음 작업을 준비하고 있어요",
      };

      if (itemType === "agent_message" || itemType === "agentMessage") {
        const result = itemText(event.item) || context.lastMessage;
        context.lastMessage = result;
        return [
          baseEvent(context, {
            type: "task.result",
            status: "reporting",
            location: "queue",
            title: "보고서를 들고 돌아가는 중",
            detail: "완료된 내용을 사용자에게 보고하러 가요",
            result,
          }),
        ];
      }

      return [
        baseEvent(context, {
          type: "agent.status",
          status: "working",
          location: context.department,
          title: copy.title,
          detail: "작업 한 단계를 마쳤어요",
          itemType,
        }),
      ];
    }

    case "turn.completed":
      return [
        baseEvent(context, {
          type: "task.completed",
          status: "completed",
          location: "queue",
          title: "Codex 작업이 완료됐어요.",
          detail: context.lastMessage || "Codex 작업이 정상적으로 완료됐어요.",
          result: context.lastMessage || "",
          usage: event.usage ?? context.usage ?? null,
        }),
      ];

    case "turn.failed":
    case "error":
      return [
        baseEvent(context, {
          type: "task.failed",
          status: "failed",
          location: context.department,
          title: "작업 중 문제가 생겼어요",
          detail:
            safeText(event.error?.message ?? event.message, 280) ||
            "Codex 실행이 완료되지 않았어요.",
        }),
      ];

    default:
      return [];
  }
}

export function createSimulationEvents(context) {
  const at = (delayMs, event) => ({
    delayMs,
    event: baseEvent(context, event),
  });

  return [
    at(0, {
      type: "agent.status",
      status: "briefing",
      location: "general",
      title: "새 업무를 접수했어요",
      detail: "매니저 고양이가 작업을 분배하고 있어요",
    }),
    at(900, {
      type: "agent.status",
      status: "moving",
      location: context.department,
      title: `${context.departmentLabel} 부서로 이동 중`,
      detail: "담당 고양이가 작업 자리로 가고 있어요",
    }),
    at(1900, {
      type: "agent.status",
      status: "working",
      location: context.department,
      title: "열심히 작업하고 있어요",
      detail: "실제 연동 시 이 상태가 Codex 도구 이벤트와 연결돼요",
    }),
    at(3500, {
      type: "task.result",
      status: "reporting",
      location: "queue",
      title: "보고서를 들고 돌아가는 중",
      detail: "완료된 작업이 승인 대기열에 도착했어요",
      result: "화면 시연을 완료했습니다. 실제 실행 버튼을 누르면 현재 로그인된 Codex 결과가 여기에 표시됩니다.",
    }),
    at(4700, {
      type: "task.completed",
      status: "completed",
      location: "queue",
      title: "화면 시연이 완료됐어요.",
      detail: "Codex 세션 상태가 고양이 행동으로 연결되는 흐름을 확인했어요.",
      result: "비용 없는 화면 시연이 완료됐습니다.",
      usage: null,
    }),
  ];
}
