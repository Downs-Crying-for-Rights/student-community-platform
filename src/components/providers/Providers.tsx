"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { TelemetryProvider } from "@/components/providers/TelemetryProvider";
import { ForcedAnnouncementDialog } from "@/components/shared/ForcedAnnouncementDialog";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange={false}
      >
        <TelemetryProvider />
        {children}
        <ForcedAnnouncementDialog />
      </ThemeProvider>
    </SessionProvider>
  );
}
