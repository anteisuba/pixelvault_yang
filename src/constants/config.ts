/**
 * Application-wide configuration constants
 */

/** Default credits for new users */
export const DEFAULT_CREDITS = 10;

/** Supported image size configurations */
export const IMAGE_SIZES = {
  "1:1": { width: 1024, height: 1024, label: "1:1 (Square)" },
  "16:9": { width: 1792, height: 1024, label: "16:9 (Landscape)" },
  "9:16": { width: 1024, height: 1792, label: "9:16 (Portrait)" },
  "4:3": { width: 1024, height: 768, label: "4:3 (Standard)" },
  "3:4": { width: 768, height: 1024, label: "3:4 (Tall)" },
} as const;

/** Type for supported aspect ratios */
export type AspectRatio = keyof typeof IMAGE_SIZES;

/** Default aspect ratio */
export const DEFAULT_ASPECT_RATIO: AspectRatio = "1:1";

/** API endpoint paths */
export const API_ENDPOINTS = {
  /** Image generation */
  GENERATE: "/api/generate",

  /** Image listing (public gallery) */
  IMAGES: "/api/images",

  /** User credits */
  CREDITS: "/api/credits",

  /** Clerk webhook */
  CLERK_WEBHOOK: "/api/webhooks/clerk",
} as const;

/** External AI provider endpoints */
export const AI_PROVIDER_ENDPOINTS = {
  HUGGINGFACE: "https://router.huggingface.co/hf-inference/models",
  SILICONFLOW: "https://api.siliconflow.cn/v1/images/generations",
} as const;

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
} as const;
