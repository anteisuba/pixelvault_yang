'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { StudioOperatorWebCandidateGrid } from '@/components/business/studio/assistant-operator/StudioOperatorWebCandidateGrid'
import { usePictureNumberReferences } from '@/hooks/use-picture-number-references'
import type { UseStudioOperatorWebImportResult } from '@/hooks/use-studio-operator-web-import'
import type {
  VoiceLineFile,
  VoiceLineImage,
  VoiceLineSource,
  VoiceLineWebImages,
} from '@/types/voiceroom'

/**
 * 台词气泡底下挂的东西（用户 10-25 Q3 选 C）：图一张一张单独发（像她发来的），来源折成一颗。
 *
 * ⭐ 她回复里提到的作品号（`图_12`）在气泡里不显示字，换成下面单独的一张图（查不到的号照原样留字）；
 *   你自己挂上去的图 / 文件存在 `attachments` 里，跟着你那条走。
 * ⭐ 她上网找的图（用户 10-25「点了存进素材」）就是助手那格候选网格（`StudioOperatorWebCandidateGrid`），
 *   存进素材走同一条转存路（`useStudioOperatorWebImport`，宿主一份）。
 */

export function VoiceLineImages({
  images,
}: {
  images: readonly Pick<VoiceLineImage, 'url' | 'label'>[]
}) {
  if (images.length === 0) return null
  return (
    <span className="vr-shots">
      {images.map((image) => (
        <a
          key={image.url}
          className="vr-shot"
          href={image.url}
          target="_blank"
          rel="noreferrer"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- R2 直链缩略图，不走 next/image 优化 */}
          <img src={image.url} alt={image.label ?? ''} loading="lazy" />
        </a>
      ))}
    </span>
  )
}

/** 回复里的作品号 → 一张张单独的图。 */
export function VoiceLinePictures({ text }: { text: string }) {
  const pictures = usePictureNumberReferences(text)
  return (
    <VoiceLineImages
      images={pictures.map((picture) => ({
        url: picture.url,
        label: picture.name,
      }))}
    />
  )
}

/** 「N 个来源 ▸」：点开是一列链接。 */
export function VoiceLineSources({
  sources,
}: {
  sources: readonly VoiceLineSource[]
}) {
  const t = useTranslations('VoiceRoom')
  const [open, setOpen] = useState(false)
  if (sources.length === 0) return null
  return (
    <span className="vr-sources">
      <button
        type="button"
        className="vr-sources-chip"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t('sources', { count: sources.length })}
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <ul className="vr-sources-list">
          {sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
              {source.publisher ? <span>{source.publisher}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  )
}

/** 你随这句传的音频 / 视频：就地能放。 */
export function VoiceLineFiles({ files }: { files: readonly VoiceLineFile[] }) {
  if (files.length === 0) return null
  return (
    <span className="vr-files">
      {files.map((file) =>
        file.kind === 'video' ? (
          <video
            key={file.id}
            className="vr-file-video"
            src={file.url}
            controls
            preload="metadata"
            aria-label={file.label}
          />
        ) : (
          <span key={file.id} className="vr-file-audio">
            <span className="vr-attached-name">{file.label}</span>
            <audio src={file.url} controls preload="none" />
          </span>
        ),
      )}
    </span>
  )
}

/** 她上网找的几组图：一组一格网格，挑了点「存进素材」。 */
export function VoiceLineWebImages({
  lineId,
  groups,
  webImport,
}: {
  lineId: string
  groups: readonly VoiceLineWebImages[]
  webImport?: UseStudioOperatorWebImportResult
}) {
  if (groups.length === 0) return null
  return (
    <span className="vr-web-images">
      {groups.map((group, index) => {
        const entryId = `${lineId}:${index}`
        return (
          <StudioOperatorWebCandidateGrid
            key={entryId}
            entryId={entryId}
            query={group.query}
            images={group.images}
            webImport={webImport?.states[entryId]}
            {...(webImport ? { onSave: webImport.saveCandidates } : {})}
          />
        )
      })}
    </span>
  )
}
