import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // TODO: 移除 ignoreBuildErrors — 需要先修复以下预存类型错误:
  // chat/page.tsx(缺少select组件声明), dcr/mod(ReviewDecision类型),
  // dcr/requests(FileEdit导入), upload/route(handler签名), dcr/tasks/start(session include)
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["nodemailer", "bcryptjs"],
  // Allow up to 10MB uploads for image upload API
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(VERSION|DEPLOYMENT)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:;`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
