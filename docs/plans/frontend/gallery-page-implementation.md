# Gallery 頁面實作指南

> 日期: 2026-03-05
> 項目: personal-ai-gallery
> 狀態: Phase 4 — Gallery 公開作品集

## 概覽

實現公開 Gallery 頁面：瀑布流佈局、圖片卡片（hover overlay）、Lightbox Modal、無限滾動分頁、Navbar 導航連結。

> [!NOTE]
> 以下所有路徑相對於 `personal-ai-gallery/`。已有的設定（middleware、routes、config）都已就位，不需要改動。

---

## Step 1: 新增 `countPublicGenerations` — Service 層

**檔案**: `src/services/generation.service.ts`
**位置**: 檔案末尾（`getGenerationById` 函數之後）新增

```typescript
/**
 * Count total public generations (for pagination hasMore calculation).
 */
export async function countPublicGenerations(): Promise<number> {
  return db.generation.count({
    where: { isPublic: true },
  });
}
```

---

## Step 2: 新增 Gallery 回應類型

**檔案**: `src/types/index.ts`
**位置**: 檔案末尾新增

```typescript
// ─── Gallery Response ─────────────────────────────────────────────

export interface GalleryResponseData {
  generations: GenerationRecord[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface GalleryResponse {
  success: boolean;
  data?: GalleryResponseData;
  error?: string;
}
```

---

## Step 3: 新建 `GET /api/images` API Route

**新建檔案**: `src/app/api/images/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  getPublicGenerations,
  countPublicGenerations,
} from "@/services/generation.service";
import { PAGINATION } from "@/constants/config";
import type { GalleryResponse } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(
      1,
      Number(searchParams.get("page")) || PAGINATION.DEFAULT_PAGE,
    );
    const limit = Math.min(
      50,
      Math.max(
        1,
        Number(searchParams.get("limit")) || PAGINATION.DEFAULT_LIMIT,
      ),
    );

    const [generations, total] = await Promise.all([
      getPublicGenerations({ page, limit }),
      countPublicGenerations(),
    ]);

    return NextResponse.json<GalleryResponse>({
      success: true,
      data: {
        generations,
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error("[API /api/images] Error:", error);
    return NextResponse.json<GalleryResponse>(
      { success: false, error: "Failed to fetch images" },
      { status: 500 },
    );
  }
}
```

---

## Step 4: 新增 `fetchGalleryImages` 到 API Client

**檔案**: `src/lib/api-client.ts`
**位置**: 檔案開頭 import 區塊加入新類型，然後在檔案末尾新增函數

**Import 修改** (第 1 行):

```diff
-import type { GenerateRequest, GenerateResponse } from "@/types";
+import type { GenerateRequest, GenerateResponse, GalleryResponse } from "@/types";
```

**末尾新增**:

```typescript
/**
 * Fetch public gallery images with pagination.
 */
export async function fetchGalleryImages(
  page: number = 1,
  limit: number = 20,
): Promise<GalleryResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.IMAGES}?page=${page}&limit=${limit}`,
    );

    if (!response.ok) {
      return { success: false, error: `Failed with status ${response.status}` };
    }

    return await response.json();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}
```

---

## Step 5: 新建 `use-gallery.ts` Hook

**新建檔案**: `src/hooks/use-gallery.ts`

```typescript
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { GenerationRecord } from "@/types";
import { fetchGalleryImages } from "@/lib/api-client";

interface UseGalleryReturn {
  generations: GenerationRecord[];
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  /** Ref to attach to the sentinel element for infinite scroll */
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function useGallery(limit: number = 20): UseGalleryReturn {
  const [generations, setGenerations] = useState<GenerationRecord[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setError(null);

    const response = await fetchGalleryImages(page, limit);

    if (response.success && response.data) {
      setGenerations((prev) => [...prev, ...response.data!.generations]);
      setHasMore(response.data.hasMore);
      setPage((prev) => prev + 1);
    } else {
      setError(response.error ?? "Failed to load images");
    }

    setIsLoading(false);
  }, [page, limit, isLoading, hasMore]);

  // Initial load
  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  return { generations, isLoading, hasMore, error, loadMore, sentinelRef };
}
```

---

## Step 6: 新建 `ImageCard.tsx` 組件

**新建檔案**: `src/components/business/ImageCard.tsx`

```tsx
"use client";

import Image from "next/image";
import type { GenerationRecord } from "@/types";

interface ImageCardProps {
  generation: GenerationRecord;
  onClick?: (generation: GenerationRecord) => void;
}

