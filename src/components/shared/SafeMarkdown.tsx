"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export function SafeMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("space-y-3 break-words text-sm leading-7", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <h1 className="mt-5 text-xl font-bold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-5 text-lg font-semibold first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-4 text-base font-semibold first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-6">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-border pl-4 text-muted-foreground">{children}</blockquote>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{children}</a>,
          table: ({ children }) => <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border bg-muted px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
          code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
          hr: () => <hr className="my-5 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
