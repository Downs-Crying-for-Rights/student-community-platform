/**
 * OSS 实际上传/下载端到端测试脚本
 *
 * 用法: npx tsx scripts/test-oss.ts
 *
 * 测试流程:
 * 1. 用 sharp 生成一张测试 PNG 图片
 * 2. 调用 compressImage 压缩为 WebP
 * 3. 调用 uploadToOSS 上传到阿里云 OSS
 * 4. 用 fetch 下载上传后的 URL，验证可访问
 * 5. 验证下载内容是有效的 WebP 图片
 * 6. 打印结果摘要
 */

import "dotenv/config";
import sharp from "sharp";
import {
  generateObjectKey,
  compressImage,
  uploadToOSS,
  validateFile,
} from "../src/lib/oss";

// ANSI colors
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function ok(msg: string) { console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`${RED}✗${RESET} ${msg}`); }
function info(msg: string) { console.log(`${CYAN}ℹ${RESET} ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠${RESET} ${msg}`); }

async function main() {
  console.log("\n========== OSS 上传/下载 端到端测试 ==========\n");

  // ---------- 检查环境变量 ----------
  const requiredEnvs = [
    "OSS_REGION",
    "OSS_BUCKET",
    "OSS_ACCESS_KEY_ID",
    "OSS_ACCESS_KEY_SECRET",
    "OSS_ENDPOINT",
    "OSS_CDN_DOMAIN",
  ];
  const missing = requiredEnvs.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    fail(`缺少环境变量: ${missing.join(", ")}`);
    process.exit(1);
  }
  ok("环境变量检查通过");
  info(`Bucket: ${process.env.OSS_BUCKET}`);
  info(`Endpoint: ${process.env.OSS_ENDPOINT}`);
  info(`CDN: ${process.env.OSS_CDN_DOMAIN}`);

  // ---------- 1. 生成测试图片 ----------
  info("生成 200x200 红色测试 PNG 图片...");
  const testPng = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();

  ok(`测试图片生成完成，大小: ${testPng.length} bytes`);

  // ---------- 2. 文件校验 ----------
  const validationError = validateFile(testPng.length, "image/png");
  if (validationError) {
    fail(`文件校验失败: ${validationError}`);
    process.exit(1);
  }
  ok("文件校验通过 (image/png)");

  // ---------- 3. 压缩图片 ----------
  info("压缩图片 (PNG → WebP)...");
  const t0 = Date.now();
  const { data: compressed, contentType } = await compressImage(testPng, "image/png");
  const compressMs = Date.now() - t0;
  ok(`压缩完成: ${testPng.length} → ${compressed.length} bytes (${contentType}), 耗时 ${compressMs}ms`);

  // ---------- 4. 上传到 OSS ----------
  const key = generateObjectKey("webp");
  info(`上传到 OSS: ${key}`);
  const t1 = Date.now();
  let url: string;
  try {
    url = await uploadToOSS(compressed, key, contentType);
    const uploadMs = Date.now() - t1;
    ok(`上传成功，耗时 ${uploadMs}ms`);
    ok(`URL: ${url}`);
  } catch (err: unknown) {
    const uploadMs = Date.now() - t1;
    fail(`上传失败 (${uploadMs}ms): ${err instanceof Error ? err.message : err}`);

    // 常见问题提示
    if (err instanceof Error) {
      if (err.message.includes("InvalidAccessKeyId")) {
        warn("AccessKeyId 无效，请检查 OSS_ACCESS_KEY_ID");
      } else if (err.message.includes("SignatureDoesNotMatch")) {
        warn("签名不匹配，请检查 OSS_ACCESS_KEY_SECRET");
      } else if (err.message.includes("NoSuchBucket")) {
        warn(`Bucket "${process.env.OSS_BUCKET}" 不存在，请检查 OSS_BUCKET`);
      } else if (err.message.includes("ENOTFOUND") || err.message.includes("getaddrinfo")) {
        warn("DNS 解析失败，请检查 OSS_ENDPOINT 是否正确");
      }
    }
    process.exit(1);
  }

  // ---------- 5. 下载验证 ----------
  info("下载验证...");
  const t2 = Date.now();
  try {
    const res = await fetch(url);
    const downloadMs = Date.now() - t2;

    if (!res.ok) {
      fail(`下载失败: HTTP ${res.status} ${res.statusText} (${downloadMs}ms)`);
      process.exit(1);
    }

    const downloadedBuffer = Buffer.from(await res.arrayBuffer());
    ok(`下载成功: ${downloadedBuffer.length} bytes, 耗时 ${downloadMs}ms`);

    // 验证 Content-Type
    const ct = res.headers.get("content-type");
    if (ct?.includes("webp") || ct?.includes("image")) {
      ok(`Content-Type: ${ct}`);
    } else {
      warn(`Content-Type 不是预期的 image/webp: ${ct}`);
    }

    // 验证是有效图片
    const metadata = await sharp(downloadedBuffer).metadata();
    ok(`图片验证通过: ${metadata.width}x${metadata.height}, 格式: ${metadata.format}`);

    // 验证大小一致
    if (downloadedBuffer.length === compressed.length) {
      ok("文件大小一致 ✓");
    } else {
      warn(`文件大小不一致: 上传 ${compressed.length} vs 下载 ${downloadedBuffer.length}`);
    }
  } catch (err: unknown) {
    fail(`下载验证失败: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // ---------- 结果 ----------
  console.log(`\n${GREEN}========== 全部测试通过 ==========${RESET}\n`);
}

main().catch((err) => {
  fail(`未预期的错误: ${err.message}`);
  console.error(err);
  process.exit(1);
});