export function ImageCard({ generation, onClick }: ImageCardProps) {
  const aspectRatio = generation.width / generation.height;

  return (
    <div
      className="group relative mb-4 cursor-pointer overflow-hidden rounded-xl shadow-sm transition-shadow hover:shadow-lg break-inside-avoid"
      onClick={() => onClick?.(generation)}
    >
      {/* Image */}
      <Image
        src={generation.url}
        alt={generation.prompt.slice(0, 100)}
        width={generation.width}
        height={generation.height}
        className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
      />

      {/* Hover Overlay */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="line-clamp-2 text-sm text-white">{generation.prompt}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-white/70">
          <span>{generation.model}</span>
          <span>{new Date(generation.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 7: 新建 `ImageModal.tsx` Lightbox 組件

**新建檔案**: `src/components/business/ImageModal.tsx`

```tsx
"use client";

import { useEffect, useCallback } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { GenerationRecord } from "@/types";

interface ImageModalProps {
  generation: GenerationRecord;
  onClose: () => void;
}

export function ImageModal({ generation, onClose }: ImageModalProps) {
  // ESC 鍵關閉
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl animate-in zoom-in-95 duration-200 md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
        >
          <X className="size-5" />
        </button>

        {/* Image */}
        <div className="relative flex-1 bg-black">
          <Image
            src={generation.url}
            alt={generation.prompt.slice(0, 100)}
            width={generation.width}
            height={generation.height}
            className="h-auto max-h-[60vh] w-full object-contain md:max-h-[85vh] md:max-w-[60vw]"
            priority
          />
        </div>

        {/* Info Panel */}
        <div className="flex w-full flex-col gap-4 p-6 md:w-80">
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Prompt
            </h3>
            <p className="text-sm leading-relaxed">{generation.prompt}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Model</span>
              <p className="font-medium">{generation.model}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Provider</span>
              <p className="font-medium">{generation.provider}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Size</span>
              <p className="font-medium">
                {generation.width} × {generation.height}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Date</span>
              <p className="font-medium">
                {new Date(generation.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div>
            <span className="text-xs text-muted-foreground">Credits Cost</span>
            <p className="font-medium">{generation.creditsCost}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 8: 新建 `GalleryGrid.tsx` 組件

**新建檔案**: `src/components/business/GalleryGrid.tsx`

```tsx
"use client";

import { useState } from "react";
import { ImageCard } from "./ImageCard";
import { ImageModal } from "./ImageModal";
import type { GenerationRecord } from "@/types";

interface GalleryGridProps {
  generations: GenerationRecord[];
  isLoading: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function GalleryGrid({
  generations,
  isLoading,
  sentinelRef,
}: GalleryGridProps) {
  const [selected, setSelected] = useState<GenerationRecord | null>(null);

  // Empty state
  if (!isLoading && generations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          No images yet
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Be the first to create something amazing!
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Masonry Grid */}
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
        {generations.map((gen) => (
          <ImageCard key={gen.id} generation={gen} onClick={setSelected} />
        ))}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      )}

      {/* Infinite Scroll Sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {/* Lightbox Modal */}
      {selected && (
        <ImageModal generation={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
```

---

## Step 9: 新建 Gallery 頁面

**新建檔案**: `src/app/[locale]/(main)/gallery/page.tsx`

```tsx
"use client";

import { GalleryGrid } from "@/components/business/GalleryGrid";
import { useGallery } from "@/hooks/use-gallery";

export default function GalleryPage() {
  const { generations, isLoading, sentinelRef } = useGallery();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
      {/* Page Header */}
      <div className="mb-10 space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Gallery
        </h1>
        <p className="text-muted-foreground">
          Explore AI-generated artwork from the community
        </p>
      </div>

      {/* Gallery Grid */}
      <GalleryGrid
        generations={generations}
        isLoading={isLoading}
        sentinelRef={sentinelRef}
      />
    </div>
  );
}
```

---

## Step 10: 更新 Navbar — 加入導航連結

**檔案**: `src/components/layout/Navbar.tsx`

### 10a. 新增 import

在第 3 行之後加入：

```typescript
import { ImageIcon, Sparkles } from "lucide-react";
```

### 10b. Logo 後面加導航連結

找到 `{/* Right side */}` 這行（約第 35 行），在它**之前**插入以下代碼：

```tsx
{
  /* Navigation Links */
}
<nav className="flex items-center gap-1">
  <Link
    href="/en/gallery"
    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
  >
    <ImageIcon className="size-4" />
    <span className="hidden sm:inline">Gallery</span>
  </Link>
  <SignedIn>
    <Link
      href="/en/studio"
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Sparkles className="size-4" />
      <span className="hidden sm:inline">Studio</span>
    </Link>
  </SignedIn>
</nav>;
```

---

## Step 11: next.config.ts — 允許 R2 域名圖片

**檔案**: `next.config.ts`

`next/image` 需要配置允許的外部圖片域名。你的 R2 公開域名需要加到 `images.remotePatterns` 中。

查看你的 `.env.local` 裡的 `NEXT_PUBLIC_STORAGE_BASE_URL`，假設是 `https://xxx.r2.dev`，改成：

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**", // 或者填你的 R2 域名如 "your-bucket.r2.dev"
      },
    ],
  },
};

export default nextConfig;
```

> [!IMPORTANT]
> 如果你已經有 `next.config.ts` 的其他設定，只需要加 `images` 區塊就好。

---

## 順序總結

| 順序 | 操作                                    | 檔案                                            |
| ---- | --------------------------------------- | ----------------------------------------------- |
| 1    | 新增 `countPublicGenerations`           | `src/services/generation.service.ts` (末尾追加) |
| 2    | 新增 `GalleryResponse` 類型             | `src/types/index.ts` (末尾追加)                 |
| 3    | **新建** API Route                      | `src/app/api/images/route.ts`                   |
| 4    | 修改 import + 新增 `fetchGalleryImages` | `src/lib/api-client.ts`                         |
| 5    | **新建** Hook                           | `src/hooks/use-gallery.ts`                      |
| 6    | **新建** 圖片卡片                       | `src/components/business/ImageCard.tsx`         |
| 7    | **新建** Lightbox Modal                 | `src/components/business/ImageModal.tsx`        |
| 8    | **新建** 瀑布流網格                     | `src/components/business/GalleryGrid.tsx`       |
| 9    | **新建** Gallery 頁面                   | `src/app/[locale]/(main)/gallery/page.tsx`      |
| 10   | 修改 Navbar 加導航                      | `src/components/layout/Navbar.tsx`              |
| 11   | 設定 next/image 外部域名                | `next.config.ts`                                |

## 驗證

1. 確認 `http://localhost:3000/api/images` 回傳正確 JSON
2. 確認 `http://localhost:3000/en/gallery` 頁面正常顯示
3. 確認 Navbar 有 Gallery / Studio 連結
4. 未登錄也能訪問 Gallery
5. `npm run build` 無錯誤
