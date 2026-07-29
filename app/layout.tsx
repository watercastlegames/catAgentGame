import type { Metadata, Viewport } from "next";
import "./globals.css";
import { POPUP_UI_ASSETS } from "./popup-assets.mjs";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      "https://agent-forest-raccoon.sminia82.chatgpt.site",
  ),
  title: "Agent Forest — 내 PC Codex 세션 사무실",
  description:
    "내 PC의 Codex 세션을 선택하고 작업·승인·완료 상태를 해변의 고양이 에이전트 행동으로 확인하는 개인 작업 공간",
  openGraph: {
    title: "Agent Forest",
    description: "내 PC Codex 세션을 고양이 에이전트로",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "Agent Forest의 해변 Codex 고양이 에이전트 사무실",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Forest",
    description: "내 PC Codex 세션을 고양이 에이전트로",
    images: ["/og.png"],
  },
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
      <head>
        {POPUP_UI_ASSETS.map((source) => (
          <link key={source} rel="preload" as="image" href={source} />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
