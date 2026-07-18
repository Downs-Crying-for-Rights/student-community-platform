import { redirect } from "next/navigation";

export default function LegacyModerationPage() {
  redirect("/admin/moderation");
}
