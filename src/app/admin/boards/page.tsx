"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BoardItem {
  id: string;
  name: string;
  description: string | null;
  zone: "PUBLIC" | "PSYCHOLOGY" | "DCR";
  sortWeight: number;
  isActive: boolean;
  createdAt: string;
  _count?: { posts: number };
}

const ZONES = ["PUBLIC", "PSYCHOLOGY", "DCR"] as const;

const ZONE_LABELS: Record<string, { text: string; className: string }> = {
  PUBLIC: { text: "公开区", className: "bg-green-100 text-green-700" },
  PSYCHOLOGY: { text: "心理区", className: "bg-purple-100 text-purple-700" },
  DCR: { text: "DCR 区", className: "bg-orange-100 text-orange-700" },
};

export default function AdminBoardsPage() {
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createZone, setCreateZone] = useState<typeof ZONES[number]>("PUBLIC");
  const [createSortWeight, setCreateSortWeight] = useState(0);
  const [creating, setCreating] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSortWeight, setEditSortWeight] = useState(0);
  const [saving, setSaving] = useState(false);

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/boards?admin=true");
      if (res.ok) {
        const data = await res.json();
        setBoards(data.boards);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || undefined,
          zone: createZone,
          sortWeight: createSortWeight,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setCreateName("");
        setCreateDescription("");
        setCreateZone("PUBLIC");
        setCreateSortWeight(0);
        fetchBoards();
      }
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (board: BoardItem) => {
    setEditingId(board.id);
    setEditName(board.name);
    setEditDescription(board.description || "");
    setEditSortWeight(board.sortWeight);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/boards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          sortWeight: editSortWeight,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchBoards();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const res = await fetch(`/api/boards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !currentActive }),
    });
    if (res.ok) fetchBoards();
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">板块管理</h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "取消" : "创建板块"}
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">创建新板块</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div>
                <label htmlFor="create-name" className="block text-sm mb-1">板块名称</label>
                <input
                  id="create-name"
                  type="text"
                  maxLength={50}
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="border rounded px-3 py-2 text-sm w-48"
                  placeholder="输入板块名称"
                />
              </div>
              <div>
                <label htmlFor="create-zone" className="block text-sm mb-1">所属区域</label>
                <select
                  id="create-zone"
                  className="border rounded px-3 py-2 text-sm"
                  value={createZone}
                  onChange={(e) => setCreateZone(e.target.value as typeof ZONES[number])}
                >
                  {ZONES.map((z) => (
                    <option key={z} value={z}>{ZONE_LABELS[z].text}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="create-sort" className="block text-sm mb-1">排序权重</label>
                <input
                  id="create-sort"
                  type="number"
                  min={0}
                  value={createSortWeight}
                  onChange={(e) => setCreateSortWeight(Math.max(0, Number(e.target.value)))}
                  className="border rounded px-3 py-2 text-sm w-24"
                />
              </div>
            </div>
            <div>
              <label htmlFor="create-desc" className="block text-sm mb-1">描述（可选）</label>
              <textarea
                id="create-desc"
                maxLength={500}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full"
                rows={2}
                placeholder="输入板块描述"
              />
            </div>
            <Button onClick={handleCreate} disabled={creating || !createName.trim()}>
              {creating ? "创建中..." : "确认创建"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Board Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3">板块名称</th>
                    <th className="text-left p-3">描述</th>
                    <th className="text-left p-3">区域</th>
                    <th className="text-left p-3">排序权重</th>
                    <th className="text-left p-3">帖子数</th>
                    <th className="text-left p-3">状态</th>
                    <th className="text-left p-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {boards.map((board) => {
                    const zone = ZONE_LABELS[board.zone] || { text: board.zone, className: "bg-gray-100 text-gray-700" };
                    const isEditing = editingId === board.id;

                    return (
                      <tr key={board.id} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          {isEditing ? (
                            <input
                              aria-label="编辑板块名称"
                              type="text"
                              maxLength={50}
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="border rounded px-2 py-1 text-sm w-36"
                            />
                          ) : (
                            <span className="font-medium">{board.name}</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">
                          {isEditing ? (
                            <input
                              aria-label="编辑板块描述"
                              type="text"
                              maxLength={500}
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              className="border rounded px-2 py-1 text-sm w-full"
                            />
                          ) : (
                            board.description || "-"
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${zone.className}`}>
                            {zone.text}
                          </span>
                        </td>
                        <td className="p-3">
                          {isEditing ? (
                            <input
                              aria-label="编辑排序权重"
                              type="number"
                              min={0}
                              value={editSortWeight}
                              onChange={(e) => setEditSortWeight(Math.max(0, Number(e.target.value)))}
                              className="border rounded px-2 py-1 text-sm w-20"
                            />
                          ) : (
                            board.sortWeight
                          )}
                        </td>
                        <td className="p-3">{board._count?.posts ?? 0}</td>
                        <td className="p-3">
                          <button
                            onClick={() => handleToggleActive(board.id, board.isActive)}
                            className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                              board.isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                            aria-label={`切换 ${board.name} 的可见性`}
                          >
                            {board.isActive ? "可见" : "隐藏"}
                          </button>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => handleSaveEdit(board.id)}
                                  disabled={saving}
                                >
                                  {saving ? "保存中..." : "保存"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={cancelEdit}
                                >
                                  取消
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => startEdit(board)}
                              >
                                编辑
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {boards.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        暂无板块
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
