import { QQBotSectionNav } from "./QQBotSectionNav";

export default function QQBotLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <QQBotSectionNav />
      {children}
    </>
  );
}
