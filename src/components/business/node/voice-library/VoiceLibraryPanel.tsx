'use client'

/**
 * **声音库面板**（S5c，画板 `AudioLibrary.dc.html`）。
 *
 * 画中框式 640 宽：搜索 + 五个页签（平台样本 / 我的历史 / 配音间 / 素材库 / 收藏），
 * 每行 `名 · 副标 · 时长 · 试听 · 「用这段」· 「设为音色」`，底部一句说明 +
 * 「克隆我的声音…」。
 *
 * ── 两个动词的分工（画板底部那句话就是契约）──────────────────────────────
 * · **「用这段」= 原声直接落进这张卡**（追加一版 + 记 `source`），⛔ 不生成、
 *   不扣积分。spec §4「直接落进来的声音没有提示词与版本，改台词并回车才第一次生成」。
 * · **「设为音色」= 之后写台词用它的声**（写 `voiceProfile.voiceId`）。只有带
 *   `voiceId` 的行（平台样本 / 收藏）按得动 —— 一段历史录音继承不了嗓子。
 *
 * ⚠ 壳借 `chrome/NodeFrame`（画中框、Esc / 点外关闭、压暗层 portal 到 body 都在
 * 它身上），⛔ 这里不再写第二套浮层。
 */

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Mic, Pause, Play, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  VOICE_LIBRARY_PANEL_WIDTH,
  VOICE_LIBRARY_TAB_IDS,
  type AudioClipSourceKind,
  type VoiceLibraryTabId,
} from '@/constants/audio-options'
import {
  useVoiceLibraryClips,
  type VoiceLibraryClip,
} from '@/hooks/use-voice-library-clips'
import { cn } from '@/lib/utils'

import { NodeFrame } from '../nodes/v4/chrome'
import { FishVoiceLibraryDialog } from '../FishVoiceLibraryDialog'

export type { VoiceLibraryClip }

export interface VoiceLibraryPanelProps {
  readonly open: boolean
  onClose(): void
  /** 「用这段」——把这段原声落成本卡的一版。 */
  onUseClip(clip: VoiceLibraryClip): void
  /**
   * 「设为音色」。⚠ 配乐 / 音效卡没有音色可言，调用方**不传**这个回调，
   * ⛔ 不摆一排按了什么都不变的灰按钮。
   */
  onSetVoice?: ((clip: VoiceLibraryClip) => void) | undefined
}

/** `7s` / `--:--` —— 与卡上那一行读数同一种写法。 */
function formatClipDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null
  return `${Math.round(seconds)}s`
}

