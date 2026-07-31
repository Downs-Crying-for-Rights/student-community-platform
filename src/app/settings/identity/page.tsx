import { redirect } from "next/navigation";

export default function RemovedIdentitySettingsPage() {
  redirect("/settings/profile");
}
