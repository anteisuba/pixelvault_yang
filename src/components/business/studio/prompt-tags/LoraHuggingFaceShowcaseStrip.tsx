'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { LoraCoverPreviewDialog } from '@/components/business/studio/lora/library/LoraCoverPreviewDialog'
import type { LoraCoverPreviewState } from '@/components/business/studio/lora/library/LoraCoverPreviewDialog'

interface LoraHuggingFaceShowcaseStripProps {
  assetName: string
  images: readonly string[]
  prompts: readonly string[]
  onFillPrompt: (promptText: string) => void
}

/**
 * H1 生成侧「样例参考」（lora-workbench.md §13）：HF LoRA 在 civitai 「来源
 * 图/配方」的对应物——挂载 HF LoRA 时渲染在配方面板同一位置，README 全部
 * 内嵌图横滚 + 启发式提取的候选提示词列表。形制照搬
 * `LoraSourceImagePreviewStrip` 的预览图横滚条（同样的 h-24 w-20 缩略图 +
 * cursor-zoom-in），放大查看换成两源共用的 `LoraCoverPreviewDialog`（不是
 * 该组件内建的 civitai 专属 Dialog）；HF README 图是直链、没有 civitai 那种
 * 「缩略图参数 + Worker 代理」链路，不经过 `proxyCivitaiImageUrl`。
 *
 * 调用方（GenerateBranch）负责判定「当前分组挂载是不是 HF 资产」+ loading
 * 态（与 civitai `mined.isLoading` 同一套骨架，不重复实现）；本组件只管
 * 「有数据就画」，`images`/`prompts` 都空时按 §13 约定整条不渲染。
 */
export function LoraHuggingFaceShowcaseStrip({
  assetName,
  images,
  prompts,
  onFillPrompt,
}: LoraHuggingFaceShowcaseStripProps) {
  const t = useTranslations('LoraWorkbench')
  const [preview, setPreview] = useState<LoraCoverPreviewState | null>(null)

  if (images.length === 0 && prompts.length === 0) return null

  return (
    <div className="mt-2.5 space-y-2.5">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('showcaseTitle')}
      </p>

      {images.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {images.map((url, idx) => (
            <button
              key={url}
              type="button"
              onClick={() =>
                setPreview({
                  url,
                  name: t('showcaseImageAlt', { name: assetName, n: idx + 1 }),
                })
              }
              aria-label={t('showcaseImageAlt', {
                name: assetName,
                n: idx + 1,
              })}
              className="shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-border/60 outline-none transition-shadow hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                loading="lazy"
                className="h-24 w-20 object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {prompts.length > 0 ? (
        <ul className="space-y-1.5">
          {prompts.map((promptText) => (
            <li
              key={promptText}
              className="flex items-start justify-between gap-2 rounded-md border border-dashed border-border/70 p-2"
            >
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-foreground/90">
                {promptText}
              </p>
              <button
                type="button"
                onClick={() => onFillPrompt(promptText)}
                className="shrink-0 whitespace-nowrap text-2xs text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {t('showcaseFillPrompt')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <LoraCoverPreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
      />
    </div>
  )
}
