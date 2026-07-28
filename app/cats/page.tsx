import Link from "next/link";
import CatStyleGallery from "../cat-style-gallery";
import { CAT_STYLES } from "../cat-styles";

export const metadata = {
  title: "고양이 스타일 전체 보기 — Agent Forest",
  description:
    "PolyArt 고양이 팩에 들어 있는 스타일 15종을 한 화면에서 3D로 확인하는 진열대",
};

export default function CatStylesPage() {
  return (
    <main className="cat-gallery-page">
      <header>
        <span className="section-kicker">CAT STYLES</span>
        <h1>고양이 스타일 {CAT_STYLES.length}종</h1>
        <p>
          해변 사무실은 지금 <b>Blue</b> 하나만 쓰고 있습니다. 이 페이지는 같은
          팩에 들어 있는 나머지 스타일까지 전부 세워 두고 실제로 어떻게 보이는지
          확인하는 진열대입니다. 팔레트 텍스처 한 장은 15종이 함께 쓰지만
          메시는 서로 다릅니다(정점 8,844~9,528). 다만 <b>체형은 거의 같아서</b>
          털·꼬리·색만 달라 보입니다.
        </p>
        <Link href="/">해변 사무실로 돌아가기</Link>
      </header>

      <CatStyleGallery />
    </main>
  );
}
