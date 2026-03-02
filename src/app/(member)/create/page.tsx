"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ImagePlus,
  X,
  GripVertical,
  Loader2,
  AlertTriangle,
  Send,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/layout/TopBar";

// ==================== Types ====================

interface Board {
  id: string;
  name: string;
  zone: string;
}

interface SensitiveMatch {
  word: string;
  category: string;
  startIndex: number;
  endIndex: number;
}

interface ImageItem {
  id: string;
  url: string; // local blob preview URL
  file: File;
  ossUrl?: string; // uploaded OSS URL (set after upload)
  uploading?: boolean;
  uploadError?: string;
}

// ==================== Constants ====================

const MAX_IMAGES = 9;
const MAX_TITLE_LENGTH = 30;
const MAX_TAGS = 5;
const PRIVATE_ZONES = ["PSYCHOLOGY", "DCR"];

// ==================== Helpers (exported for testing) ====================

export function validateTitle(title: string): string | null {
  if (!title.trim()) return "标题不能为空";
  if (title.length > MAX_TITLE_LENGTH) return `标题不能超过 ${MAX_TITLE_LENGTH} 个字符`;
  return null;
}

export function validateContent(content: string): string | null {
  if (!content.trim()) return "内容不能为空";
  if (content.length > 10000) return "内容不能超过 10000 个字符";
  return null;
}

export function validateImages(images: ImageItem[]): string | null {
  if (images.length > MAX_IMAGES) return `最多上传 ${MAX_IMAGES} 张图片`;
  return null;
}

export function validateBoard(boardId: string): string | null {
  if (!boardId) return "请选择分区";
  return null;
}

export function validateTags(tagIds: string[]): string | null {
  if (tagIds.length > MAX_TAGS) return `最多选择 ${MAX_TAGS} 个标签`;
  return null;
}

export function isPrivateZone(zone: string): boolean {
  return PRIVATE_ZONES.includes(zone);
}

export function reorderImages(
  images: ImageItem[],
  fromIndex: number,
  toIndex: number,
): ImageItem[] {
  if (
    fromIndex < 0 ||
    fromIndex >= images.length ||
    toIndex < 0 ||
    toIndex >= images.length
  ) {
    return images;
  }
  const result = [...images];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result;
}

export function buildSensitiveHighlightSegments(
  text: string,
  matches: SensitiveMatch[],
): Array<{ text: string; isSensitive: boolean }> {
  if (!matches.length) return [{ text, isSensitive: false }];

  const sorted = [...matches].sort((a, b) => a.startIndex - b.startIndex);
  const segments: Array<{ text: string; isSensitive: boolean }> = [];
  let cursor = 0;

  for (const match of sorted) {
    if (match.startIndex > cursor) {
      segments.push({ text: text.slice(cursor, match.startIndex), isSensitive: false });
    }
    segments.push({ text: text.slice(match.startIndex, match.endIndex), isSensitive: true });
    cursor = match.endIndex;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isSensitive: false });
  }

  return segments;
}

// ==================== Component ====================

let imageIdCounter = 0;
function generateImageId(): string {
  return `img-${Date.now()}-${++imageIdCounter}`;
}

