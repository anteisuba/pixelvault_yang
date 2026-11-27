'use client'

/**
 * 画布图片节点提示词栏上的 **NovelAI 角色与精确参考** 弹层（Slice 3）。
 *
 * 仅在当前模型属于 `AI_ADAPTER_TYPES.NOVELAI` 时渲染；所有选项严格派生自
 * `NOVELAI_GENERATION_CONTRACT`：
 * 1. **参考轨分流**：把连入 `reference` 槽的上游图按节点切分为「底图（img2img）」或
 *    「精确参考（+5 Anlas / 张）」，按模型代际展示 V4.5（3 种 kind + strength 0–1 +
 *    fidelity）或 V5（4 种 kind + strength 0–5 + 保留服装）控件，并在正文有 `@角色卡`
 *    时提供显式「角色卡造型图走精确参考」开关（默认关）。
 * 2. **多角色构图**：直接复用标签台 `NovelAiCharacterComposer`（V4.5 5×5 网格 ≤6 人，
 *    V5 自由拖拽 ≤22 人），按角色编辑正/负提示词与台词。
 * 3. **画面文字**：招牌 / 标题 / 封面 / 其他（最多 4 条）。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ImageIcon, Plus, Sparkles, X } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  NOVELAI_MAX_SCENE_TEXTS,
  NOVELAI_SCENE_TEXT_KINDS,
  getNovelAiCharacterLayoutMode,
  getNovelAiMaxCharacters,
  getNovelAiPreciseReferenceAnlasCost,
  getNovelAiPreciseReferenceContract,
  getNovelAiTextLimit,
  isNovelAiMediumModel,
  novelAiGridCellCenter,
  type NovelAiPreciseReferenceKind,
  type NovelAiSceneTextKind,
} from '@/constants/novelai'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { NovelAiCharacterComposer } from '@/features/studio'
import type { CanvasNovelAiRefEntry } from '@/lib/canvas-novelai'
import { cn } from '@/lib/utils'
import type {
  NodeV4GenerationParams,
  NodeV4NovelAiRefOverride,
  NodeWorkflowModelOption,
} from '@/types/node-workflow'
import type { NovelAiCharacterLayout, NovelAiSceneText } from '@/types/novelai'

import { ChipPopover } from '../chrome/ChipPopover'
import type { ImageRailNovelAiMode } from './ImageRefRail'

export function buildImageRailNovelAiModes(input: {
  readonly modelId: string | undefined
  readonly params: NodeV4GenerationParams | undefined
  readonly entries: readonly CanvasNovelAiRefEntry[]
  readonly onParamsChange: (next: NodeV4GenerationParams) => void
  readonly labels: {
    readonly menuLabel: string
    readonly base: string
    readonly precisePrefix: string
    readonly badgeByKind: Readonly<Record<NovelAiPreciseReferenceKind, string>>
    readonly kindLabel: Readonly<Record<NovelAiPreciseReferenceKind, string>>
  }
}): Readonly<Record<string, ImageRailNovelAiMode>> {
  const preciseContract = getNovelAiPreciseReferenceContract(input.modelId)
  const map: Record<string, ImageRailNovelAiMode> = {}

  const patchOverride = (
    nodeId: string,
    override: NodeV4NovelAiRefOverride,
  ) => {
    input.onParamsChange({
      ...input.params,
      novelAiRefConfig: {
        ...(input.params?.novelAiRefConfig ?? {}),
        [nodeId]: override,
      },
    })
  }

  for (const entry of input.entries) {
    const nodeId = entry.source.nodeId
    const prev = input.params?.novelAiRefConfig?.[nodeId]
    map[nodeId] = {
      mode: entry.mode,
      badgeLabel:
        entry.mode === 'precise'
          ? input.labels.badgeByKind[entry.kind]
          : input.labels.base,
      menuLabel: input.labels.menuLabel,
      baseLabel: input.labels.base,
      onSetBase: () =>
        patchOverride(nodeId, {
          ...prev,
          mode: 'base',
        }),
      preciseKinds: (preciseContract?.kinds ?? []).map((kind) => ({
        kind,
        label: `${input.labels.precisePrefix}${input.labels.kindLabel[kind]}`,
        active: entry.mode === 'precise' && entry.kind === kind,
        onSelect: () =>
          patchOverride(nodeId, {
            ...prev,
            mode: 'precise',
            kind,
            strength: prev?.strength ?? preciseContract?.strength.default ?? 1,
            ...(preciseContract?.fidelity
              ? { fidelity: prev?.fidelity ?? preciseContract.fidelity.default }
              : {}),
            ...(preciseContract?.supportsPreferSameOutfit
              ? { preferSameOutfit: kind === 'character&style' }
              : {}),
          }),
      })),
    }
  }

  return map
}

export interface ImageNovelAiChipProps {
  readonly model:
    | Pick<NodeWorkflowModelOption, 'adapterType' | 'modelId'>
    | undefined
  readonly params: NodeV4GenerationParams | undefined
  readonly refEntries: readonly CanvasNovelAiRefEntry[]
  readonly cardMentionCount: number
  readonly cardPreciseCount: number
  onParamsChange(next: NodeV4GenerationParams): void
  readonly disabled?: boolean
}

const pillClass =
  'nodrag nopan touch-target-y inline-flex h-6 items-center justify-center rounded-md border px-2 text-2xs transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-45'
const pillActiveClass = 'border-foreground bg-foreground text-background'
const pillIdleClass =
  'border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground'

const iconSmallButtonClass =
  'nodrag nopan touch-target inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-45'

function nextDefaultCharacterPosition(
  index: number,
  mode: 'free' | 'grid',
): { readonly x: number; readonly y: number } {
  const columns = [0.3, 0.7, 0.5, 0.1, 0.9]
  const rows = [0.5, 0.3, 0.7]
  const col = index % columns.length
  const row = Math.floor(index / columns.length) % rows.length
  if (mode === 'grid') {
    const gridCols = [1, 3, 2, 0, 4]
    const gridRows = [2, 1, 3]
    return {
      x: novelAiGridCellCenter(gridCols[col] ?? 2),
      y: novelAiGridCellCenter(gridRows[row] ?? 2),
    }
  }
  return { x: columns[col] ?? 0.5, y: rows[row] ?? 0.5 }
}

export function ImageNovelAiChip({
  model,
  params,
  refEntries,
  cardMentionCount,
  cardPreciseCount,
  onParamsChange,
  disabled = false,
}: ImageNovelAiChipProps) {
  const t = useTranslations('StudioNode.v4.image.novelAi')
  const [activeIndex, setActiveIndex] = useState<number | null>(0)

  if (!model || model.adapterType !== AI_ADAPTER_TYPES.NOVELAI) return null

  const preciseContract = getNovelAiPreciseReferenceContract(model.modelId)
  const layoutMode = getNovelAiCharacterLayoutMode(model.modelId)
  const maxCharacters = getNovelAiMaxCharacters(model.modelId)
  const ucLocked = isNovelAiMediumModel(model.modelId)
  const textLimit = getNovelAiTextLimit(model.modelId)

  const layout = params?.novelAiLayout
  const characters = layout?.characters ?? []
  const clampedActive =
    characters.length === 0
      ? null
      : activeIndex !== null && activeIndex < characters.length
        ? activeIndex
        : 0
  const activeCharacter =
    clampedActive !== null ? characters[clampedActive] : undefined
  const sceneTexts = params?.novelAiSceneTexts ?? []

  const activeCharCount = characters.filter(
    (c) => c.enabled !== false && c.prompt.trim().length > 0,
  ).length
  const wiredPreciseCount = refEntries.filter(
    (entry) => entry.mode === 'precise' && entry.activeInRequest,
  ).length
  const totalPreciseCount = wiredPreciseCount + cardPreciseCount
  const anlasCost = getNovelAiPreciseReferenceAnlasCost(totalPreciseCount)
  const activeSceneTextCount = sceneTexts.filter(
    (entry) => entry.text.trim().length > 0,
  ).length
  const hasActivity =
    activeCharCount > 0 ||
    totalPreciseCount > 0 ||
    activeSceneTextCount > 0 ||
    params?.novelAiCardPreciseRef === true

  const summaryParts: string[] = []
  if (activeCharCount > 0) {
    summaryParts.push(t('summaryCharacters', { count: activeCharCount }))
  }
  if (totalPreciseCount > 0) {
    summaryParts.push(t('summaryPrecise', { count: totalPreciseCount }))
  }
  if (activeSceneTextCount > 0) {
    summaryParts.push(t('summaryTexts', { count: activeSceneTextCount }))
  }
  const triggerLabel =
    summaryParts.length > 0 ? summaryParts.join(' · ') : t('trigger')

  const updateRefOverride = (
    nodeId: string,
    patch: Partial<NodeV4NovelAiRefOverride> | null,
  ) => {
    const current = { ...(params?.novelAiRefConfig ?? {}) }
    if (patch === null) {
      delete current[nodeId]
    } else {
      const prev = current[nodeId]
      current[nodeId] = {
        mode: patch.mode ?? prev?.mode ?? 'base',
        ...((patch.kind ?? prev?.kind)
          ? { kind: patch.kind ?? prev?.kind }
          : {}),
        ...(patch.strength !== undefined
          ? { strength: patch.strength }
          : prev?.strength !== undefined
            ? { strength: prev.strength }
            : {}),
        ...(patch.fidelity !== undefined
          ? { fidelity: patch.fidelity }
          : prev?.fidelity !== undefined
            ? { fidelity: prev.fidelity }
            : {}),
        ...(patch.preferSameOutfit !== undefined
          ? { preferSameOutfit: patch.preferSameOutfit }
          : prev?.preferSameOutfit !== undefined
            ? { preferSameOutfit: prev.preferSameOutfit }
            : {}),
      }
    }
    onParamsChange({
      ...params,
      novelAiRefConfig: Object.keys(current).length > 0 ? current : undefined,
    })
  }

  const setLayout = (next: NovelAiCharacterLayout | undefined) => {
    onParamsChange({
      ...params,
      novelAiLayout: next && next.characters.length > 0 ? next : undefined,
    })
  }

  const addCharacter = () => {
    if (!layoutMode || characters.length >= maxCharacters) return
    const nextList = [
      ...characters,
      {
        prompt: '',
        negativePrompt: '',
        position: nextDefaultCharacterPosition(characters.length, layoutMode),
      },
    ]
    setLayout({
      positioning: layout?.positioning ?? 'auto',
      characters: nextList,
    })
    setActiveIndex(nextList.length - 1)
  }

  const updateCharacter = (
    index: number,
    patch: Partial<NovelAiCharacterLayout['characters'][number]>,
  ) => {
    const nextList = characters.map((char, i) =>
      i === index ? { ...char, ...patch } : char,
    )
    setLayout({
      positioning: layout?.positioning ?? 'auto',
      characters: nextList,
    })
  }

  const removeCharacter = (index: number) => {
    const nextList = characters.filter((_, i) => i !== index)
    setLayout(
      nextList.length > 0
        ? {
            positioning: layout?.positioning ?? 'auto',
            characters: nextList,
          }
        : undefined,
    )
    setActiveIndex((prev) => {
      if (nextList.length === 0) return null
      if (prev === null) return 0
      if (prev > index) return prev - 1
      return Math.min(prev, nextList.length - 1)
    })
  }

  const setSceneTexts = (next: readonly NovelAiSceneText[]) => {
    onParamsChange({
      ...params,
      novelAiSceneTexts: next.length > 0 ? [...next] : undefined,
    })
  }

  const addSceneText = () => {
    if (sceneTexts.length >= NOVELAI_MAX_SCENE_TEXTS) return
    setSceneTexts([...sceneTexts, { kind: 'sign', text: '' }])
  }

  const updateSceneText = (
    index: number,
    patch: Partial<{ kind: NovelAiSceneTextKind; text: string }>,
  ) => {
    setSceneTexts(
      sceneTexts.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      ),
    )
  }

  const removeSceneText = (index: number) => {
    setSceneTexts(sceneTexts.filter((_, i) => i !== index))
  }

  return (
    <ChipPopover
      width={380}
      ariaLabel={t('panelLabel')}
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={t('panelLabel')}
          title={triggerLabel}
          data-image-novelai-chip
          data-active={hasActivity ? 'true' : undefined}
          className="nodrag nopan touch-target-y relative inline-flex h-7.5 max-w-52 shrink-0 items-center gap-1.5 rounded-full bg-surface-fill px-2.5 text-2sm text-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-surface-fill-track"
        >
          <Sparkles aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate tabular-nums">{triggerLabel}</span>
          {hasActivity ? (
            <span
              aria-hidden
              data-image-novelai-dot
              className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-foreground"
            />
          ) : null}
        </button>
      }
    >
      <div
        data-image-novelai-panel
        className="flex max-h-112 flex-col gap-4 overflow-y-auto pr-0.5"
      >
        {/* ── 1. 参考轨分流（底图 / 精确参考） ───────────────────────────── */}
        {refEntries.length > 0 || cardMentionCount > 0 || !preciseContract ? (
          <section data-novelai-section="refs" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs font-semibold text-foreground">
                {t('refs.title')}
              </span>
              {anlasCost > 0 ? (
                <span
                  data-novelai-anlas-badge
                  className="rounded-full bg-surface-fill-track px-2 py-0.5 font-mono text-2xs tabular-nums text-foreground"
                >
                  {t('refs.anlasBadge', { amount: anlasCost })}
                </span>
              ) : null}
            </div>

            {!preciseContract ? (
              <p
                data-novelai-precise-unsupported
                className="rounded-lg bg-surface-fill px-2.5 py-2 text-2xs text-muted-foreground"
              >
                {t('refs.unsupportedModel')}
              </p>
            ) : null}

            {refEntries.map((entry) => {
              const showOutfitToggle =
                Boolean(preciseContract?.supportsPreferSameOutfit) &&
                (entry.kind === 'character' || entry.kind === 'character&style')
              return (
                <div
                  key={entry.source.nodeId}
                  data-novelai-ref-item={entry.source.nodeId}
                  data-novelai-ref-mode={entry.mode}
                  className="flex flex-col gap-2 rounded-xl border border-border/70 bg-surface-fill/50 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-fill-track">
                      {entry.source.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.source.url}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageIcon
                          aria-hidden
                          className="size-4 text-muted-foreground"
                        />
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-2sm text-foreground">
                      {entry.source.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        data-novelai-ref-set-mode="base"
                        aria-pressed={entry.mode === 'base'}
                        disabled={disabled}
                        onClick={() =>
                          updateRefOverride(entry.source.nodeId, {
                            mode: 'base',
                          })
                        }
                        className={cn(
                          'touch-target-y',
                          pillClass,
                          entry.mode === 'base'
                            ? pillActiveClass
                            : pillIdleClass,
                        )}
                      >
                        {t('refs.modeBase')}
                      </button>
                      <button
                        type="button"
                        data-novelai-ref-set-mode="precise"
                        aria-pressed={entry.mode === 'precise'}
                        disabled={disabled || !preciseContract}
                        onClick={() =>
                          preciseContract &&
                          updateRefOverride(entry.source.nodeId, {
                            mode: 'precise',
                            kind: entry.kindSupported
                              ? entry.kind
                              : (preciseContract.kinds[0] ?? 'character&style'),
                            strength: entry.strength,
                            ...(entry.fidelity !== undefined
                              ? { fidelity: entry.fidelity }
                              : {}),
                            ...(entry.preferSameOutfit !== undefined
                              ? { preferSameOutfit: entry.preferSameOutfit }
                              : {}),
                          })
                        }
                        className={cn(
                          'touch-target-y',
                          pillClass,
                          entry.mode === 'precise'
                            ? pillActiveClass
                            : pillIdleClass,
                        )}
                      >
                        {t('refs.modePrecise')}
                      </button>
                    </div>
                  </div>

                  {entry.mode === 'base' && !entry.activeInRequest ? (
                    <p className="text-2xs text-muted-foreground">
                      {t('refs.baseOverflowHint')}
                    </p>
                  ) : null}

                  {entry.mode === 'precise' && preciseContract ? (
                    <div className="flex flex-col gap-2 border-t border-border/60 pt-2">
                      <div className="flex flex-wrap gap-1">
                        {preciseContract.kinds.map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            data-novelai-ref-kind={kind}
                            aria-pressed={entry.kind === kind}
                            disabled={disabled}
                            onClick={() =>
                              updateRefOverride(entry.source.nodeId, {
                                mode: 'precise',
                                kind: kind as NovelAiPreciseReferenceKind,
                                ...(preciseContract.supportsPreferSameOutfit
                                  ? {
                                      preferSameOutfit:
                                        kind === 'character&style',
                                    }
                                  : {}),
                              })
                            }
                            className={cn(
                              'touch-target-y',
                              pillClass,
                              entry.kind === kind
                                ? pillActiveClass
                                : pillIdleClass,
                            )}
                          >
                            {t(`refs.kinds.${kind}`)}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-2xs">
                          <span className="text-muted-foreground">
                            {t('refs.strength')}
                          </span>
                          <span className="font-mono tabular-nums text-foreground">
                            {entry.strength.toFixed(2)}
                          </span>
                        </div>
                        <Slider
                          min={preciseContract.strength.min}
                          max={preciseContract.strength.max}
                          step={preciseContract.strength.step}
                          value={[entry.strength]}
                          disabled={disabled}
                          aria-label={t('refs.strength')}
                          onValueChange={([next]) => {
                            if (typeof next !== 'number') return
                            updateRefOverride(entry.source.nodeId, {
                              mode: 'precise',
                              strength: Number(next.toFixed(2)),
                            })
                          }}
                        />
                      </div>

                      {preciseContract.fidelity ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-2xs">
                            <span className="text-muted-foreground">
                              {t('refs.fidelity')}
                            </span>
                            <span className="font-mono tabular-nums text-foreground">
                              {(
                                entry.fidelity ??
                                preciseContract.fidelity.default
                              ).toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            min={preciseContract.fidelity.min}
                            max={preciseContract.fidelity.max}
                            step={preciseContract.fidelity.step}
                            value={[
                              entry.fidelity ??
                                preciseContract.fidelity.default,
                            ]}
                            disabled={disabled}
                            aria-label={t('refs.fidelity')}
                            onValueChange={([next]) => {
                              if (typeof next !== 'number') return
                              updateRefOverride(entry.source.nodeId, {
                                mode: 'precise',
                                fidelity: Number(next.toFixed(2)),
                              })
                            }}
                          />
                        </div>
                      ) : null}

                      {showOutfitToggle ? (
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-2xs text-foreground">
                          <span>{t('refs.preferSameOutfit')}</span>
                          <Switch
                            checked={entry.preferSameOutfit === true}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              updateRefOverride(entry.source.nodeId, {
                                mode: 'precise',
                                preferSameOutfit: checked,
                              })
                            }
                          />
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}

            {cardMentionCount > 0 && preciseContract ? (
              <label
                data-novelai-card-precise-row
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface-fill/50 px-2.5 py-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-2sm text-foreground">
                    {t('refs.cardPreciseToggle')}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {t('refs.cardPreciseHint', { count: cardMentionCount })}
                  </span>
                </div>
                <Switch
                  data-novelai-card-precise-switch
                  checked={params?.novelAiCardPreciseRef === true}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onParamsChange({
                      ...params,
                      novelAiCardPreciseRef: checked ? true : undefined,
                    })
                  }
                />
              </label>
            ) : null}
          </section>
        ) : null}

        {/* ── 2. 多角色构图（复用 NovelAiCharacterComposer） ──────────────── */}
        {layoutMode ? (
          <section
            data-novelai-section="characters"
            className="flex flex-col gap-2 border-t border-border/60 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-2xs font-semibold text-foreground">
                  {t('characters.title')}
                </span>
                <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                  {characters.length}/{maxCharacters}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {characters.length > 0 ? (
                  <button
                    type="button"
                    data-novelai-positioning-toggle
                    disabled={disabled}
                    onClick={() =>
                      setLayout({
                        positioning:
                          layout?.positioning === 'manual' ? 'auto' : 'manual',
                        characters: [...characters],
                      })
                    }
                    className={cn(
                      'touch-target-y',
                      pillClass,
                      layout?.positioning === 'manual'
                        ? pillActiveClass
                        : pillIdleClass,
                    )}
                  >
                    {layout?.positioning === 'manual'
                      ? t('characters.positioningManual')
                      : t('characters.positioningAuto')}
                  </button>
                ) : null}
                <button
                  type="button"
                  data-novelai-add-character
                  disabled={disabled || characters.length >= maxCharacters}
                  onClick={addCharacter}
                  className={cn(
                    'touch-target-y',
                    pillClass,
                    pillIdleClass,
                    'gap-1',
                  )}
                >
                  <Plus aria-hidden className="size-3" />
                  {t('characters.add')}
                </button>
              </div>
            </div>

            {characters.length === 0 ? (
              <p className="text-2xs text-muted-foreground">
                {t('characters.emptyHint', { max: maxCharacters })}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1">
                  {characters.map((char, index) => {
                    const label =
                      char.prompt.split(',')[0]?.trim() ||
                      t('characters.slot', { index: index + 1 })
                    return (
                      <div
                        key={index}
                        className={cn(
                          'inline-flex items-center rounded-md border',
                          clampedActive === index
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background text-foreground',
                        )}
                      >
                        <button
                          type="button"
                          data-novelai-char-tab={index}
                          aria-pressed={clampedActive === index}
                          onClick={() => setActiveIndex(index)}
                          className="nodrag nopan touch-target-y max-w-28 truncate px-2 py-0.5 text-2xs focus-visible:outline-none focus-visible:shadow-focus"
                        >
                          {index + 1}. {label}
                        </button>
                        <button
                          type="button"
                          data-novelai-char-remove={index}
                          aria-label={t('characters.remove', {
                            index: index + 1,
                          })}
                          disabled={disabled}
                          onClick={() => removeCharacter(index)}
                          className="nodrag nopan touch-target inline-flex size-5 items-center justify-center rounded-r-md opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:shadow-focus"
                        >
                          <X aria-hidden className="size-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                <NovelAiCharacterComposer
                  mode={layoutMode}
                  value={layout}
                  activeIndex={clampedActive}
                  disabled={disabled}
                  onChange={setLayout}
                  onSelect={setActiveIndex}
                />

                {activeCharacter && clampedActive !== null ? (
                  <div
                    data-novelai-char-editor={clampedActive}
                    className="flex flex-col gap-2 rounded-xl border border-border/70 bg-surface-fill/40 p-2.5"
                  >
                    <Textarea
                      rows={2}
                      value={activeCharacter.prompt}
                      disabled={disabled}
                      aria-label={t('characters.promptLabel', {
                        index: clampedActive + 1,
                      })}
                      placeholder={t('characters.promptPlaceholder')}
                      className="min-h-13 resize-none text-2sm"
                      onChange={(event) =>
                        updateCharacter(clampedActive, {
                          prompt: event.target.value,
                        })
                      }
                    />
                    {!ucLocked ? (
                      <Textarea
                        rows={2}
                        value={activeCharacter.negativePrompt}
                        disabled={disabled}
                        aria-label={t('characters.negativeLabel', {
                          index: clampedActive + 1,
                        })}
                        placeholder={t('characters.negativePlaceholder')}
                        className="min-h-12 resize-none text-2sm"
                        onChange={(event) =>
                          updateCharacter(clampedActive, {
                            negativePrompt: event.target.value,
                          })
                        }
                      />
                    ) : null}
                    <Input
                      value={activeCharacter.dialogue ?? ''}
                      disabled={disabled}
                      aria-label={t('characters.dialogueLabel', {
                        index: clampedActive + 1,
                      })}
                      placeholder={t('characters.dialoguePlaceholder')}
                      className="h-7 text-2sm"
                      onChange={(event) =>
                        updateCharacter(clampedActive, {
                          dialogue: event.target.value || undefined,
                        })
                      }
                    />
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {/* ── 3. 画面文字（Scene Texts） ─────────────────────────────────── */}
        <section
          data-novelai-section="sceneTexts"
          className="flex flex-col gap-2 border-t border-border/60 pt-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs font-semibold text-foreground">
              {t('sceneText.title')}
            </span>
            <button
              type="button"
              data-novelai-add-scene-text
              disabled={
                disabled || sceneTexts.length >= NOVELAI_MAX_SCENE_TEXTS
              }
              onClick={addSceneText}
              className={cn(
                'touch-target-y',
                pillClass,
                pillIdleClass,
                'gap-1',
              )}
            >
              <Plus aria-hidden className="size-3" />
              {t('sceneText.add')}
            </button>
          </div>

          {sceneTexts.length > 0 ? (
            <div className="flex flex-col gap-2">
              {sceneTexts.map((entry, index) => (
                <div
                  key={index}
                  data-novelai-scene-text-row={index}
                  className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-surface-fill/40 p-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex flex-wrap gap-1">
                      {NOVELAI_SCENE_TEXT_KINDS.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          aria-pressed={entry.kind === kind}
                          disabled={disabled}
                          onClick={() => updateSceneText(index, { kind })}
                          className={cn(
                            'touch-target-y',
                            pillClass,
                            entry.kind === kind
                              ? pillActiveClass
                              : pillIdleClass,
                          )}
                        >
                          {t(`sceneText.kinds.${kind}`)}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-label={t('sceneText.remove')}
                      disabled={disabled}
                      onClick={() => removeSceneText(index)}
                      className={cn('touch-target', iconSmallButtonClass)}
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </div>
                  <Input
                    value={entry.text}
                    disabled={disabled}
                    aria-label={t('sceneText.inputLabel', {
                      index: index + 1,
                    })}
                    placeholder={t('sceneText.placeholder')}
                    className="h-7 text-2sm"
                    onChange={(event) =>
                      updateSceneText(index, { text: event.target.value })
                    }
                  />
                </div>
              ))}
              {textLimit?.latinOnly ? (
                <p className="text-2xs text-muted-foreground">
                  {t('sceneText.latinOnlyHint')}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </ChipPopover>
  )
}
