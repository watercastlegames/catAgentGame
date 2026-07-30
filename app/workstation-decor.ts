export const WORKSTATION_DECOR_KEY = "agent-forest-workstation-decor-v2";
export const WORKSTATION_DECOR_VERSION = 2;

export type WorkstationSeatId = "seat-1" | "seat-2" | "seat-3" | "seat-4";
export type WorkstationDecorSlot =
  | "deskTop"
  | "inputDevice"
  | "seatCushion"
  | "floorAmbient";

export type WorkstationDecorItem = {
  id: string;
  title: string;
  description: string;
  slot: WorkstationDecorSlot;
  price: number;
  unlockSeatCount: number;
  preview: string;
  color: number;
};

export type WorkstationDecorState = {
  version: 2;
  owned: string[];
  equipped: Record<
    WorkstationSeatId,
    Partial<Record<WorkstationDecorSlot, string>>
  >;
};

const EMPTY_EQUIPPED: WorkstationDecorState["equipped"] = {
  "seat-1": {},
  "seat-2": {},
  "seat-3": {},
  "seat-4": {},
};

export const WORKSTATION_DECOR_CATALOG: WorkstationDecorItem[] = [
  {
    id: "shell-planter",
    title: "조개껍질 화분",
    description: "작은 산호빛 화분",
    slot: "deskTop",
    price: 20,
    unlockSeatCount: 1,
    preview: "/art/ui/desk-items/desk-planter-v1.png",
    color: 0xe9a58f,
  },
  {
    id: "enamel-mug",
    title: "에나멜 머그컵",
    description: "따뜻한 크림색 머그",
    slot: "deskTop",
    price: 15,
    unlockSeatCount: 1,
    preview: "/art/ui/desk-items/desk-basic-v1.png",
    color: 0xf5ead6,
  },
  {
    id: "mini-palm",
    title: "미니 야자수 화분",
    description: "책상 위 작은 야자수",
    slot: "deskTop",
    price: 35,
    unlockSeatCount: 2,
    preview: "/art/ui/desk-items/desk-planter-v1.png",
    color: 0x74a879,
  },
  {
    id: "shell-frame",
    title: "조개 액자",
    description: "바닷가 추억 한 장",
    slot: "deskTop",
    price: 40,
    unlockSeatCount: 3,
    preview: "/art/ui/desk-items/desk-radio-v1.png",
    color: 0xe9c58f,
  },
  {
    id: "pastel-keycaps",
    title: "파스텔 키캡",
    description: "네 개의 파스텔 키",
    slot: "inputDevice",
    price: 40,
    unlockSeatCount: 2,
    preview: "/art/ui/desk-items/desk-basic-v1.png",
    color: 0xf29b8a,
  },
  {
    id: "neon-keycaps",
    title: "네온 키캡",
    description: "밤에도 빛나는 네 개의 키",
    slot: "inputDevice",
    price: 60,
    unlockSeatCount: 3,
    preview: "/art/ui/desk-items/desk-radio-v1.png",
    color: 0x71d5c8,
  },
  {
    id: "wood-cushion",
    title: "우드 방석",
    description: "포근한 황토빛 방석",
    slot: "seatCushion",
    price: 30,
    unlockSeatCount: 2,
    preview: "/art/ui/desk-items/desk-cushion-v1.png",
    color: 0xd9a56f,
  },
  {
    id: "quilt-cushion",
    title: "누빔 쿠션",
    description: "폭신한 민트 누빔",
    slot: "seatCushion",
    price: 45,
    unlockSeatCount: 3,
    preview: "/art/ui/desk-items/desk-cushion-v1.png",
    color: 0x8cc6b4,
  },
  {
    id: "camping-stool",
    title: "캠핑 접이 스툴",
    description: "가볍고 튼튼한 보조 의자",
    slot: "seatCushion",
    price: 55,
    unlockSeatCount: 3,
    preview: "/art/ui/desk-items/desk-tent-v1.png",
    color: 0xdd956b,
  },
  {
    id: "round-rug",
    title: "라운드 러그",
    description: "자리 아래 둥근 러그",
    slot: "floorAmbient",
    price: 35,
    unlockSeatCount: 3,
    preview: "/art/ui/desk-items/desk-cushion-v1.png",
    color: 0x7fb6b0,
  },
  {
    id: "mini-lantern",
    title: "미니 랜턴",
    description: "은은하게 빛나는 캠핑 랜턴",
    slot: "floorAmbient",
    price: 50,
    unlockSeatCount: 3,
    preview: "/art/ui/desk-items/desk-lantern-v1.png",
    color: 0xf2bd65,
  },
  {
    id: "shell-windchime",
    title: "조개 윈드차임",
    description: "바람에 반짝이는 희귀 장식",
    slot: "floorAmbient",
    price: 60,
    unlockSeatCount: 4,
    preview: "/art/ui/desk-items/desk-lantern-v1.png",
    color: 0xeac4b2,
  },
];