export function VoiceLibraryPanel({
  open,
  onClose,
  onUseClip,
  onSetVoice,
}: VoiceLibraryPanelProps) {
  const t = useTranslations('StudioNode.v4.audio.library')
  const tSource = useTranslations('StudioNode.v4.audio.source')
  const [tab, setTab] = useState<VoiceLibraryTabId>(VOICE_LIBRARY_TAB_IDS[0])
  const [search, setSearch] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [cloneOpen, setCloneOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ⚠ 文案属于渲染层，所以来源那行小字由这里拼好递给 hook（hook 不认识 i18n）。
  const labelOf = useCallback(
    (kind: AudioClipSourceKind, name: string) =>
      `${tSource(kind)} · ${name}`.slice(0, 200),
    [tSource],
  )

  const { clips, isLoading, error } = useVoiceLibraryClips({
    tab,
    enabled: open,
    search,
    labelOf,
  })

  /** 试听：一次只响一条（与音色 chip 弹层同一条手感）。 */
  const preview = (clip: VoiceLibraryClip) => {
    const current = audioRef.current
    if (current && previewId === clip.id) {
      current.pause()
      setPreviewId(null)
      return
    }
    current?.pause()
    const next = new Audio(clip.url)
    audioRef.current = next
    next.onended = () => setPreviewId(null)
    setPreviewId(clip.id)
    void next.play().catch(() => setPreviewId(null))
  }

  const close = () => {
    audioRef.current?.pause()
    setPreviewId(null)
    onClose()
  }

  return (
    <>
      <NodeFrame
        open={open}
        onClose={close}
        title={t('title')}
        width={VOICE_LIBRARY_PANEL_WIDTH}
        ariaLabel={t('title')}
        footer={
          <div
            data-voice-library-footer
            className="flex items-center justify-between gap-3"
          >
            <p className="text-3xs text-muted-foreground">{t('footerHint')}</p>
            <button
              type="button"
              data-voice-library-clone
              onClick={() => setCloneOpen(true)}
              className="flex min-h-8.5 shrink-0 items-center gap-2 rounded-lg bg-surface-fill px-3 text-2sm text-foreground transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Mic aria-hidden className="size-4" />
              {t('clone')}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface-fill px-3">
              <Search
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
              <Input
                value={search}
                data-voice-library-search
                aria-label={t('searchLabel')}
                placeholder={t('searchPlaceholder')}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 border-0 px-0 text-2sm shadow-none focus-visible:ring-0"
              />
            </div>
            <ToggleGroup
              type="single"
              variant="segmented"
              aria-label={t('tabsLabel')}
              value={tab}
              onValueChange={(next) => {
                if (next) setTab(next as VoiceLibraryTabId)
              }}
            >
              {VOICE_LIBRARY_TAB_IDS.map((id) => (
                <ToggleGroupItem
                  key={id}
                  value={id}
                  data-voice-library-tab={id}
                >
                  {t(`tabs.${id}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div
            data-voice-library-list={tab}
            className="-mx-1 flex max-h-96 min-h-40 flex-col gap-0.5 overflow-y-auto px-1"
          >
            {clips.length === 0 ? (
              <p
                data-voice-library-empty
                className="px-2 py-6 text-2xs text-muted-foreground"
              >
                {isLoading ? t('loading') : (error ?? t('empty'))}
              </p>
            ) : (
              clips.map((clip) => {
                const duration = formatClipDuration(clip.durationSec)
                return (
                  <div
                    key={clip.id}
                    data-voice-library-row={clip.id}
                    className="flex min-h-13 items-center gap-2.5 rounded-lg px-2 transition-colors duration-fast hover:bg-surface-fill"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-2sm text-foreground">
                        {clip.name}
                      </span>
                      {clip.subtitle ? (
                        <span className="truncate text-3xs text-muted-foreground">
                          {clip.subtitle}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-3xs tabular-nums text-muted-foreground">
                      {duration ?? t('durationUnknown')}
                    </span>
                    <button
                      type="button"
                      data-voice-library-preview={clip.id}
                      aria-label={t('preview')}
                      onClick={() => preview(clip)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-fill text-foreground transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {previewId === clip.id ? (
                        <Pause aria-hidden className="size-3" />
                      ) : (
                        <Play aria-hidden className="size-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      data-voice-library-use={clip.id}
                      onClick={() => onUseClip(clip)}
                      className="flex min-h-7 shrink-0 items-center rounded-full bg-primary px-2.5 text-3xs font-medium text-primary-foreground transition-opacity duration-fast hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t('use')}
                    </button>
                    {onSetVoice ? (
                      <button
                        type="button"
                        data-voice-library-set-voice={clip.id}
                        disabled={!clip.voiceId}
                        onClick={() => onSetVoice(clip)}
                        className={cn(
                          'flex min-h-7 shrink-0 items-center rounded-full border border-border px-2.5 text-3xs text-foreground',
                          'transition-colors duration-fast hover:border-foreground/40',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          'disabled:pointer-events-none disabled:opacity-40',
                        )}
                      >
                        {t('setVoice')}
                      </button>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </NodeFrame>

      {/* 「克隆我的声音…」= 既有的克隆流程（⛔ 不新写一套训练界面）。 */}
      <FishVoiceLibraryDialog
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        selectedVoiceId={null}
        onSelectVoiceId={() => {}}
        onVoiceSelectComplete={() => setCloneOpen(false)}
      />
    </>
  )
}
