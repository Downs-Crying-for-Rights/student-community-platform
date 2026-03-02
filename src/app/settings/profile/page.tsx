"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { User, Save, Loader2, Lock, Camera } from "lucide-react";
import Image from "next/image";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { passwordSchema } from "@/lib/validators";

/* ---------- Validation helpers (exported for testing) ---------- */

export interface ProfileFormData {
  nickname: string;
  avatar: string;
  bio: string;
}

export interface ValidationErrors {
  nickname?: string;
  avatar?: string;
  bio?: string;
}

const NICKNAME_REGEX = /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/;

export function validateNickname(value: string): string | undefined {
  if (value.length === 0) return undefined; // optional
  if (value.length < 2) return "昵称至少 2 个字符";
  if (value.length > 20) return "昵称不能超过 20 个字符";
  if (!NICKNAME_REGEX.test(value)) {
    return "昵称只能包含中文、英文、数字、下划线和连字符";
  }
  return undefined;
}

export function validateAvatarUrl(value: string): string | undefined {
  if (value.length === 0) return undefined; // optional
  try {
    new URL(value);
    return undefined;
  } catch {
    return "请输入有效的头像 URL";
  }
}

export function validateBio(value: string): string | undefined {
  if (value.length > 200) return "个人简介不能超过 200 个字符";
  return undefined;
}

export function validateProfileForm(data: ProfileFormData): ValidationErrors {
  const errors: ValidationErrors = {};
  const nicknameErr = validateNickname(data.nickname);
  if (nicknameErr) errors.nickname = nicknameErr;
  const avatarErr = validateAvatarUrl(data.avatar);
  if (avatarErr) errors.avatar = avatarErr;
  const bioErr = validateBio(data.bio);
  if (bioErr) errors.bio = bioErr;
  return errors;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function buildUpdatePayload(
  form: ProfileFormData,
  original: ProfileFormData
): Partial<ProfileFormData> {
  const payload: Partial<ProfileFormData> = {};
  if (form.nickname !== original.nickname) payload.nickname = form.nickname;
  if (form.avatar !== original.avatar) payload.avatar = form.avatar;
  if (form.bio !== original.bio) payload.bio = form.bio;
  return payload;
}

/* ---------- Main Page ---------- */

export default function SettingsProfilePage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [form, setForm] = useState<ProfileFormData>({
    nickname: "",
    avatar: "",
    bio: "",
  });
  const [original, setOriginal] = useState<ProfileFormData>({
    nickname: "",
    avatar: "",
    bio: "",
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Password form state
  const [hasPassword, setHasPassword] = useState(true);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        const profile: ProfileFormData = {
          nickname: data.user.nickname ?? "",
          avatar: data.user.avatar ?? "",
          bio: data.user.bio ?? "",
        };
        setForm(profile);
        setOriginal(profile);
        if (typeof data.user.hasPassword === "boolean") {
          setHasPassword(data.user.hasPassword);
        }
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleChange = (field: keyof ProfileFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      setErrors((prev) => ({ ...prev, avatar: "仅支持 JPG、PNG、WebP、GIF 格式" }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, avatar: "图片大小不能超过 10MB" }));
      return;
    }

    setAvatarUploading(true);
    setErrors((prev) => ({ ...prev, avatar: undefined }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        handleChange("avatar", data.url);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrors((prev) => ({ ...prev, avatar: data.error ?? "上传失败" }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, avatar: "网络错误，上传失败" }));
    } finally {
      setAvatarUploading(false);
      // Reset input so same file can be re-selected
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateProfileForm(form);
    setErrors(validationErrors);
    if (hasErrors(validationErrors)) return;

    const payload = buildUpdatePayload(form, original);
    if (Object.keys(payload).length === 0) {
      setMessage("没有需要保存的更改");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        const updated: ProfileFormData = {
          nickname: data.user.nickname ?? "",
          avatar: data.user.avatar ?? "",
          bio: data.user.bio ?? "",
        };
        setForm(updated);
        setOriginal(updated);
        setMessage("资料已更新");
      } else {
        const data = await res.json();
        setMessage(data.error ?? "更新失败");
      }
    } catch {
      setMessage("网络错误，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setPasswordError(parsed.error.errors[0]?.message ?? "密码格式无效");
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPasswordMessage("密码设置成功");
        setHasPassword(true);
        setPassword("");
      } else {
        const data = await res.json();
        setPasswordError(data.error ?? "设置失败");
      }
    } catch {
      setPasswordError("网络错误，请重试");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar />

      <main className={cn("mx-auto max-w-screen-md px-4 pb-24 pt-4 lg:ml-60")}>
        <h1 className="mb-6 text-2xl font-bold text-foreground">个人设置</h1>

        {/* Profile Edit Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>资料编辑</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Avatar upload */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {form.avatar ? (
                      <Image
                        src={form.avatar}
                        alt="头像预览"
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"
                        aria-label="默认头像"
                      >
                        <User className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                      aria-label="上传头像"
                    >
                      {avatarUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      aria-label="选择头像图片"
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="avatar">头像 URL</Label>
                    <Input
                      id="avatar"
                      value={form.avatar}
                      onChange={(e) => handleChange("avatar", e.target.value)}
                      placeholder="点击头像上传，或手动输入 URL"
                    />
                    {errors.avatar && (
                      <p className="mt-1 text-sm text-destructive">{errors.avatar}</p>
                    )}
                  </div>
                </div>

                {/* Nickname */}
                <div>
                  <Label htmlFor="nickname">昵称</Label>
                  <Input
                    id="nickname"
                    value={form.nickname}
                    onChange={(e) => handleChange("nickname", e.target.value)}
                    placeholder="输入昵称（2-20 字符）"
                    maxLength={20}
                  />
                  {errors.nickname && (
                    <p className="mt-1 text-sm text-destructive">{errors.nickname}</p>
                  )}
                </div>

                {/* Bio */}
                <div>
                  <Label htmlFor="bio">个人简介</Label>
                  <textarea
                    id="bio"
                    value={form.bio}
                    onChange={(e) => handleChange("bio", e.target.value)}
                    placeholder="介绍一下自己（最多 200 字符）"
                    maxLength={200}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.bio.length}/200
                  </p>
                  {errors.bio && (
                    <p className="mt-1 text-sm text-destructive">{errors.bio}</p>
                  )}
                </div>

                {/* Submit */}
                {message && (
                  <p className="text-sm text-muted-foreground">{message}</p>
                )}
                <Button type="submit" disabled={saving} className="min-h-[44px]">
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  保存
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Set Password Card — only shown when user has no password */}
        {!hasPassword && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>设置密码</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                您尚未设置密码。设置密码后可使用邮箱 + 密码方式登录。
              </p>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <Label htmlFor="set-password">密码</Label>
                  <Input
                    id="set-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError(null);
                      setPasswordMessage(null);
                    }}
                    placeholder="请输入密码（8-72 个字符）"
                    minLength={8}
                    maxLength={72}
                  />
                  {passwordError && (
                    <p className="mt-1 text-sm text-destructive">{passwordError}</p>
                  )}
                </div>
                {passwordMessage && (
                  <p className="text-sm text-muted-foreground">{passwordMessage}</p>
                )}
                <Button type="submit" disabled={passwordSaving} className="min-h-[44px]">
                  {passwordSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  设置密码
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Theme Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle>主题设置</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">深浅色模式</p>
                <p className="text-xs text-muted-foreground">
                  切换深色或浅色主题
                </p>
              </div>
              <ThemeToggle />
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomNav />
    </div>
  );
}
