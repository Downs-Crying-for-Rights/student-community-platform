import type { Metadata } from "next";
import { Providers } from "@/components/providers/Providers";
import "./globals.css";
import "@/styles/a11y.css";

export const metadata: Metadata = {
  title: "学生交流社区",
  description: "面向学生群体的多层级社区平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>
          <a href="#main-content" className="skip-to-content">
            跳转到主要内容
          </a>
          <div id="main-content">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
