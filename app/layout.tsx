import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Forest — 눈에 보이는 AI 에이전트 사무실",
  description:
    "현재 로그인된 Codex 작업을 해변의 고양이 에이전트 이동, 작업, 보고 상태로 보여주는 로컬 연동 프로토타입",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#203326",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
