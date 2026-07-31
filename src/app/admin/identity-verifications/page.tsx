import { redirect } from "next/navigation";

export default function RemovedIdentityVerificationAdminPage() {
  redirect("/admin/users");
}
