export const CAT_STYLE_OWNERSHIP_KEY = "agent-forest-owned-cat-styles-v1";

export const CAT_STYLE_PRICES: Record<string, number> = {
  Abyssian: 30,
  Black: 15,
  BlackWhite: 25,
  Blue: 25,
  Bobtail: 20,
  British: 30,
  Cream: 15,
  Maine: 40,
  Persian: 35,
  Red: 25,
  RedWhite: 30,
  Siamese: 30,
  Simple: 20,
  Sphynx: 40,
  White: 15,
};

export function parseOwnedCatStyles(
  raw: string | null,
  currentStyle = "Blue",
) {
  const owned = new Set<string>([currentStyle]);
  if (!raw) return owned;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return owned;
    parsed.forEach((style) => {
      if (
        typeof style === "string" &&
        Object.prototype.hasOwnProperty.call(CAT_STYLE_PRICES, style)
      ) {
        owned.add(style);
      }
    });
  } catch {
    return owned;
  }
  return owned;
}

export function purchaseCatStyle(
  style: string,
  balance: number,
  ownedStyles: ReadonlySet<string>,
) {
  const cost = CAT_STYLE_PRICES[style];
  if (!Number.isFinite(cost) || cost <= 0) {
    return { ok: false as const, reason: "unknown-style" as const };
  }
  if (ownedStyles.has(style)) {
    return {
      ok: true as const,
      balance,
      ownedStyles: new Set(ownedStyles),
      charged: 0,
    };
  }
  if (balance < cost) {
    return {
      ok: false as const,
      reason: "insufficient-shells" as const,
      required: cost,
    };
  }
  const nextOwnedStyles = new Set(ownedStyles);
  nextOwnedStyles.add(style);
  return {
    ok: true as const,
    balance: balance - cost,
    ownedStyles: nextOwnedStyles,
    charged: cost,
  };
}
