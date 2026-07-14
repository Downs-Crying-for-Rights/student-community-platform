"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type ClientTelemetryEvent = {
  type: "page_view" | "web_vital" | "error";
  name: string;
  route: string;
  duration?: number;
  value?: number;
  metadata?: {
    message?: string;
    stack?: string;
    source?: string;
    line?: number;
    column?: number;
  };
};

const queue: ClientTelemetryEvent[] = [];
let flushTimer: number | null = null;

function getSessionId(): string {
  const key = "forum_telemetry_session";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  sessionStorage.setItem(key, value);
  return value;
}

function flush() {
  flushTimer = null;
  if (queue.length === 0) return;
  const events = queue.splice(0, 20);
  const body = JSON.stringify({ sessionId: getSessionId(), events });
  if (!navigator.sendBeacon?.("/api/telemetry", new Blob([body], { type: "application/json" }))) {
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

export function reportClientTelemetry(event: ClientTelemetryEvent) {
  queue.push(event);
  if (queue.length >= 10) return flush();
  if (flushTimer == null) flushTimer = window.setTimeout(flush, 1500);
}

export function TelemetryProvider() {
  const pathname = usePathname();

  useEffect(() => {
    reportClientTelemetry({ type: "page_view", name: "page_view", route: pathname });
  }, [pathname]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientTelemetry({
      type: "error",
      name: event.error?.name || "window_error",
      route: location.pathname,
      metadata: {
        message: String(event.message || event.error?.message || "Unknown browser error").slice(0, 2_000),
        stack: String(event.error?.stack || "").slice(0, 8_000),
        source: String(event.filename || "").split("?")[0].slice(0, 500),
        line: event.lineno,
        column: event.colno,
      },
    });
    const onRejection = (event: PromiseRejectionEvent) => reportClientTelemetry({
      type: "error",
      name: "unhandled_rejection",
      route: location.pathname,
      metadata: {
        message: String(event.reason instanceof Error ? event.reason.message : event.reason || "Unknown rejection").slice(0, 2_000),
        stack: String(event.reason instanceof Error ? event.reason.stack || "" : "").slice(0, 8_000),
      },
    });
    const onPageHide = () => flush();
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("pagehide", onPageHide);

    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation) {
      reportClientTelemetry({ type: "web_vital", name: "TTFB", route: location.pathname, value: navigation.responseStart });
      reportClientTelemetry({ type: "web_vital", name: "DOM_LOAD", route: location.pathname, value: navigation.domContentLoadedEventEnd });
    }

    let cls = 0;
    const observers: PerformanceObserver[] = [];
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries.at(-1);
        if (last) reportClientTelemetry({ type: "web_vital", name: "LCP", route: location.pathname, value: last.startTime });
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(observer);
    } catch {}
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
          if (!entry.hadRecentInput) cls += entry.value ?? 0;
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
      observers.push(observer);
    } catch {}

    return () => {
      if (cls > 0) reportClientTelemetry({ type: "web_vital", name: "CLS", route: location.pathname, value: cls });
      observers.forEach((observer) => observer.disconnect());
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
