import React from "react";

interface AdminWatermarkProps {
  identity: string;
  date: string;
}

export function AdminWatermark({ identity, date }: AdminWatermarkProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="admin-watermark"
      className="pointer-events-none fixed inset-0 z-[60] select-none overflow-hidden"
    >
      <svg className="h-full w-full opacity-[0.08] dark:opacity-[0.11]" role="presentation">
        <defs>
          <pattern id="admin-watermark-pattern" width="300" height="170" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
            <text x="16" y="48" className="fill-red-700 text-[14px] font-semibold dark:fill-red-300">敏感内容，严禁外传</text>
            <text x="16" y="72" className="fill-red-700 text-[13px] dark:fill-red-300">{identity}</text>
            <text x="16" y="94" className="fill-red-700 text-[12px] dark:fill-red-300">{date} · 管理后台</text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#admin-watermark-pattern)" />
      </svg>
    </div>
  );
}
