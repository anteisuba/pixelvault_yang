import "server-only";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ─── R2 Client ────────────────────────────────────────────────────

const r2 = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: "auto",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// ─── Storage Key ──────────────────────────────────────────────────

/**
 * Generate a unique R2 storage key for a given output type.
 * Format: generations/image/YYYY-MM-DD_<8-char random>.png
 */
export function generateStorageKey(outputType: "IMAGE" | "VIDEO"): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, "0");

  if (outputType === "VIDEO") {
    return `generations/video/${date}_${random}.mp4`;
  }
  return `generations/image/${date}_${random}.png`;
}

// ─── Fetch as Buffer ──────────────────────────────────────────────

/**
 * Normalize an image URL to a Buffer + mimeType pair.
 * Handles both base64 data URLs and plain https URLs.
 */
export async function fetchAsBuffer(
  url: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (url.startsWith("data:")) {
    const [meta, base64] = url.split(",");
    const mimeType = meta.split(":")[1].split(";")[0];
    const buffer = Buffer.from(base64, "base64");
    return { buffer, mimeType };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get("content-type") ?? "image/png";

  return { buffer, mimeType };
}

// ─── Upload to R2 ─────────────────────────────────────────────────

/**
 * Upload a Buffer to Cloudflare R2 and return the public URL.
 */
export async function uploadToR2(params: {
  data: Buffer;
  key: string;
  mimeType: string;
}): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: params.key,
      Body: params.data,
      ContentType: params.mimeType,
    }),
  );

  return `${process.env.NEXT_PUBLIC_STORAGE_BASE_URL}/${params.key}`;
}
