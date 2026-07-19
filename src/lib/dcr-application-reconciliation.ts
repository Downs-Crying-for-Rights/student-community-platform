import type { Prisma } from "@prisma/client";

type ReconciliationClient = Pick<Prisma.TransactionClient, "accessApplication">;

/** Repair historical applications left pending after their linked case was rejected. */
export async function reconcileRejectedDcrApplications(
  client: ReconciliationClient,
  applicantId: string,
) {
  return client.accessApplication.updateMany({
    where: {
      applicantId,
      type: "DCR",
      status: "PENDING",
      case_: { requestStatus: "REJECTED" },
    },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
    },
  });
}
