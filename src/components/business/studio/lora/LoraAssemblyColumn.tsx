'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from 'motion/react'
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
import { DURATION, EASE_STANDARD, LIQUID_SPRING } from '@/constants/motion'
import type { NumericRange } from '@/constants/provider-capabilities'
import { LoraBaseModelModal } from '@/components/business/studio/lora/LoraBaseModelModal'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { isLoraBaseModelMountCompatible } from '@/lib/lora-model-compatibility'
import { cn } from '@/lib/utils'

/** 竖条上挂载数「跳一下」的时长（动效表：240）。 */
const DURATION_BUMP_S = 0.24
/** 权重读数与滑杆走到新值的时长（lora-generate §4「应用这组权重」：240 线性）。 */
const DURATION_WEIGHT_S = 0.24

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
  /**
   * 在库 / 收藏里：整列让开成竖条，竖条顶上那颗键是「回到生成」；点竖条别处，整列
   * 浮在库上面改，点库或 Esc 缩回（lora-library.md §2）。不给 = 在生成台，那颗键与
   * 竖条别处都是「展开装配」。
   */
  onReturn?: () => void
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
  onReturn,
  oftenMounted,
  budget,
}: LoraAssemblyColumnProps) {
  const t = useTranslations('LoraWorkbench')
  const tSetup = useTranslations('QuickSetup')
  const reducedMotion = useReducedMotion()
  const stack = useActiveLoraStack()
  const [baseModalOpen, setBaseModalOpen] = useState(false)
  // 库 / 收藏里浮出来的整列（owner 09-28「浮出整列，默认收起」）：库不重排，整列从
  // 竖条长出来盖在库上面。离开库就收回。
  const inLibrary = onReturn !== undefined
  const [floatOpen, setFloatOpen] = useState(false)
  const [trackedInLibrary, setTrackedInLibrary] = useState(inLibrary)
  if (trackedInLibrary !== inLibrary) {
    setTrackedInLibrary(inLibrary)
    setFloatOpen(false)
  }
  const floating = inLibrary && floatOpen
  const panelOpen = !collapsed || floating
  const panelRef = useRef<HTMLDivElement>(null)
  const collapseButtonRef = useRef<HTMLButtonElement>(null)
  const stripButtonRef = useRef<HTMLButtonElement>(null)
  // 用键盘 / 收起键收回时焦点回到竖条；点库收回时焦点跟着那一下走。
  const returnFocusRef = useRef(false)
  const closeFloat = (returnFocus: boolean) => {
    returnFocusRef.current = returnFocus
    setFloatOpen(false)
  }

  useEffect(() => {
    if (floating) {
      collapseButtonRef.current?.focus({ preventScroll: true })
      return
    }
    if (returnFocusRef.current) {
      returnFocusRef.current = false
      stripButtonRef.current?.focus({ preventScroll: true })
    }
  }, [floating])

  // 点库 / 焦点移到库（整列以外、不在弹层里）或 Esc 缩回。⚠ Esc 抢在详情页前面：
  // 第一下只收整列。
  useEffect(() => {
    if (!floating) return
    const onOutside = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (panelRef.current?.contains(target)) return
      // 换底模 / 添加 LoRA 是从这一列开出去的弹层，点在里面不算点库。
      if (target.closest('[role="dialog"]')) return
      returnFocusRef.current = false
      setFloatOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      returnFocusRef.current = true
      setFloatOpen(false)
    }
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('focusin', onOutside, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onOutside, true)
      document.removeEventListener('focusin', onOutside, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [floating])
  // 拖动排序：只从封面起手（按下封面才把这一行设成可拖），滑杆和开关不会误触发。
  const [armedId, setArmedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  // 竖条上「刚挂上」的那一个：只认这一列在场之后才发生的挂载（`push` 才写挂载事件，
  // 刷新读回挂载栈不算），⛔ 刷新页面时小封面不该自己弹一遍。
  const [seenMountAt] = useState(() => stack.mountEvent?.at ?? 0)
  const freshMount =
    stack.mountEvent && stack.mountEvent.at > seenMountAt
      ? stack.mountEvent
      : null
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
      aria-hidden={!panelOpen}
      inert={!panelOpen}
      data-testid="lora-assembly-column"
      style={{ width: LORA_ASSEMBLY_COLUMN_PX.open }}
      className={cn(
        'absolute inset-y-0 left-0 flex flex-col gap-2.5 overflow-y-auto py-5 pl-5 pr-4.5 transition-opacity ease-linear',
        panelOpen
          ? 'opacity-100 delay-200 duration-base motion-reduce:delay-0 motion-reduce:duration-fast'
          : 'pointer-events-none opacity-0 duration-fast',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground/80">
        <span>{t('spine.baseModel')}</span>
        <button
          ref={collapseButtonRef}
          type="button"
          onClick={() =>
            floating ? closeFloat(true) : onCollapsedChange(true)
          }
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
                title={t('spine.executorRunner')}
              >
                {familyName(selectedBase.family)} ·{' '}
                {t('baseModal.channelRunner')}
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
            const compatible = compatibleWithBase(item.asset.baseModelFamily)
            return (
              <LoraAssemblyRow
                key={id}
                name={item.asset.name}
                scale={item.scale ?? item.asset.defaultScale}
                enabled={item.enabled !== false}
                compatible={compatible}
                familyLabel={familyName(item.asset.baseModelFamily)}
                cover={loraCover(item.asset.coverImageUrl, 'size-7.5')}
                loraScaleConfig={loraScaleConfig}
                armed={armedId === id}
                dragging={dragId === id}
                over={overId === id && dragId !== id}
                onArm={() => setArmedId(id)}
                onDisarm={() =>
                  setArmedId((current) => (current === id ? null : current))
                }
                onDragStart={() => setDragId(id)}
                onDragOver={() => {
                  if (!dragId || dragId === id) return false
                  if (overId !== id) setOverId(id)
                  return true
                }}
                onDrop={() => {
                  if (dragId && dragId !== id) stack.reorder(dragId, id)
                  endDrag()
                }}
                onDragEnd={endDrag}
                onEnabledChange={(value) => stack.setEnabled(id, value)}
                onScaleChange={(value) => stack.setScale(id, value)}
                onRemove={() => stack.remove(id)}
              />
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
      aria-hidden={panelOpen}
      inert={panelOpen}
      style={{ width: LORA_ASSEMBLY_COLUMN_PX.strip }}
      className={cn(
        'absolute inset-y-0 left-0 flex flex-col items-center gap-3 overflow-y-auto py-3 transition-opacity ease-linear',
        panelOpen
          ? 'pointer-events-none opacity-0 duration-fast'
          : 'opacity-100 delay-200 duration-base motion-reduce:delay-0 motion-reduce:duration-fast',
      )}
    >
      <button
        type="button"
        onClick={() => (onReturn ? onReturn() : onCollapsedChange(false))}
        aria-label={
          onReturn ? t('spine.returnToGenerate') : t('spine.expandAssembly')
        }
        title={
          onReturn ? t('spine.returnToGenerate') : t('spine.expandAssembly')
        }
        className="grid size-7.5 shrink-0 place-items-center rounded-lg text-foreground/70 transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PanelLeftOpen className="size-3.5" aria-hidden />
      </button>
      {/* 竖条其余整块是一颗键：在库里浮出整列改，在生成台展开整列（owner 09-28）。 */}
      <button
        ref={stripButtonRef}
        type="button"
        onClick={() =>
          inLibrary ? setFloatOpen(true) : onCollapsedChange(false)
        }
        aria-label={t('spine.editAssembly')}
        aria-expanded={inLibrary ? floating : undefined}
        className="flex w-10 flex-1 flex-col items-center gap-3 rounded-xl py-1.5 transition-colors duration-fast ease-linear hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          title={selectedBase ? baseName(selectedBase) : undefined}
          className="shrink-0"
        >
          {baseCover('size-7')}
        </span>
        {/* 挂了几个：在库里点「挂载」时数字跳一下（240）。 */}
        <motion.span
          key={freshMount?.at ?? 'rest'}
          initial={false}
          animate={
            freshMount && !reducedMotion ? { scale: [1, 1.18, 1] } : undefined
          }
          transition={{
            duration: DURATION_BUMP_S,
            times: [0, 0.4, 1],
            ease: EASE_STANDARD,
          }}
          title={t('spine.stripMounted', { count: stack.items.length })}
          className="h-5.5 min-w-5.5 shrink-0 rounded-full bg-muted px-1.5 text-center font-mono text-2xs font-semibold leading-5.5 tabular-nums text-foreground"
        >
          {stack.items.length}
        </motion.span>
        <AnimatePresence initial={false}>
          {stack.items.map((item) => (
            // 在库里刚挂上的那一个从 0.6 弹到 1（320）；卸下的缩回去淡掉（120）。
            // ⚠ 只有 `freshMount` 那一个演入场 —— 挂载栈在首帧之后才从本地读回，
            // 读回的那几个在这里也是「新来的」，⛔ 让它们跟着弹。
            <motion.span
              key={item.asset.id}
              layout={!reducedMotion}
              initial={
                item.asset.id !== freshMount?.assetId
                  ? false
                  : reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.6 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={
                reducedMotion
                  ? { opacity: 0, transition: { duration: DURATION.fast } }
                  : {
                      opacity: 0,
                      scale: 0.6,
                      transition: { duration: DURATION.fast },
                    }
              }
              transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
              title={item.asset.name}
              className="relative shrink-0"
            >
              <span
                className={cn(
                  'block transition-opacity duration-fast',
                  item.enabled === false && 'opacity-45',
                )}
              >
                {loraCover(item.asset.coverImageUrl, 'size-7')}
              </span>
              {compatibleWithBase(item.asset.baseModelFamily) === false ? (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 size-1.75 rounded-full bg-status-warning ring-2 ring-card"
                />
              ) : null}
            </motion.span>
          ))}
        </AnimatePresence>
      </button>
    </aside>
  )

  return (
    <>
      {/* 外框占的宽（生成台收放时推开舞台）与里面这一块的宽分开：库里浮出整列时
          外框仍是竖条宽，整列盖在库上面，⛔ 推开库重排。 */}
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
        className="relative z-30 shrink-0"
      >
        <motion.div
          ref={panelRef}
          initial={false}
          animate={{
            width: panelOpen
              ? LORA_ASSEMBLY_COLUMN_PX.open
              : LORA_ASSEMBLY_COLUMN_PX.strip,
          }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : panelOpen
                ? LIQUID_SPRING.unfold
                : LIQUID_SPRING.retract
          }
          className={cn(
            'absolute inset-y-0 left-0 overflow-hidden border-r border-border/70 bg-card transition-shadow duration-base ease-linear',
            floating && 'shadow-float',
          )}
        >
          {full}
          {strip}
        </motion.div>
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

interface LoraAssemblyRowProps {
  name: string
  scale: number
  enabled: boolean
  /** `null` = 底模未定，不画兼容点。 */
  compatible: boolean | null
  familyLabel: string
  cover: ReactNode
  loraScaleConfig: NumericRange | undefined
  armed: boolean
  dragging: boolean
  over: boolean
  onArm(): void
  onDisarm(): void
  onDragStart(): void
  /** 返回 true = 这一行接得住拖过来的那把（要 `preventDefault`）。 */
  onDragOver(): boolean
  onDrop(): void
  onDragEnd(): void
  onEnabledChange(enabled: boolean): void
  onScaleChange(scale: number): void
  onRemove(): void
}

/**
 * 装配列的一行（lora-generate.md §2.1）：封面 · 名字 · 兼容点 · 权重数 · 启停，下面
 * 一条权重滑杆。
 *
 * ⭐ 权重的读数与滑杆**不是你手上拖的变化**（助手搭配卡「应用」、这一轮撤销）240
 *   线性走到新值（§4 动效表「应用这组权重」）；拖滑杆时读数跟手，⛔ 追着手慢 240。
 *   减少动态效果时直接到终值。
 */
function LoraAssemblyRow({
  name,
  scale,
  enabled,
  compatible,
  familyLabel,
  cover,
  loraScaleConfig,
  armed,
  dragging,
  over,
  onArm,
  onDisarm,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onEnabledChange,
  onScaleChange,
  onRemove,
}: LoraAssemblyRowProps) {
  const t = useTranslations('LoraWorkbench')
  const reducedMotion = useReducedMotion()
  const bad = compatible === false
  const shown = useMotionValue(scale)
  const [display, setDisplay] = useState(scale)
  const [sliding, setSliding] = useState(false)
  useMotionValueEvent(shown, 'change', setDisplay)
  useEffect(() => {
    if (sliding || reducedMotion) {
      shown.jump(scale)
      return
    }
    const controls = animate(shown, scale, {
      duration: DURATION_WEIGHT_S,
      ease: 'linear',
    })
    return () => controls.stop()
  }, [reducedMotion, scale, shown, sliding])

  return (
    <li
      draggable={armed}
      onDragStart={(event) => {
        onDragStart()
        event.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(event) => {
        if (onDragOver()) event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative flex flex-col gap-1.75 rounded-xl p-2 transition-[background-color,box-shadow,opacity] duration-fast',
        bad
          ? 'bg-status-warning-surface ring-1 ring-inset ring-status-warning/25'
          : 'bg-muted/60',
        dragging && 'opacity-50',
        over && 'ring-1 ring-foreground/40',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          title={t('spine.dragReorder')}
          onPointerDown={onArm}
          onPointerUp={onDisarm}
          className={cn(
            'cursor-grab transition-opacity duration-fast active:cursor-grabbing',
            !enabled && 'opacity-45',
          )}
        >
          {cover}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-xs font-semibold text-foreground transition-opacity duration-fast',
            !enabled && 'opacity-45',
          )}
          title={name}
        >
          {name}
        </span>
        {compatible !== null ? (
          <span
            role="img"
            aria-label={
              bad ? t('spine.compatDotWarning') : t('spine.compatDotOk')
            }
            title={bad ? t('spine.compatDotWarning') : t('spine.compatDotOk')}
            className={cn(
              'size-1.75 shrink-0 rounded-full',
              bad ? 'bg-status-warning' : 'bg-status-applied/60',
            )}
          />
        ) : null}
        <span className="min-w-8 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
          {loraScaleConfig ? display.toFixed(2) : `×${display.toFixed(2)}`}
        </span>
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-label={t(enabled ? 'spine.disableLora' : 'spine.enableLora', {
            name,
          })}
        />
      </div>
      {loraScaleConfig ? (
        <Slider
          aria-label={t('spine.weightBarLabel', { name })}
          min={loraScaleConfig.min}
          max={loraScaleConfig.max}
          step={loraScaleConfig.step}
          value={[display]}
          onPointerDown={() => setSliding(true)}
          onValueChange={([value]) => {
            if (value !== undefined) onScaleChange(value)
          }}
          onValueCommit={() => setSliding(false)}
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
          {t('spine.incompatibleLine', { family: familyLabel })}
        </span>
      ) : null}
      {/* 卸下是次要动作：悬停 / 键盘进到这一行才出现；触屏常显。 */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('spine.removeLora', { name })}
        className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity duration-fast hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-focus-within:opacity-100 coarse:opacity-100"
      >
        <X className="size-3" aria-hidden />
      </button>
    </li>
  )
}
