'use client'

import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  ArrowLeftRight,
  Boxes,
  ImageIcon,
  Key,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
} from '@/components/icons'
import { LORA_ASSEMBLY_COLUMN_PX } from '@/constants/lora'
import type { LoraBaseModel } from '@/constants/lora-base-models'
import { LIQUID_SPRING } from '@/constants/motion'
import type { NumericRange } from '@/constants/provider-capabilities'
import { LoraBaseModelModal } from '@/components/business/studio/lora/LoraBaseModelModal'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { isLoraBaseModelMountCompatible } from '@/lib/lora-model-compatibility'
import { cn } from '@/lib/utils'

/** 家族 slug → `LoraWorkbench.familyLabel.*`；表外的原样显示。 */
const FAMILY_LABEL_KEYS: Record<string, string> = {
  illustrious: 'illustrious',
  flux: 'flux',
  sdxl: 'sdxl',
  pony: 'pony',
  sd15: 'sd15',
  anima: 'anima',
  'anima-dit': 'anima',
  krea2: 'krea2',
  qwen: 'qwen',
  'z-image': 'zImage',
  chroma: 'chroma',
}

interface LoraAssemblyColumnProps {
  compatibleBases: LoraBaseModel[]
  selectedBase: LoraBaseModel | null
  onSelectBase: (id: string) => void
  /** 选中底模缺可用 key：卡下一颗琥珀「需要 API key」，点它走 QuickSetupDialog。 */
  needsKeySetup: boolean
  onRequestKeySetup: () => void
  /** 底模给的权重值域；不给时行里只写 `×1.00`、没有滑杆。 */
  loraScaleConfig: NumericRange | undefined
  onAddLora: () => void
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  /** 「常与它同挂」那一排 chip（数据不足时它自己不渲染）。 */
  oftenMounted?: ReactNode
  /** 列底 Runner 次数；不是 Runner 底模时不给。 */
  budget?: ReactNode
}

/**
 * 生成台 B 的装配列（lora-generate.md §2.1）：舞台左边 272，收起成 48 的竖条。
 *
 * ⭐ 一个容器换宽度（与助手让位同一根弹簧），两块内容叠在里面交叉淡：整列始终
 *   按 272 排版，收起时只是外框变窄 —— ⛔ 列里的字不跟着被挤成两行。
 * ⚠ 收起的那一块挂 `inert`：看不见的按钮不能还在 Tab 序里。
 * ⚠ 挂载栈自取（与手机装配抽屉里的 `LoraSpineBar` 同一份 `useActiveLoraStack`），
 *   底模这些 GenerateBranch 的局部 state 由它传进来。
 * ⚠ 触发词写在输入框的正文里、参考图挂在输入框上（owner 09-28），⛔ 不回到这一列。
 */
