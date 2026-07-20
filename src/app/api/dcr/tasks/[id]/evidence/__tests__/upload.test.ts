import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sessionFindFirst: vi.fn(),
  sessionFindUnique: vi.fn(),
  evidenceCreate: vi.fn(),
  scanContent: vi.fn(),
  enforceRateLimit: vi.fn(),
  generateObjectKey: vi.fn(),
  uploadToOSS: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: vi.fn(),
    helpSession: { findUnique: mocks.sessionFindUnique },
    evidenceItem: { create: mocks.evidenceCreate },
    auditLog: { create: vi.fn() },
  };
  return { default: {
    helpSession: { findFirst: mocks.sessionFindFirst },
    evidenceItem: { create: mocks.evidenceCreate },
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  } };
});
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: mocks.scanContent }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/oss", () => ({
  generateObjectKey: mocks.generateObjectKey,
  uploadToOSS: mocks.uploadToOSS,
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../route";

const context = { params: { id: "task-1" } };

function uploadRequest(file: File) {
  const form = new FormData();
  form.append("type", "EVIDENCE_ITEM");
  form.append("description", "处理过程截图");
  form.append("sensitiveConfirmed", "true");
  form.append("file", file);
  return new NextRequest("http://localhost/api/dcr/tasks/task-1/evidence?sessionId=session-1", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/dcr/tasks/[id]/evidence multipart upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "helper", role: "USER" } } as never);
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      requesterId: "requester",
      helperId: "helper",
      evidenceRoom: { id: "room-1" },
    });
    mocks.sessionFindUnique.mockResolvedValue({ status: "IN_PROGRESS" });
    mocks.scanContent.mockResolvedValue([]);
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.generateObjectKey.mockReturnValue("uploads/2026/07/evidence.pdf");
    mocks.uploadToOSS.mockResolvedValue("https://forum.example/api/media?key=evidence.pdf&sig=test");
    mocks.evidenceCreate.mockResolvedValue({ id: "item-1", type: "EVIDENCE_ITEM", createdAt: new Date() });
    mocks.logAudit.mockResolvedValue(undefined);
    process.env.OSS_BUCKET = "bucket";
    process.env.OSS_ACCESS_KEY_ID = "key";
    process.env.OSS_ACCESS_KEY_SECRET = "secret";
  });

  it("uploads a private attachment after verifying the selected help session", async () => {
    const file = new File(["pdf"], "proof.pdf", { type: "application/pdf" });

    const response = await POST(uploadRequest(file), context as never);

    expect(response.status).toBe(201);
    expect(mocks.sessionFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: "task-1", id: "session-1" },
    }));
    expect(mocks.generateObjectKey).toHaveBeenCalledWith("pdf");
    expect(mocks.uploadToOSS).toHaveBeenCalledWith(expect.any(Buffer), "uploads/2026/07/evidence.pdf", "application/pdf");
    expect(mocks.evidenceCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        roomId: "room-1",
        uploaderId: "helper",
        fileName: "proof.pdf",
        fileSize: 3,
        fileUrl: "https://forum.example/api/media?key=evidence.pdf&sig=test",
      }),
    }));
  });

  it("rejects unsupported files before uploading", async () => {
    const file = new File(["script"], "proof.html", { type: "text/html" });

    const response = await POST(uploadRequest(file), context as never);

    expect(response.status).toBe(400);
    expect(mocks.uploadToOSS).not.toHaveBeenCalled();
    expect(mocks.evidenceCreate).not.toHaveBeenCalled();
  });

  it("rejects client-supplied attachment URLs on the JSON endpoint", async () => {
    const response = await POST(new NextRequest("http://localhost/api/dcr/tasks/task-1/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "EVIDENCE_ITEM",
        description: "外部附件",
        sensitiveConfirmed: true,
        fileUrl: "https://attacker.example/proof.pdf",
        fileName: "proof.pdf",
        fileSize: 3,
      }),
    }), context as never);

    expect(response.status).toBe(400);
    expect(mocks.uploadToOSS).not.toHaveBeenCalled();
    expect(mocks.evidenceCreate).not.toHaveBeenCalled();
  });

  it("does not upload when the user is outside the help session", async () => {
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      requesterId: "requester",
      helperId: "another-helper",
      evidenceRoom: { id: "room-1" },
    });
    const file = new File(["pdf"], "proof.pdf", { type: "application/pdf" });

    const response = await POST(uploadRequest(file), context as never);

    expect(response.status).toBe(403);
    expect(mocks.uploadToOSS).not.toHaveBeenCalled();
  });
});
