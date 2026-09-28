'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { DURATION, EASE_STANDARD } from '@/constants/motion'
import {
  LORA_BASE_MODELS,
  LORA_BASE_ONLY_DEFAULT_ID,
  getLoraBaseArchitectureGroup,
  type LoraBaseArchitectureGroup,
  type LoraBaseFamily,
  type LoraBaseModel,
} from '@/constants/lora-base-models'
import { Check, X } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Switch } from '@/components/ui/switch'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

interface LoraBaseModelModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 兼容当前挂载的底模子集（无挂载时 = baseOnlyBases，不含「来源图底模（自动）」）。 */
  compatibleBases: readonly LoraBaseModel[]
  selectedBaseId: string | undefined
  onSelect: (id: string) => void
  /** 有挂载 LoRA 才有家族约束，「只看兼容的」开关才有意义。 */
  hasMountedLora: boolean
}

/** 卡上第二行写家族；SDXL 系的 'anima' 是 Anima Pencil，别和 DiT 的 Anima 撞名。 */
const BASE_FAMILY_LABEL_KEYS: Record<LoraBaseFamily, string> = {
  illustrious: 'illustrious',
  sdxl: 'sdxl',
  pony: 'pony',
  anima: 'animaPencil',
  'anima-dit': 'anima',
  flux: 'flux',
  sd15: 'sd15',
}

const GROUP_ORDER: readonly LoraBaseArchitectureGroup[] = ['sdxl', 'dit']