export function LoraAssemblyColumn({
  compatibleBases,
  selectedBase,
  onSelectBase,
  needsKeySetup,
  onRequestKeySetup,
  loraScaleConfig,
  onAddLora,
  collapsed,
  onCollapsedChange,
  oftenMounted,
  budget,
}: LoraAssemblyColumnProps) {
  const t = useTranslations('LoraWorkbench')
  const tSetup = useTranslations('QuickSetup')
  const reducedMotion = useReducedMotion()
  const stack = useActiveLoraStack()
  const [baseModalOpen, setBaseModalOpen] = useState(false)
  // 拖动排序：只从封面起手（按下封面才把这一行设成可拖），滑杆和开关不会误触发。
  const [armedId, setArmedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const endDrag = () => {
    setArmedId(null)
    setDragId(null)
    setOverId(null)
  }

  const baseName = (base: LoraBaseModel) =>
    base.translationKey ? t(`spine.${base.translationKey}`) : base.displayName
  const familyName = (family: string | null | undefined) => {
    if (!family) return ''
    const key = FAMILY_LABEL_KEYS[family]
    return key ? t(`familyLabel.${key}`) : family
  }
  const compatibleWithBase = (family: string | null | undefined) =>
    selectedBase
      ? isLoraBaseModelMountCompatible(family ?? '', selectedBase.family)
      : null

  const baseCover = (sizeClass: string) =>
    selectedBase ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={selectedBase.coverImage}
        alt=""
        className={cn(
          sizeClass,
          'shrink-0 rounded-lg bg-muted',
          selectedBase.coverImage.endsWith('.svg')
            ? 'object-contain p-1.5'
            : 'object-cover',
        )}
      />
    ) : (
      <span
        aria-hidden
        className={cn(
          sizeClass,
          'grid shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground',
        )}
      >
        <Boxes className="size-4" />
      </span>
    )

  const loraCover = (url: string | null | undefined, sizeClass: string) =>
    url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyCivitaiImageUrl(url)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn(sizeClass, 'shrink-0 rounded-md bg-muted object-cover')}
      />
    ) : (
      <span
        aria-hidden
        className={cn(
          sizeClass,
          'grid shrink-0 place-items-center rounded-md bg-muted text-muted-foreground',
        )}
      >
        <ImageIcon className="size-3.5" />
      </span>
    )

  const sectionLabel = (
    label: string,
    aside?: ReactNode,
    assistantField?: string,
  ) => (
    <div
      data-assistant-field={assistantField}
      className="mt-1 flex items-center justify-between gap-2 text-xs font-semibold text-foreground/80"
    >
      <span>{label}</span>
      {aside}
    </div>
  )

  const full = (
    <aside
      aria-label={t('spine.assemblyTitle')}
      aria-hidden={collapsed}
      inert={collapsed}
      data-testid="lora-assembly-column"
      style={{ width: LORA_ASSEMBLY_COLUMN_PX.open }}
      className={cn(
        'absolute inset-y-0 left-0 flex flex-col gap-2.5 overflow-y-auto py-5 pl-5 pr-4.5 transition-opacity ease-linear',
        collapsed
          ? 'pointer-events-none opacity-0 duration-fast'
          : 'opacity-100 delay-200 duration-base motion-reduce:delay-0 motion-reduce:duration-fast',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground/80">
        <span>{t('spine.baseModel')}</span>
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          aria-label={t('spine.collapseAssembly')}
          title={t('spine.collapseAssembly')}
          className="-my-1 -mr-1 grid size-6 place-items-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelLeftClose className="size-3.5" aria-hidden />
        </button>
      </div>

      {compatibleBases.length > 0 ? (
        <button
          type="button"
          onClick={() => setBaseModalOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-border p-2 text-left transition-colors duration-fast hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {baseCover('size-10')}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-foreground">
              {selectedBase
                ? baseName(selectedBase)
                : t('spine.baseModelPending')}
            </span>
            {selectedBase ? (
              <span
                className="mt-px block truncate text-2xs text-muted-foreground"
                title={
                  selectedBase.backend === 'runner'
                    ? t('spine.executorRunner')
                    : t('spine.executorCloud')
                }
              >
                {familyName(selectedBase.family)} ·{' '}
                {selectedBase.backend === 'runner'
                  ? t('baseModal.channelRunner')
                  : t('spine.executorCloud')}
              </span>
            ) : null}
          </span>
          <span
            aria-hidden
            title={t('spine.swapBase')}
            className="grid size-7 shrink-0 place-items-center rounded-md text-foreground/70"
          >
            <ArrowLeftRight className="size-3.5" />
          </span>
          <span className="sr-only">{t('spine.swapBase')}</span>
        </button>
      ) : (
        <span className="rounded-xl border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
          {t('spine.baseModelPending')}
        </span>
      )}
      {needsKeySetup ? (
        <button
          type="button"
          onClick={onRequestKeySetup}
          className="inline-flex items-center gap-1 self-start rounded-full border border-status-warning/40 bg-status-warning-surface px-2 py-1 text-2xs font-medium text-status-warning transition-colors hover:bg-status-warning-surface"
        >
          <Key className="size-3" aria-hidden />
          {tSetup('needsKey')}
        </button>
      ) : null}

      {/* 助手挂 / 摘 / 调权重时这一行闪一次 —— 与登记簿的 `loras` 那一格同源。 */}
      {sectionLabel(
        t('spine.loraLabel'),
        <span className="font-normal text-muted-foreground">
          {t('spine.mountedCount', { count: stack.items.length })}
        </span>,
        'loras',
      )}
      {stack.items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {stack.items.map((item) => {
            const id = item.asset.id
            const enabled = item.enabled !== false
            const compatible = compatibleWithBase(item.asset.baseModelFamily)
            const bad = compatible === false
            const scale = item.scale ?? item.asset.defaultScale
            return (
              <li
                key={id}
                draggable={armedId === id}
                onDragStart={(event) => {
                  setDragId(id)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  if (dragId && dragId !== id) {
                    event.preventDefault()
                    if (overId !== id) setOverId(id)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragId && dragId !== id) stack.reorder(dragId, id)
                  endDrag()
                }}
                onDragEnd={endDrag}
                className={cn(
                  'group relative flex flex-col gap-1.75 rounded-xl p-2 transition-[background-color,box-shadow,opacity] duration-fast',
                  bad
                    ? 'bg-status-warning-surface ring-1 ring-inset ring-status-warning/25'
                    : 'bg-muted/60',
                  dragId === id && 'opacity-50',
                  overId === id && dragId !== id && 'ring-1 ring-foreground/40',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    title={t('spine.dragReorder')}
                    onPointerDown={() => setArmedId(id)}
                    onPointerUp={() =>
                      setArmedId((current) => (current === id ? null : current))
                    }
                    className={cn(
                      'cursor-grab transition-opacity duration-fast active:cursor-grabbing',
                      !enabled && 'opacity-45',
                    )}
                  >
                    {loraCover(item.asset.coverImageUrl, 'size-7.5')}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-xs font-semibold text-foreground transition-opacity duration-fast',
                      !enabled && 'opacity-45',
                    )}
                    title={item.asset.name}
                  >
                    {item.asset.name}
                  </span>
                  {compatible !== null ? (
                    <span
                      role="img"
                      aria-label={
                        bad
                          ? t('spine.compatDotWarning')
                          : t('spine.compatDotOk')
                      }
                      title={
                        bad
                          ? t('spine.compatDotWarning')
                          : t('spine.compatDotOk')
                      }
                      className={cn(
                        'size-1.75 shrink-0 rounded-full',
                        bad ? 'bg-status-warning' : 'bg-status-applied/60',
                      )}
                    />
                  ) : null}
                  <span className="min-w-8 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                    {loraScaleConfig
                      ? scale.toFixed(2)
                      : `×${scale.toFixed(2)}`}
                  </span>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(value) => stack.setEnabled(id, value)}
                    aria-label={t(
                      enabled ? 'spine.disableLora' : 'spine.enableLora',
                      { name: item.asset.name },
                    )}
                  />
                </div>
                {loraScaleConfig ? (
                  <Slider
                    aria-label={t('spine.weightBarLabel', {
                      name: item.asset.name,
                    })}
                    min={loraScaleConfig.min}
                    max={loraScaleConfig.max}
                    step={loraScaleConfig.step}
                    value={[scale]}
                    onValueChange={([value]) => stack.setScale(id, value)}
                    disabled={!enabled}
                    trackClassName="data-[orientation=horizontal]:h-1 bg-surface-fill-track"
                    rangeClassName={bad ? 'bg-muted-foreground/40' : undefined}
                    thumbClassName="size-3.5 border-0 bg-background shadow-sm ring-1 ring-foreground/20"
                  />
                ) : null}
                {bad ? (
                  <span className="flex items-center gap-1.5 text-2xs leading-4 text-status-warning">
                    <span
                      aria-hidden
                      className="size-1.75 shrink-0 rounded-full bg-status-warning"
                    />
                    {t('spine.incompatibleLine', {
                      family: familyName(item.asset.baseModelFamily),
                    })}
                  </span>
                ) : null}
                {/* 卸下是次要动作：悬停 / 键盘进到这一行才出现；触屏常显。 */}
                <button
                  type="button"
                  onClick={() => stack.remove(id)}
                  aria-label={t('spine.removeLora', { name: item.asset.name })}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity duration-fast hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-focus-within:opacity-100 coarse:opacity-100"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-0.5 text-xs text-muted-foreground">
          {t('spine.empty')}
        </p>
      )}

      <button
        type="button"
        onClick={onAddLora}
        className="flex h-8.5 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-foreground/20 text-xs text-muted-foreground transition-colors duration-fast hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-3.5" aria-hidden />
        {t('spine.addLoraFull')}
      </button>

      {oftenMounted}

      {budget ? <div className="mt-auto pt-2">{budget}</div> : null}
    </aside>
  )

  const strip = (
    <aside
      aria-label={t('spine.stripLabel')}
      aria-hidden={!collapsed}
      inert={!collapsed}
      style={{ width: LORA_ASSEMBLY_COLUMN_PX.strip }}
      className={cn(
        'absolute inset-y-0 left-0 flex flex-col items-center gap-3 overflow-y-auto py-3 transition-opacity ease-linear',
        collapsed
          ? 'opacity-100 delay-200 duration-base motion-reduce:delay-0 motion-reduce:duration-fast'
          : 'pointer-events-none opacity-0 duration-fast',
      )}
    >
      <button
        type="button"
        onClick={() => onCollapsedChange(false)}
        aria-label={t('spine.expandAssembly')}
        title={t('spine.expandAssembly')}
        className="grid size-7.5 shrink-0 place-items-center rounded-lg text-foreground/70 transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PanelLeftOpen className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setBaseModalOpen(true)}
        aria-label={
          selectedBase ? baseName(selectedBase) : t('spine.baseModelPending')
        }
        title={selectedBase ? baseName(selectedBase) : undefined}
        className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {baseCover('size-7')}
      </button>
      <span
        title={t('spine.stripMounted', { count: stack.items.length })}
        className="h-5.5 min-w-5.5 shrink-0 rounded-full bg-muted px-1.5 text-center font-mono text-2xs font-semibold leading-5.5 tabular-nums text-foreground"
      >
        {stack.items.length}
      </span>
      {stack.items.map((item) => (
        <span
          key={item.asset.id}
          title={item.asset.name}
          className={cn(
            'relative shrink-0 transition-opacity duration-fast',
            item.enabled === false && 'opacity-45',
          )}
        >
          {loraCover(item.asset.coverImageUrl, 'size-7')}
          {compatibleWithBase(item.asset.baseModelFamily) === false ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-1.75 rounded-full bg-status-warning ring-2 ring-card"
            />
          ) : null}
        </span>
      ))}
    </aside>
  )

  return (
    <>
      <motion.div
        initial={false}
        animate={{
          width: collapsed
            ? LORA_ASSEMBLY_COLUMN_PX.strip
            : LORA_ASSEMBLY_COLUMN_PX.open,
        }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : collapsed
              ? LIQUID_SPRING.retract
              : LIQUID_SPRING.unfold
        }
        className="relative shrink-0 overflow-hidden border-r border-border/70"
      >
        {full}
        {strip}
      </motion.div>
      <LoraBaseModelModal
        open={baseModalOpen}
        onOpenChange={setBaseModalOpen}
        compatibleBases={compatibleBases}
        selectedBaseId={selectedBase?.id}
        onSelect={onSelectBase}
        hasMountedLora={stack.items.length > 0}
      />
    </>
  )
}
