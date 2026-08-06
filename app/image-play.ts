export const IMAGE_PLAY_SHELL_COST = 10;

export const IMAGE_PLAY_PRESETS = [
  {
    id: "storybook",
    label: "동화 주인공",
    prompt:
      "포근한 손그림 동화책의 주인공처럼 바꾸고, 부드러운 파스텔 색감과 따뜻한 햇빛을 사용해 주세요.",
  },
  {
    id: "beach",
    label: "해변 엽서",
    prompt:
      "시원한 열대 해변에서 휴가를 즐기는 귀여운 일러스트 엽서처럼 바꿔 주세요. 글자는 넣지 마세요.",
  },
  {
    id: "sticker",
    label: "말랑 스티커",
    prompt:
      "말랑하고 귀여운 캐릭터 스티커 일러스트로 바꾸고, 깨끗한 외곽선과 단순한 원톤 채색을 사용해 주세요.",
  },
] as const;

export type ImagePlayPresetId = (typeof IMAGE_PLAY_PRESETS)[number]["id"];

export function buildImagePlayPrompt(
  presetId: ImagePlayPresetId,
  customPrompt: string,
  hasReferenceImage: boolean,
) {
  const preset =
    IMAGE_PLAY_PRESETS.find((entry) => entry.id === presetId) ??
    IMAGE_PLAY_PRESETS[0];
  const referenceRule = hasReferenceImage
    ? "입력 사진의 인물·동물·주요 사물의 정체성과 구도를 알아볼 수 있게 유지해 주세요."
    : "정사각형 한 장의 완성된 장면으로 만들어 주세요.";
  const request = customPrompt.trim();
  return [
    referenceRule,
    preset.prompt,
    request ? `추가 요청: ${request}` : "",
    "화면에 글자, 로고, 워터마크를 넣지 마세요.",
  ]
    .filter(Boolean)
    .join("\n");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("사진을 읽지 못했어요."));
    });
    reader.addEventListener("error", () =>
      reject(new Error("사진을 읽지 못했어요.")),
    );
    reader.readAsDataURL(file);
  });
}

export async function prepareImagePlayFile(file: File, maxEdge = 1280) {
  if (!file.type.startsWith("image/")) {
    throw new Error("PNG, JPG, WebP 사진만 선택해 주세요.");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("사진은 15MB 이하로 선택해 주세요.");
  }
  const source = await readFileAsDataUrl(file);
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  if (scale === 1) return source;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("사진 변환을 준비하지 못했어요.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}