const ITEM_BY_ID = new Map(
  WORKSTATION_DECOR_CATALOG.map((item) => [item.id, item]),
);

export function createDefaultWorkstationDecorState(): WorkstationDecorState {
  return {
    version: WORKSTATION_DECOR_VERSION,
    owned: [],
    equipped: {
      "seat-1": {},
      "seat-2": {},
      "seat-3": {},
      "seat-4": {},
    },
  };
}

export function parseWorkstationDecorState(
  raw: string | null,
): WorkstationDecorState {
  if (!raw) return createDefaultWorkstationDecorState();
  try {
    const parsed = JSON.parse(raw) as Partial<WorkstationDecorState>;
    const owned = Array.from(
      new Set(
        Array.isArray(parsed.owned)
          ? parsed.owned.filter(
              (itemId): itemId is string =>
                typeof itemId === "string" && ITEM_BY_ID.has(itemId),
            )
          : [],
      ),
    );
    const ownedSet = new Set(owned);
    const equipped = structuredClone(EMPTY_EQUIPPED);
    (Object.keys(equipped) as WorkstationSeatId[]).forEach((seatId) => {
      const source = parsed.equipped?.[seatId];
      if (!source || typeof source !== "object") return;
      (Object.keys(source) as WorkstationDecorSlot[]).forEach((slot) => {
        const itemId = source[slot];
        const item = itemId ? ITEM_BY_ID.get(itemId) : null;
        if (item && item.slot === slot && ownedSet.has(item.id)) {
          equipped[seatId][slot] = item.id;
        }
      });
    });
    return { version: 2, owned, equipped };
  } catch {
    return createDefaultWorkstationDecorState();
  }
}

export function purchaseOrEquipWorkstationDecor({
  state,
  seatId,
  itemId,
  shells,
  unlockedSeatCount,
}: {
  state: WorkstationDecorState;
  seatId: WorkstationSeatId;
  itemId: string;
  shells: number;
  unlockedSeatCount: number;
}) {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) return { ok: false as const, reason: "unknown-item" as const };
  if (item.unlockSeatCount > unlockedSeatCount) {
    return { ok: false as const, reason: "locked" as const, required: item.unlockSeatCount };
  }
  const alreadyOwned = state.owned.includes(item.id);
  if (!alreadyOwned && shells < item.price) {
    return {
      ok: false as const,
      reason: "insufficient-shells" as const,
      required: item.price,
    };
  }
  const owned = alreadyOwned ? state.owned : [...state.owned, item.id];
  const equippedAtSeat = state.equipped[seatId] ?? {};
  const alreadyEquipped = equippedAtSeat[item.slot] === item.id;
  const equipped = {
    ...state.equipped,
    [seatId]: {
      ...equippedAtSeat,
      [item.slot]: alreadyEquipped ? undefined : item.id,
    },
  };
  return {
    ok: true as const,
    charged: alreadyOwned ? 0 : item.price,
    balance: shells - (alreadyOwned ? 0 : item.price),
    equipped: !alreadyEquipped,
    state: { version: 2 as const, owned, equipped },
  };
}

export function equippedDecorIds(
  state: WorkstationDecorState,
  seatId: WorkstationSeatId,
) {
  return Object.values(state.equipped[seatId] ?? {}).filter(
    (itemId): itemId is string => Boolean(itemId),
  );
}
