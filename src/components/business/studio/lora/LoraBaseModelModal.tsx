'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  LORA_BASE_MODELS,
  getLoraBaseArchitectureGroup,
  type LoraBaseModel,
} from '@/constants/lora-base-models'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface LoraBaseModelModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 兼容当前挂载的底模子集（无挂载时 = baseOnlyBases）。 */
  compatibleBases: readonly LoraBaseModel[]
  selectedBaseId: string | undefined
  onSelect: (id: string) => void
  /** 有挂载 LoRA 才有家族约束，「仅显示兼容」开关才有意义。 */
  hasMountedLora: boolean
}

// S4 换底模 modal（方向 B·配屏 2）：底模卡唤起，受挂载家族兼容约束（默认「仅显示
// 兼容当前挂载」开）。两层分组 = ① 云端 API（自备 key·快）② Runner（平台免费额度·
// 忠实，内再按架构系 SDXL / DiT 分）。每卡 = 名 + 架构·通道 mono + 忠实/快 chip +
// 选中石墨勾 + 即将降档 + 关兼容开关时非兼容项标注。Anima DiT 只有 Runner 通道·
// 不伪造 fal。底模无封面图，走紧凑卡（非大封面占位）。engine 零改·纯换 surface。
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
  // 默认只显示兼容当前挂载；关掉看全部（非兼容项标注·选了会在栈里出不兼容警示）。
  const [onlyCompatible, setOnlyCompatible] = useState(true)

  const compatibleIds = useMemo(
    () => new Set(compatibleBases.map((b) => b.id)),
    [compatibleBases],
  )
  // 无挂载时无家族约束——恒显全部（开关隐藏）。有挂载 + 开关开 → 只兼容子集。
  const showAll = !hasMountedLora || !onlyCompatible
  const bases = showAll ? LORA_BASE_MODELS : compatibleBases

  const cloudBases = bases.filter((b) => b.backend !== 'runner')
  const runnerBases = bases.filter((b) => b.backend === 'runner')
  const runnerSdxlBases = runnerBases.filter(
    (b) => getLoraBaseArchitectureGroup(b.family) === 'sdxl',
  )
  const runnerDitBases = runnerBases.filter(
    (b) => getLoraBaseArchitectureGroup(b.family) === 'dit',
  )

  const baseName = (b: LoraBaseModel) =>
    b.translationKey ? t(`spine.${b.translationKey}`) : b.displayName
  const fidelityLabel = (b: LoraBaseModel) =>
    b.fidelity === 'faithful' ? t('spine.faithful') : t('spine.fast')
  const archLabel = (b: LoraBaseModel) =>
    getLoraBaseArchitectureGroup(b.family) === 'dit'
      ? t('spine.baseGroupDit')
      : t('spine.baseGroupSdxl')
  const channelLabel = (b: LoraBaseModel) =>
    b.backend === 'runner'
      ? t('baseModal.channelRunner')
      : t('spine.executorCloud')

  const handlePick = (b: LoraBaseModel) => {
    if (!b.available) return
    onSelect(b.id)
    onOpenChange(false)
  }

  const renderCard = (b: LoraBaseModel) => {
    const selected = b.id === selectedBaseId
    // 关兼容开关看全部时，标注非兼容项（选了会在栈里出不兼容警示，不阻断）。
    const incompatible = hasMountedLora && showAll && !compatibleIds.has(b.id)
    return (
      <button
        key={b.id}
        type="button"
        onClick={() => handlePick(b)}
        disabled={!b.available}
        aria-pressed={selected}
        className={cn(
          'flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          selected
            ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
            : 'border-border/60 bg-card hover:border-border',
          !b.available && 'cursor-not-allowed opacity-55',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
            {baseName(b)}
          </span>
          {selected ? (
            <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
          ) : null}
        </div>
        <span className="font-mono text-2xs text-muted-foreground">
          {archLabel(b)} · {channelLabel(b)}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-border/60 px-1.5 py-px text-3xs font-medium text-muted-foreground">
            {fidelityLabel(b)}
          </span>
          {/* CD：该家族的推荐默认给「推荐」chip（数据源 LoraBaseModel.recommended）。 */}
          {b.recommended ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-3xs font-medium text-foreground">
              {t('baseModal.recommended')}
            </span>
          ) : null}
          {!b.available ? (
            <span className="text-3xs text-muted-foreground/70">
              {t('spine.comingSoon')}
            </span>
          ) : incompatible ? (
            <span className="text-3xs text-amber-600 dark:text-amber-400">
              {t('baseModal.incompatible')}
            </span>
          ) : null}
        </div>
      </button>
    )
  }

  const renderGrid = (list: readonly LoraBaseModel[]) => (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {list.map(renderCard)}
    </div>
  )

  // CD 移动端：唤起浮层一律改成底部拉起的近全屏 sheet；桌面走 Dialog。body 抽成
  // 一份，两种外壳共用（各自补自己的 sr-only 标题满足 a11y 契约）。
  const body = (
    <>
      <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-foreground">
            {t('baseModal.title')}
          </span>
          <span className="text-2xs text-muted-foreground">
            {hasMountedLora
              ? t('baseModal.subtitleConstrained')
              : t('baseModal.subtitleFree')}
          </span>
        </div>
        {/* 仅有挂载 LoRA（有家族约束）时才有意义。 */}
        {hasMountedLora ? (
          <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              size="sm"
              checked={onlyCompatible}
              onCheckedChange={setOnlyCompatible}
              aria-label={t('baseModal.onlyCompatible')}
            />
            {t('baseModal.onlyCompatible')}
          </label>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {cloudBases.length > 0 ? (
          <section className="space-y-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('spine.baseGroupCloud')}
            </p>
            {renderGrid(cloudBases)}
          </section>
        ) : null}
        {runnerBases.length > 0 ? (
          <section className="space-y-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('spine.baseGroupRunner')}
            </p>
            {runnerSdxlBases.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground/60">
                  {t('spine.baseGroupSdxl')}
                </p>
                {renderGrid(runnerSdxlBases)}
              </div>
            ) : null}
            {runnerDitBases.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground/60">
                  {t('spine.baseGroupDit')}
                </p>
                {renderGrid(runnerDitBases)}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <p className="shrink-0 border-t border-border px-4 py-2.5 text-2xs text-muted-foreground">
        {t('baseModal.footer')}
      </p>
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
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">{t('baseModal.title')}</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  )
}
