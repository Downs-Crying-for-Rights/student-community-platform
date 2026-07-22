import { scanContent } from "@/lib/sensitive-engine";

export async function containsBlockedSupportWord(text: string): Promise<boolean> {
  const matches = await scanContent(text);
  return matches.some((match) => match.category !== "PII");
}
