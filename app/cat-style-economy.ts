export const CAT_STYLE_OWNERSHIP_KEY = "agent-forest-owned-cat-styles-v1";

export const CAT_STYLE_PRICES: Record<string, number> = {
  Abyssian: 150,
  Black: 75,
  BlackWhite: 125,
  Blue: 125,
  Bobtail: 100,
  British: 150,
  Cream: 75,
  Maine: 200,
  Persian: 175,
  Red: 125,
  RedWhite: 150,
  Siamese: 150,
  Simple: 100,
  Sphynx: 200,
  White: 75,
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
