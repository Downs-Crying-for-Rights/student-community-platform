export const SUPPORT_TICKET_ATTESTATION =
  "我确认以上信息准确、完整，且没有包含对学校违规事宜的诉求，否则自愿接受平台的处罚";

export function hasAcceptedSupportTicketAttestation(value: unknown): value is true {
  return value === true;
}
