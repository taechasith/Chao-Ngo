import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "เจ้าเงาะ",
  description: "แพลตฟอร์มสืบสวนวิทยาศาสตร์แบบโอเพนซอร์ส",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <link rel="icon" href="data:," />
      </head>
      <body>{children}</body>
    </html>
  );
}