export default function CreatePage() {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [boardId, setBoardId] = useState("");
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");

  // Data state
  const [boards, setBoards] = useState<Board[]>([]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [sensitiveMatches, setSensitiveMatches] = useState<SensitiveMatch[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived state
  const selectedBoard = boards.find((b) => b.id === boardId);
  const showVisibility = selectedBoard ? isPrivateZone(selectedBoard.zone) : false;

  // ==================== Data Fetching ====================

  useEffect(() => {
    async function loadData() {
      try {
        const boardsRes = await fetch("/api/boards");
        if (boardsRes.ok) {
          const data = await boardsRes.json();
          setBoards(data.boards ?? []);
        }
      } catch {
        // Silently handle fetch errors
      }
    }
    loadData();
  }, []);

  // ==================== Image Handling ====================

  const handleImageSelect = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const remaining = MAX_IMAGES - images.length;
      if (remaining <= 0) return;

      const newImages: ImageItem[] = [];
      for (let i = 0; i < Math.min(files.length, remaining); i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        newImages.push({
          id: generateImageId(),
          url: URL.createObjectURL(file),
          file,
          uploading: true,
        });
      }

      setImages((prev) => [...prev, ...newImages]);

      // Upload each image to OSS in background
      for (const img of newImages) {
        const form = new FormData();
        form.append("file", img.file);
        fetch("/api/upload", { method: "POST", body: form })
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              setImages((prev) =>
                prev.map((item) =>
                  item.id === img.id
                    ? { ...item, ossUrl: data.url, uploading: false }
                    : item,
                ),
              );
            } else {
              const data = await res.json().catch(() => ({ error: "上传失败" }));
              setImages((prev) =>
                prev.map((item) =>
                  item.id === img.id
                    ? { ...item, uploading: false, uploadError: data.error || "上传失败" }
                    : item,
                ),
              );
            }
          })
          .catch(() => {
            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id
                  ? { ...item, uploading: false, uploadError: "网络错误" }
                  : item,
              ),
            );
          });
      }
    },
    [images.length],
  );

  const handleRemoveImage = useCallback((id: string) => {
    setImages((prev) => {
      const item = prev.find((img) => img.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files?.length) {
        handleImageSelect(e.dataTransfer.files);
      }
    },
    [handleImageSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Image reorder drag handlers
  const handleImageDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleImageDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDragOverIndex(index);
    },
    [],
  );

  const handleImageDragEnd = useCallback(() => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      setImages((prev) => reorderImages(prev, dragIndex, dragOverIndex));
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex]);

  // ==================== Tag Input ====================

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (customTags.length >= MAX_TAGS) return;
    if (trimmed.length > 30) return;
    if (customTags.includes(trimmed)) {
      setTagInput("");
      return;
    }
    setCustomTags((prev) => [...prev, trimmed]);
    setTagInput("");
  }, [tagInput, customTags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setCustomTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddTag();
      }
    },
    [handleAddTag],
  );

  // ==================== Validation & Submit ====================

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    const titleErr = validateTitle(title);
    if (titleErr) newErrors.title = titleErr;

    const contentErr = validateContent(content);
    if (contentErr) newErrors.content = contentErr;

    const boardErr = validateBoard(boardId);
    if (boardErr) newErrors.board = boardErr;

    const tagErr = validateTags(customTags);
    if (tagErr) newErrors.tags = tagErr;

    const imgErr = validateImages(images);
    if (imgErr) newErrors.images = imgErr;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [title, content, boardId, customTags, images]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    if (submitting) return;

    // Client-side sensitive word pre-check
    const textToCheck = `${title} ${content}`;
    try {
      const scanRes = await fetch("/api/sensitive/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToCheck }),
      });
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (scanData.matches && scanData.matches.length > 0) {
          setSensitiveMatches(scanData.matches);
          setErrors((prev) => ({
            ...prev,
            sensitive: "内容包含敏感词，请修改后重新发布",
          }));
          return;
        }
      }
    } catch {
      // If scan endpoint unavailable, proceed with server-side check
    }

    // Check if any images are still uploading
    const stillUploading = images.some((img) => img.uploading);
    if (stillUploading) {
      setErrors({ images: "图片正在上传中，请稍候" });
      return;
    }

    // Check for upload errors
    const failedImages = images.filter((img) => img.uploadError);
    if (failedImages.length > 0) {
      setErrors({ images: "部分图片上传失败，请删除后重试" });
      return;
    }

    setSensitiveMatches([]);
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        title,
        content,
        boardId,
        tagNames: customTags.length > 0 ? customTags : undefined,
        images: images.length > 0 ? images.map((img) => img.ossUrl!) : undefined,
      };

      if (showVisibility) {
        body.visibility = visibility;
      }

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        // Post is now PENDING moderation — redirect to detail page where status badge shows
        router.push(`/post/${data.post.id}`);
      } else {
        const data = await res.json();
        if (data.matches) {
          setSensitiveMatches(data.matches);
          setErrors({ sensitive: "内容包含敏感词，请修改后重新发布" });
        } else {
          setErrors({ submit: data.error || "发布失败，请稍后重试" });
        }
      }
    } catch {
      setErrors({ submit: "网络错误，请稍后重试" });
    } finally {
      setSubmitting(false);
    }
  }, [
    validateForm,
    submitting,
    title,
    content,
    boardId,
    customTags,
    images,
    showVisibility,
    visibility,
    router,
  ]);

  // ==================== Render ====================

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold">发布帖子</h1>

        {/* Image Upload Area */}
        <div className="mb-6">
          <Label htmlFor="image-upload" className="mb-2 block">
            图片（最多 {MAX_IMAGES} 张）
          </Label>
          <div
            className={cn(
              "rounded-2xl border-2 border-dashed p-4 transition-colors",
              "hover:border-primary/50",
              images.length === 0 && "flex min-h-[120px] items-center justify-center",
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            role="region"
            aria-label="图片上传区域"
          >
            {images.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {images.map((img, index) => (
                  <div
                    key={img.id}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-xl border bg-muted",
                      dragIndex === index && "opacity-50",
                      dragOverIndex === index && "ring-2 ring-primary",
                    )}
                    draggable
                    onDragStart={() => handleImageDragStart(index)}
                    onDragOver={(e) => handleImageDragOver(e, index)}
                    onDragEnd={handleImageDragEnd}
                  >
                    <img
                      src={img.url}
                      alt={`上传图片 ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    {/* Upload status overlay */}
                    {img.uploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                    {img.uploadError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 p-1">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <span className="mt-1 text-center text-[10px] text-white">{img.uploadError}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-start justify-between bg-black/0 p-1 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
                      <GripVertical
                        className="h-5 w-5 cursor-grab text-white drop-shadow"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(img.id)}
                        className="rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
                        aria-label={`删除图片 ${index + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {images.length < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed text-muted-foreground hover:border-primary/50 hover:text-primary"
                    aria-label="添加更多图片"
                  >
                    <ImagePlus className="h-8 w-8" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-2 text-muted-foreground hover:text-primary"
                aria-label="点击或拖拽上传图片"
              >
                <ImagePlus className="h-10 w-10" />
                <span className="text-sm">点击或拖拽上传图片</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            id="image-upload"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleImageSelect(e.target.files)}
            aria-label="选择图片文件"
          />
          {errors.images && (
            <p className="mt-1 text-sm text-destructive">{errors.images}</p>
          )}
        </div>

        {/* Title Input */}
        <div className="mb-6">
          <Label htmlFor="post-title" className="mb-2 block">
            标题
          </Label>
          <div className="relative">
            <Input
              id="post-title"
              value={title}
              onChange={(e) => {
                const val = e.target.value;
                if (val.length <= MAX_TITLE_LENGTH) {
                  setTitle(val);
                }
              }}
              placeholder="输入标题（最多 30 字）"
              maxLength={MAX_TITLE_LENGTH}
              className={cn(errors.title && "border-destructive")}
              aria-describedby="title-count"
            />
            <span
              id="title-count"
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 text-xs",
                title.length >= MAX_TITLE_LENGTH
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {title.length}/{MAX_TITLE_LENGTH}
            </span>
          </div>
          {errors.title && (
            <p className="mt-1 text-sm text-destructive">{errors.title}</p>
          )}
        </div>

        {/* Content (Markdown Editor) */}
        <div className="mb-6">
          <Label htmlFor="post-content" className="mb-2 block">
            正文（支持 Markdown）
          </Label>
          {sensitiveMatches.length > 0 ? (
            <div className="mb-2 rounded-xl border border-destructive/50 bg-destructive/5 p-3">
              <div className="mb-1 flex items-center gap-1 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                检测到敏感词，请修改后重新发布
              </div>
              <div className="text-sm leading-relaxed">
                {buildSensitiveHighlightSegments(
                  `${title} ${content}`,
                  sensitiveMatches,
                ).map((seg, i) =>
                  seg.isSensitive ? (
                    <mark
                      key={i}
                      className="rounded bg-destructive/20 px-0.5 text-destructive"
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </div>
            </div>
          ) : null}
          <textarea
            id="post-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写点什么吧...（支持 Markdown 语法）"
            rows={10}
            className={cn(
              "flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              errors.content && "border-destructive",
            )}
            aria-label="帖子正文"
          />
          {errors.content && (
            <p className="mt-1 text-sm text-destructive">{errors.content}</p>
          )}
        </div>

        {/* Board Selector */}
        <div className="mb-6">
          <Label htmlFor="board-select" className="mb-2 block">
            分区
          </Label>
          <select
            id="board-select"
            value={boardId}
            onChange={(e) => {
              setBoardId(e.target.value);
              setSensitiveMatches([]);
            }}
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              errors.board && "border-destructive",
            )}
            aria-label="选择分区"
          >
            <option value="">请选择分区</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
          {errors.board && (
            <p className="mt-1 text-sm text-destructive">{errors.board}</p>
          )}
        </div>

        {/* Visibility Selector (private zones only) */}
        {showVisibility && (
          <div className="mb-6">
            <Label htmlFor="visibility-select" className="mb-2 block">
              可见范围
            </Label>
            <select
              id="visibility-select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="选择可见范围"
            >
              <option value="PUBLIC">公开</option>
              <option value="MATCHED">仅匹配方可见</option>
              <option value="MODS_ONLY">仅版主可见</option>
            </select>
          </div>
        )}

        {/* Tag Input */}
        <div className="mb-6">
          <Label className="mb-2 block">
            标签（最多 {MAX_TAGS} 个，输入后按回车添加）
          </Label>
          <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="已添加标签">
            {customTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-0.5 rounded-full hover:bg-primary-foreground/20"
                  aria-label={`删除标签: ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          {customTags.length < MAX_TAGS && (
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="输入标签名称，按回车添加"
              maxLength={30}
              aria-label="输入自定义标签"
            />
          )}
          {errors.tags && (
            <p className="mt-1 text-sm text-destructive">{errors.tags}</p>
          )}
        </div>

        {/* Error Messages */}
        {errors.sensitive && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errors.sensitive}
          </div>
        )}
        {errors.submit && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errors.submit}
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full"
          size="lg"
          aria-label="发布帖子"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              发布中...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              发布
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
