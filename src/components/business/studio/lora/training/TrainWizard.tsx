'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'

import type { LoraTrainingPresetId } from '@/constants/lora'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLoraTrainWizard } from '@/hooks/use-lora-train-wizard'
import {
  LoraTrainingForm,
  LoraTrainingHistorySidebar,
} from '@/components/business/LoraTrainingDialog'
import { PresetGrid } from '@/components/business/studio/lora/training/PresetGrid'
import { cn } from '@/lib/utils'

// Lazy-loaded so the Vaul-backed Drawer doesn't bloat the desktop SSR
// payload. Mobile-only entry point.
const MobileTrainingSheet = dynamic(
  () =>
    import('@/components/business/studio/lora/training/MobileTrainingSheet').then(
      (m) => m.MobileTrainingSheet,
    ),
  { ssr: false },
)

interface PresetRailPanelProps {
  presetId: LoraTrainingPresetId | null
  onSelect: (preset: { id: LoraTrainingPresetId }) => void
  /**
   * 'rail' (default): xl+ 右侧 sticky 列,内部用 compact 2-col grid。
   * 'panel': 折叠在主区下方占满宽度,sticky 关闭,内部用 wide 2/3-col grid
   * 以利用横向空间。
   */
  variant?: 'rail' | 'panel'
}

/**
 * Wrapper around PresetGrid. Adds the "Presets" heading + subtitle that
 * the standalone grid doesn't render. In 'rail' variant applies the
 * sticky / scroll constraints shared with the history rail so the two
 * columns visually balance at xl+ breakpoints. In 'panel' variant
 * renders as a static full-width block — used when the form column
 * doesn't have horizontal room for a third rail.
 */
function PresetRailPanel({
  presetId,
  onSelect,
  variant = 'rail',
}: PresetRailPanelProps) {
  const t = useTranslations('LoraTraining')
  return (
    <aside
      className={cn(
        'rounded-2xl border border-border bg-card p-4',
        variant === 'rail' &&
          'xl:max-h-[calc(100svh-7rem)] xl:sticky xl:top-4 xl:overflow-y-auto',
      )}
    >
      <div className="mb-3 space-y-0.5">
        <h3 className="text-sm font-semibold tracking-tight">
          {t('presetRailTitle')}
        </h3>
        <p className="text-2xs text-muted-foreground">
          {t('presetRailSubtitle')}
        </p>
      </div>
      <PresetGrid
        layout={variant === 'rail' ? 'compact' : 'wide'}
        selectedId={presetId}
        onSelect={onSelect}
      />
    </aside>
  )
}

// S8（CD 训练台）：主列步骤编号——训练是有先后的流程（先选预设再填表），编号
// 让顺序一眼可读。绝对定位在卡片左上角外沿，不挤占卡片内容宽度。
function StepBadge({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="absolute -left-1 -top-1 z-10 inline-flex size-5 items-center justify-center rounded-full border border-border bg-background font-mono text-2xs font-semibold text-muted-foreground shadow-sm"
    >
      {n}
    </span>
  )
}

/**
 * 训练向导页 —— LoRA 工作台「训练」tab 的整个身体（进度表 34）。
 *
 * ⚠ 它**不是**一条新路由：tab 已经带 `?section=train`（`LORA_WORKBENCH_SECTIONS`），
 * 分享与回退早就有落点，⛔ 这一刀只拆文件，不改导航。
 *
 * 训练页对稿（lora-domain-wireframes.md §6）：稿子是两栏——左表单，右
 * 提交卡+训练任务列表，没有独立的历史/预设侧栏。以前是三栏（历史 240px·
 * 表单·预设 280px，xl 才三栏，md..xl- 退成两栏+预设折下面），现在统一
 * 收成两栏：左表单，右边把预设 + 训练任务列表堆在一起——功能都留着，
 * 只是不再各占一条独立的常驻侧栏。
 */
export function TrainWizard() {
  const isMobile = useIsMobile()
  const tTraining = useTranslations('LoraTraining')
  const { presetId, presetPanelRef, selectPreset, clearPreset, requestPreset } =
    useLoraTrainWizard()

  // S8（CD 训练台-组建）：主列 = 有编号的两步——① 选择预设（一键填好类型/底模/
  // 触发词）② 填表单（上传训练图 + 配置 + 提交）。预设从右侧栏移到主列顶部，
  // 因为它是流程第一步、不是参考资料；右栏只留训练历史 + 产物去向说明。
  const formColumn = (
    <div className="space-y-4">
      <div className="relative" ref={presetPanelRef}>
        <StepBadge n={1} />
        <PresetRailPanel
          presetId={presetId}
          onSelect={selectPreset}
          variant="panel"
        />
      </div>
      <div className="relative">
        <StepBadge n={2} />
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <LoraTrainingForm
            hideRecentJobs
            showEmptyState
            selectedPresetId={presetId}
            onPresetClear={clearPreset}
            onRequestPreset={requestPreset}
          />
        </div>
      </div>
    </div>
  )

  const sideColumn = (
    <div className="flex flex-col gap-4">
      <aside className="rounded-2xl border border-border bg-card p-4">
        <LoraTrainingHistorySidebar />
        {/* CD：训练产物去向——完成的 LoRA 进「我的资源」，在库 modal 的「我的」
            tab 可挂载（把训练与生成两侧连起来）。 */}
        <p className="mt-3 border-t border-border/60 pt-3 text-2xs leading-relaxed text-muted-foreground">
          {tTraining('historyOutputHint')}
        </p>
      </aside>
    </div>
  )

  if (isMobile) {
    // Mobile: presets + history stack above; form lives in a Vaul sheet
    // triggered by the floating FAB.
    return (
      <section className="mx-auto max-w-5xl space-y-4 pb-24">
        {sideColumn}
        <MobileTrainingSheet>{formColumn}</MobileTrainingSheet>
      </section>
    )
  }

  // Desktop: always 2 columns from md+ — form 7fr, presets+history 5fr.
  return (
    <section className="mx-auto grid max-w-7xl gap-4 md:grid-cols-12 md:items-start">
      <div className="md:col-span-7">{formColumn}</div>
      <div className="md:col-span-5">{sideColumn}</div>
    </section>
  )
}
