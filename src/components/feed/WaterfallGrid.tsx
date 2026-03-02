import { cn } from "@/lib/utils";

export interface WaterfallGridProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * WaterfallGrid 瀑布流布局组件
 *
 * 使用 CSS columns 实现类似小红书风格的不等高卡片瀑布流排列。
 * - 移动端：2 列紧凑布局（小间距）
 * - PC 端（>= 768px）：2 列布局（较大间距）
 *
 * 每个子元素自动包裹 break-inside-avoid，防止卡片被列分割。
 */
export function WaterfallGrid({ children, className }: WaterfallGridProps) {
  return (
    <div
      className={cn(
        "columns-2 gap-3 md:gap-4",
        "[&>*]:mb-3 [&>*]:break-inside-avoid md:[&>*]:mb-4",
        className
      )}
    >
      {children}
    </div>
  );
}
