import { z } from "zod";

export const announcementSchema = z.object({
  title: z.string().trim().min(1, "请输入公告标题").max(100),
  content: z.string().trim().min(1, "请输入公告内容").max(20_000),
  forcePopup: z.boolean().default(true),
  sendDm: z.boolean().default(false),
}).strict();

export const announcementUpdateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  content: z.string().trim().min(1).max(20_000).optional(),
  forcePopup: z.boolean().optional(),
  isPublished: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "请至少修改一项");

export const announcementDismissSchema = z.object({
  revision: z.number().int().positive(),
}).strict();

export const SYSTEM_ANNOUNCEMENT_USER_ID = "system-announcements";
export const SYSTEM_ANNOUNCEMENT_NAME = "平台公告";

export function announcementStorageKey(id: string, revision: number) {
  return `forced-announcement:${id}:${revision}`;
}
