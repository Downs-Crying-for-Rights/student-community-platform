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
      className="pointer-events-none fixed inset-0 z-[100] grid select-none grid-cols-2 content-around overflow-hidden sm:grid-cols-3"
    >
      {Array.from({ length: 15 }, (_, index) => (
        <div
          key={index}
          className="-rotate-12 whitespace-pre-line px-4 text-center text-sm font-semibold leading-6 text-red-700/15 sm:text-base"
        >
          {`敏感内容，严禁外传\n${identity}\n${date}`}
        </div>
      ))}
    </div>
  );
}
