import { redirect } from "next/navigation";

export default function RemovedIdentityRevocationAdminPage() {
  redirect("/admin/users");
}
