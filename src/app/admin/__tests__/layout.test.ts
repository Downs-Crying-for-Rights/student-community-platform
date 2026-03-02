import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mocks ----

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    // redirect throws in Next.js to halt rendering — simulate that
    throw new Error("NEXT_REDIRECT");
  },
  usePathname: () => "/admin/users",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

const mockGetServerSession = vi.fn();
vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

const mockLogAudit = vi.fn().mockResolvedValue({});
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: { UNAUTHORIZED_ACCESS: "UNAUTHORIZED_ACCESS" },
  AuditTargetType: { USER: "USER" },
}));

vi.mock("@/lib/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rbac")>("@/lib/rbac");
  return actual;
});

describe("AdminLayout access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should redirect unauthenticated users to /login", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const { default: AdminLayout } = await import("../layout");

    await expect(
      AdminLayout({ children: null as unknown as React.ReactNode }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("should redirect USER role to /403 and log audit", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
    });

    const { default: AdminLayout } = await import("../layout");

    await expect(
      AdminLayout({ children: null as unknown as React.ReactNode }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockLogAudit).toHaveBeenCalledWith(
      "user-1",
      "UNAUTHORIZED_ACCESS",
      "USER",
      "user-1",
      expect.objectContaining({ attemptedRoute: "/admin", role: "USER" }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/403");
  });

  it("should redirect TRUSTED_USER role to /403 and log audit", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-2", role: "TRUSTED_USER" },
    });

    const { default: AdminLayout } = await import("../layout");

    await expect(
      AdminLayout({ children: null as unknown as React.ReactNode }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockLogAudit).toHaveBeenCalledWith(
      "user-2",
      "UNAUTHORIZED_ACCESS",
      "USER",
      "user-2",
      expect.objectContaining({ role: "TRUSTED_USER" }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/403");
  });

  it("should redirect DCR_HELPER role to /403 and log audit", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-3", role: "DCR_HELPER" },
    });

    const { default: AdminLayout } = await import("../layout");

    await expect(
      AdminLayout({ children: null as unknown as React.ReactNode }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockLogAudit).toHaveBeenCalledWith(
      "user-3",
      "UNAUTHORIZED_ACCESS",
      "USER",
      "user-3",
      expect.objectContaining({ role: "DCR_HELPER" }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/403");
  });

  it("should allow MODERATOR role to access admin pages", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "mod-1", role: "MODERATOR" },
    });

    const { default: AdminLayout } = await import("../layout");

    // Should NOT throw — children are rendered
    const result = await AdminLayout({ children: "admin content" as unknown as React.ReactNode });
    expect(result).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("should allow ADMIN role to access admin pages", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });

    const { default: AdminLayout } = await import("../layout");

    const result = await AdminLayout({ children: "admin content" as unknown as React.ReactNode });
    expect(result).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("should treat missing role as USER and deny access", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-no-role" },
    });

    const { default: AdminLayout } = await import("../layout");

    await expect(
      AdminLayout({ children: null as unknown as React.ReactNode }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/403");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "user-no-role",
      "UNAUTHORIZED_ACCESS",
      "USER",
      "user-no-role",
      expect.objectContaining({ role: "USER" }),
    );
  });
});
