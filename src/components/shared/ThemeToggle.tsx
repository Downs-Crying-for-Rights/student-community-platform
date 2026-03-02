"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      className={cn("min-h-[44px] min-w-[44px] relative active:scale-[0.97] active:transition-transform active:duration-75", className)}
    >
      <Sun
        className={cn(
          "h-5 w-5 transition-all duration-300",
          isDark
            ? "rotate-0 scale-100"
            : "rotate-90 scale-0 absolute"
        )}
      />
      <Moon
        className={cn(
          "h-5 w-5 transition-all duration-300",
          isDark
            ? "-rotate-90 scale-0 absolute"
            : "rotate-0 scale-100"
        )}
      />
    </Button>
  );
}