// 换底模弹层（45 Runner 底模 · ④ 画板，owner 2026-09-28）：底模卡唤起，按架构分
// SDXL 系 / DiT 系两组。每卡 = 封面 + 名字 + 家族一行 + 推荐 / 快出 chip + 选中勾；
// 挂了 LoRA 时默认只看兼容的，关掉开关看全部、装不上的写明。09-17 退役的云端卡与
// 「忠实 / 快」的说法全部去掉——界面不暗示有另一条更快的通道。
export function LoraBaseModelModal({
  open,
  onOpenChange,
  compatibleBases,
  selectedBaseId,
  onSelect,
  hasMountedLora,
}: LoraBaseModelModalProps) {
  const t = useTranslations('LoraWorkbench')
  const isMobile = useIsMobile()
  const reduceMotion = useReducedMotion()
  const [onlyCompatible, setOnlyCompatible] = useState(true)

  const compatibleIds = useMemo(
    () => new Set(compatibleBases.map((b) => b.id)),
    [compatibleBases],
  )
  // 没挂 LoRA：列纯底模能出图的那一份（不含靠来源图配方的「自动」）。挂了：开关开 =
  // 兼容子集，关 = 全部。
  const showAll = hasMountedLora && !onlyCompatible
  const bases = showAll ? LORA_BASE_MODELS : compatibleBases

  const selectedGroup = bases.find((b) => b.id === selectedBaseId)
  // 手机一列排下来，当前选中那组放前面，不用往下翻才看到自己选的。
  const groupOrder =
    isMobile && selectedGroup
      ? [
          getLoraBaseArchitectureGroup(selectedGroup.family),
          ...GROUP_ORDER.filter(
            (group) =>
              group !== getLoraBaseArchitectureGroup(selectedGroup.family),
          ),
        ]
      : GROUP_ORDER
  const groups = groupOrder
    .map((group) => ({
      group,
      list: bases.filter(
        (b) => getLoraBaseArchitectureGroup(b.family) === group,
      ),
    }))
    .filter(({ list }) => list.length > 0)

  // 弹层高度跟着卡片数变（开关开 / 关）：量内容高度，外层把高度补间过去。
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null)
  const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto')
  useEffect(() => {
    if (!contentNode) return
    // 量 border-box：contentRect 不含内边距，按它补间会把最后一行的下边距裁掉。
    const observer = new ResizeObserver(([entry]) =>
      setContentHeight(
        entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height,
      ),
    )
    observer.observe(contentNode)
    return () => observer.disconnect()
  }, [contentNode])

  const moveTransition = reduceMotion
    ? { duration: DURATION.fast, ease: 'linear' as const }
    : { duration: DURATION.base, ease: EASE_STANDARD }

  const baseName = (b: LoraBaseModel) =>
    b.translationKey ? t(`spine.${b.translationKey}`) : b.displayName
  // 纯底模时「自动」不在列，推荐落到纯底模默认那一档；挂了 LoRA 按家族推荐。
  const isRecommended = (b: LoraBaseModel) =>
    b.recommended === true ||
    (!hasMountedLora && b.id === LORA_BASE_ONLY_DEFAULT_ID)

  const handlePick = (b: LoraBaseModel) => {
    if (!b.available) return
    onSelect(b.id)
    onOpenChange(false)
  }

  const renderCard = (b: LoraBaseModel) => {
    const selected = b.id === selectedBaseId
    const incompatible = showAll && !compatibleIds.has(b.id)
    return (
      <motion.button
        key={b.id}
        layout={reduceMotion ? false : 'position'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: moveTransition }}
        exit={{
          opacity: 0,
          transition: { duration: DURATION.fast, ease: 'linear' },
        }}
        transition={moveTransition}
        type="button"
        onClick={() => handlePick(b)}
        disabled={!b.available}
        aria-pressed={selected}
        className={cn(
          'flex min-h-22 overflow-hidden rounded-xl border p-0 text-left',
          'transition-[background-color,border-color,box-shadow] duration-fast ease-linear',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          selected
            ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
            : 'border-border/60 bg-card hover:border-border',
          !b.available && 'cursor-not-allowed opacity-55',
        )}
      >
        <span className="flex w-16 shrink-0 items-stretch overflow-hidden border-r border-border/50 bg-muted/40">
          <Image
            src={b.coverImage}
            alt=""
            width={96}
            height={120}
            sizes="64px"
            className="h-full min-h-22 w-full object-cover"
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2.5">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-foreground">
              {baseName(b)}
            </span>
            <Check
              aria-hidden
              className={cn(
                'size-3.5 shrink-0 text-primary transition-opacity duration-fast ease-linear',
                selected ? 'opacity-100' : 'opacity-0',
              )}
            />
          </span>
          <span className="text-2xs text-muted-foreground">
            {t(`familyLabel.${BASE_FAMILY_LABEL_KEYS[b.family]}`)}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-1">
            {isRecommended(b) ? (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-3xs font-medium text-foreground">
                {t('baseModal.recommended')}
              </span>
            ) : null}
            {b.distilled ? (
              <span className="rounded-full border border-border/60 px-1.5 py-px text-3xs font-medium text-muted-foreground">
                {t('baseModal.fast')}
              </span>
            ) : null}
            {!b.available ? (
              <span className="text-3xs text-muted-foreground/70">
                {t('spine.comingSoon')}
              </span>
            ) : incompatible ? (
              <span className="text-3xs text-status-warning">
                {t('baseModal.incompatible')}
              </span>
            ) : null}
          </span>
        </span>
      </motion.button>
    )
  }

  const body = (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-foreground">
            {t('baseModal.title')}
          </span>
          <span className="text-2xs text-muted-foreground">
            {hasMountedLora
              ? t('baseModal.subtitleConstrained')
              : t('baseModal.subtitleFree')}
          </span>
        </div>
        {hasMountedLora ? (
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              size="sm"
              checked={onlyCompatible}
              onCheckedChange={setOnlyCompatible}
              aria-label={t('baseModal.onlyCompatible')}
            />
            {t('baseModal.onlyCompatible')}
          </label>
        ) : null}
        {/* 自己排一颗关闭键：Dialog 自带那颗是绝对定位，会压在开关的字上。 */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={t('baseModal.close')}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <motion.div
          initial={false}
          animate={{ height: contentHeight }}
          transition={moveTransition}
          className="overflow-hidden"
        >
          <div ref={setContentNode} className="space-y-4 px-4 py-4">
            <AnimatePresence initial={false} mode="popLayout">
              {groups.map(({ group, list }) => (
                <motion.section
                  key={group}
                  layout={reduceMotion ? false : 'position'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: moveTransition }}
                  exit={{
                    opacity: 0,
                    transition: { duration: DURATION.fast, ease: 'linear' },
                  }}
                  transition={moveTransition}
                  className="space-y-1.5"
                >
                  <p className="text-2xs font-medium tracking-wide text-muted-foreground">
                    {group === 'dit'
                      ? t('spine.baseGroupDit')
                      : t('spine.baseGroupSdxl')}
                  </p>
                  <div
                    className={cn(
                      'grid gap-2',
                      isMobile ? 'grid-cols-1' : 'grid-cols-3',
                    )}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {list.map(renderCard)}
                    </AnimatePresence>
                  </div>
                </motion.section>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {/* top-14 留顶部缺口 = 近全屏；mt-0 覆盖 drawer 默认 mt-24。 */}
        <DrawerContent className="top-14 mt-0 flex flex-col overflow-hidden">
          <DrawerTitle className="sr-only">{t('baseModal.title')}</DrawerTitle>
          {body}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">{t('baseModal.title')}</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  )
}
