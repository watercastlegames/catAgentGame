/**
 * PolyArt 고양이 팩에 들어 있는 스타일 목록.
 * 원본 D:\UnityProjects\testSimulation\agentForest\Assets\PolyArt\Animals\Cats\FBX\
 * 같은 폴더의 Lowpoly_Cat_All(데모 씬 통짜)과 Animations_IP/RM(애니메이션 전용)은
 * 스타일이 아니라서 뺐다.
 *
 * 15종은 팔레트 텍스처 한 장(PolyArt_Cats_color.png)을 공유하지만 **메시는 서로 다르다.**
 * /cat-inspect 실측: 정점 8,844(Bobtail)~9,528(Red·Simple), 좌표 해시 기준 14종이 서로 다른 메시다
 * (Red와 Simple만 정점이 같고 UV만 다름). 체형 차이는 거의 없다 — 폭 0.130~0.149.
 *
 * 이 파일은 "use client" 를 붙이지 않는다 — 서버 컴포넌트(app/cats/page.tsx)에서
 * 개수를 세야 하는데, 클라이언트 모듈의 export 는 서버에서 실제 값이 아니라 참조가 된다.
 */
export const CAT_STYLES = [
  { id: "Abyssian", ko: "아비시니안" },
  { id: "Black", ko: "검은 고양이" },
  { id: "BlackWhite", ko: "검정·흰 턱시도" },
  { id: "Blue", ko: "블루 (현재 월드에서 쓰는 스타일)" },
  { id: "Bobtail", ko: "밥테일" },
  { id: "British", ko: "브리티시 숏헤어" },
  { id: "Cream", ko: "크림" },
  { id: "Maine", ko: "메인쿤" },
  { id: "Persian", ko: "페르시안" },
  { id: "Red", ko: "레드 (치즈)" },
  { id: "RedWhite", ko: "치즈·흰 얼룩" },
  { id: "Siamese", ko: "샴" },
  { id: "Simple", ko: "심플" },
  { id: "Sphynx", ko: "스핑크스" },
  { id: "White", ko: "화이트" },
] as const;

export const CAT_STYLE_MODEL_DIR = "/models/PolyArt/Animals/Cats/FBX";

export function catStyleModelUrl(styleId: string) {
  return `${CAT_STYLE_MODEL_DIR}/Lowpoly_Cat_${styleId}.fbx`;
}
