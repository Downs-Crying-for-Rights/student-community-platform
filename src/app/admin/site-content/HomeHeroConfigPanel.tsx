"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HomeHeroConfig } from "@/lib/home-content-config";

export function HomeHeroConfigPanel() {
  const [hero, setHero] = useState<HomeHeroConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/home-content", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "首页配置加载失败");
        setHero(data.hero);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "首页配置加载失败"));
  }, []);

  function updateLink(index: number, field: "label" | "href", value: string) {
    if (!hero) return;
    const links = hero.links.map((link, linkIndex) => (
      linkIndex === index ? { ...link, [field]: value } : link
    )) as HomeHeroConfig["links"];
    setHero({ ...hero, links });
  }

  async function save() {
    if (!hero) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/home-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hero),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setHero(data.hero);
      setMessage("首页顶部配置已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6 border-indigo-200/70 dark:border-indigo-800/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          首页顶部展示
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hero ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="space-y-4">
            <div>
              <Label>标题</Label>
              <Input className="mt-1" value={hero.title} maxLength={100} onChange={(event) => setHero({ ...hero, title: event.target.value })} />
            </div>
            <div>
              <Label>说明文字</Label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={hero.description}
                maxLength={500}
                onChange={(event) => setHero({ ...hero, description: event.target.value })}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {hero.links.map((link, index) => (
                <div key={index} className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">按钮 {index + 1}</p>
                  <div>
                    <Label>显示文字</Label>
                    <Input className="mt-1" value={link.label} maxLength={30} onChange={(event) => updateLink(index, "label", event.target.value)} />
                  </div>
                  <div>
                    <Label>站内跳转路径</Label>
                    <Input className="mt-1 font-mono text-xs" value={link.href} maxLength={300} onChange={(event) => updateLink(index, "href", event.target.value)} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">路径必须以 `/` 开头，可包含查询参数，例如 `/help/policies?document=community-guidelines`。</p>
            <div className="flex items-center gap-3">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存首页配置
              </Button>
              {message && <span className="text-sm text-muted-foreground" role="status">{message}</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
