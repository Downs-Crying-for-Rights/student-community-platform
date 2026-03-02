/**
 * Accessibility utilities and constants.
 *
 * Provides reusable helpers for building accessible components.
 * These follow WCAG 2.1 AA best practices but do NOT guarantee full compliance —
 * manual testing with assistive technologies is always required.
 */

/** Minimum touch target size in pixels (WCAG 2.5.5 / mobile best practice) */
export const MIN_TOUCH_TARGET = 44;

/** Tailwind classes for minimum touch target sizing */
export const TOUCH_TARGET_CLASSES = "min-h-[44px] min-w-[44px]";

/**
 * Tailwind classes for focus-visible ring.
 * Applied via CSS globally, but can be used inline when needed.
 */
export const FOCUS_RING_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Tailwind classes to visually hide content but keep it accessible to screen readers */
export const SR_ONLY_CLASSES =
  "sr-only absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0";

/** Tailwind classes for button press feedback (active state) */
export const BUTTON_PRESS_CLASSES =
  "active:scale-[0.97] active:transition-transform active:duration-75";

/**
 * Calculate relative luminance of an sRGB color channel value (0-255).
 * Per WCAG 2.1 definition.
 */
function channelLuminance(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.03928
    ? srgb / 12.92
    : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/**
 * Calculate relative luminance of an RGB color.
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/**
 * Calculate contrast ratio between two RGB colors.
 * @returns Contrast ratio (1:1 to 21:1)
 * @see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function contrastRatio(
  rgb1: [number, number, number],
  rgb2: [number, number, number]
): number {
  const l1 = relativeLuminance(...rgb1);
  const l2 = relativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a contrast ratio meets WCAG 2.1 AA requirements.
 * - Normal text (< 18pt or < 14pt bold): ratio >= 4.5
 * - Large text (>= 18pt or >= 14pt bold): ratio >= 3.0
 */
export function meetsWCAG_AA(
  ratio: number,
  isLargeText: boolean = false
): boolean {
  return isLargeText ? ratio >= 3.0 : ratio >= 4.5;
}

/**
 * Parse a hex color string to RGB tuple.
 * Supports #RGB and #RRGGBB formats.
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace(/^#/, "");
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}
