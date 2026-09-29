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

import { Fragment, useCallback, useState, type RefObject } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Mic, Search } from '@/components/icons'

import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  VOICE_LIBRARY_DATED_TAB_IDS,
  VOICE_LIBRARY_PANEL_WIDTH,
  VOICE_LIBRARY_TAB_IDS,
  type AudioClipSourceKind,
  type VoiceLibraryTabId,
} from '@/constants/audio-options'
import { motionTransition } from '@/constants/motion'
import {
  groupVoiceLibraryClipsByDate,
  landVoiceLibraryClip,
  useVoiceLibraryClips,
  type LandedVoiceLibraryClip,
  type VoiceLibraryClip,
} from '@/hooks/use-voice-library-clips'
import {
  canPreviewVoiceSample,
  useVoiceSamplePreview,
} from '@/hooks/use-voice-sample-preview'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { cn } from '@/lib/utils'

import { NodeFrame } from '../nodes/v4/chrome'
import { FishVoiceLibraryDialog } from '../FishVoiceLibraryDialog'
import { VoiceAvatarButton } from './VoiceAvatar'

export type { LandedVoiceLibraryClip, VoiceLibraryClip }

export interface VoiceLibraryPanelProps {
  readonly open: boolean
  onClose(): void
  /** 来处（那张音频卡）：框从它长出来、关上缩回它；手机抽屉里没有卡就不给。 */
  readonly origin?: RefObject<HTMLElement | null>
  /**
   * 「用这段」——把这段原声落成本卡的一版。⚠ 收到的地址已经在自己的存储里（平台
   * 样本 / 收藏由面板先存一份），⛔ 调用方不再转存。
   */
  onUseClip(clip: LandedVoiceLibraryClip): void
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
  origin,
  onUseClip,
  onSetVoice,
}: VoiceLibraryPanelProps) {
  const t = useTranslations('StudioNode.v4.audio.library')
  const tSource = useTranslations('StudioNode.v4.audio.source')
  const [tab, setTab] = useState<VoiceLibraryTabId>(VOICE_LIBRARY_TAB_IDS[0])
  /**
   * 切过页签没有：列表只在切页签那一下淡入（120，声音库动效表 A）。⚠ 头一回打开
   * 不淡 —— 那时整个框正从卡上长出来，再叠一层淡入就是两拍。
   */
  const [tabSwitched, setTabSwitched] = useState(false)
  const reduce = useReducedMotion()
  const tErrors = useTranslations('Errors')
  const [search, setSearch] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  /** 正在存进自己存储的那一行（平台样本 / 收藏「用这段」要先转存，1–3 秒）。 */
  const [landingId, setLandingId] = useState<string | null>(null)
  const preview = useVoiceSamplePreview()

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

  const close = () => {
    preview.stop()
    onClose()
  }

  /** 「用这段」：先换成自己存储里的地址（`landVoiceLibraryClip`），再交给卡。 */
  const landClip = (clip: VoiceLibraryClip) => {
    if (landingId) return
    setLandingId(clip.id)
    void landVoiceLibraryClip(clip).then((result) => {
      setLandingId(null)
      if (!result.success) {
        toast.error(getApiErrorMessage(tErrors, result, t('useFailed')))
        return
      }
      preview.stop()
      onUseClip(result.clip)
    })
  }

  /**
   * 这一栏按时间分组吗？音色那两栏（平台样本 / 收藏）没有时间轴，`null` 表示平铺。
   */
  const datedGroups = (
    VOICE_LIBRARY_DATED_TAB_IDS as readonly VoiceLibraryTabId[]
  ).includes(tab)
    ? groupVoiceLibraryClipsByDate(clips)
    : null

  /**
   * 一行 = 一段声音。⚠ 抽成函数是因为它现在有两个调用点：平铺（音色那两栏）
   * 与按日分组（录音那三栏）—— ⛔ 不把同一行的写法抄两遍。
   */
  const clipRow = (clip: VoiceLibraryClip) => {
    const duration = formatClipDuration(clip.durationSec)
    return (
      <div
        key={clip.id}
        data-voice-library-row={clip.id}
        className="flex min-h-14 items-center gap-3 rounded-xl px-2.5 transition-colors duration-fast hover:bg-surface-fill"
      >
        {/* 头像就是试听键（声音库方向 A）：封面 / 首字（没有封面的嗓子）/ 波形（录音）。 */}
        <VoiceAvatarButton
          cover={clip.coverUrl}
          fallback={clip.voiceId ? 'letter' : 'wave'}
          name={clip.name}
          size="library"
          playing={preview.playingId === clip.id}
          loading={preview.loadingId === clip.id}
          progress={preview.progress}
          disabled={!canPreviewVoiceSample(clip)}
          ariaLabel={t('preview')}
          onToggle={() =>
            preview.toggle({
              id: clip.id,
              url: clip.url,
              voiceId: clip.voiceId,
            })
          }
          buttonProps={{ 'data-voice-library-preview': clip.id }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-foreground">{clip.name}</span>
          {clip.subtitle ? (
            <span className="truncate text-xs text-muted-foreground">
              {clip.subtitle}
            </span>
          ) : null}
        </div>
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {duration ?? t('durationUnknown')}
        </span>
        <button
          type="button"
          data-voice-library-use={clip.id}
          disabled={landingId !== null}
          aria-busy={landingId === clip.id}
          onClick={() => landClip(clip)}
          className="flex min-h-7 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-[opacity,transform] duration-fast hover:opacity-90 active:scale-96 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          {landingId === clip.id ? <Spinner size="sm" /> : null}
          {t('use')}
        </button>
        {onSetVoice ? (
          <button
            type="button"
            data-voice-library-set-voice={clip.id}
            disabled={!clip.voiceId}
            onClick={() => onSetVoice(clip)}
            className={cn(
              'flex min-h-7 shrink-0 items-center rounded-full border border-border px-3 text-xs text-foreground',
              'transition-[border-color,transform] duration-fast hover:border-foreground/40 active:scale-96',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            {t('setVoice')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <NodeFrame
        open={open}
        origin={origin}
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
                if (!next) return
                setTab(next as VoiceLibraryTabId)
                setTabSwitched(true)
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

          {/* 按页签换一块新列表淡进来（⛔ 不做退场叠放：两份列表同时在就会把框撑高）。 */}
          <motion.div
            key={tab}
            data-voice-library-list={tab}
            initial={reduce || !tabSwitched ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={motionTransition('fast', reduce)}
            className="-mx-1 flex max-h-96 min-h-40 flex-col gap-0.5 overflow-y-auto px-1"
          >
            {clips.length === 0 ? (
              <p
                data-voice-library-empty
                className="px-2 py-6 text-2xs text-muted-foreground"
              >
                {isLoading ? t('loading') : (error ?? t('empty'))}
              </p>
            ) : datedGroups ? (
              // 「我的历史 / 配音间 / 素材库」= 一条时间轴，按 今天 / 昨天 / 更早
              // 分组（S5c 尾项）。⛔ 空组不出现。
              datedGroups.map((section) => (
                <Fragment key={section.group}>
                  <span
                    data-voice-library-group={section.group}
                    className="px-2 pt-2 pb-1 text-3xs text-muted-foreground"
                  >
                    {t(`dateGroups.${section.group}`)}
                  </span>
                  {section.clips.map(clipRow)}
                </Fragment>
              ))
            ) : (
              clips.map(clipRow)
            )}
          </motion.div>
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
