'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'

import type { LoraTrainingPresetId } from '@/constants/lora'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLoraTrainWizard } from '@/features/lora/hooks/use-lora-train-wizard'
import {
  LoraTrainingForm,
  LoraTrainingHistorySidebar,
} from '@/features/lora/components/LoraTrainingDialog'
import { PresetGrid } from '@/features/lora/components/training/PresetGrid'

// Lazy-loaded so the Vaul-backed Drawer doesn't bloat the desktop SSR
// payload. Mobile-only entry point.
const MobileTrainingSheet = dynamic(
  () =>
    import('@/features/lora/components/training/MobileTrainingSheet').then(
      (m) => m.MobileTrainingSheet,
    ),
  { ssr: false },
)

/**
 * 预设：一行小标题 + 一格格预设，平铺在白板上（owner 2026-11-11 小样 6 选 B「平铺」：
 * ⛔ 卡框、⛔ 说明句、⛔ 步骤编号——先后由上下顺序说）。
 */
function PresetPanel({
  presetId,
  onSelect,
}: {
  presetId: LoraTrainingPresetId | null
  onSelect: (preset: { id: LoraTrainingPresetId }) => void
}) {
  const t = useTranslations('LoraTraining')
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-md font-semibold">{t('presetRailTitle')}</h3>
      <PresetGrid layout="wide" selectedId={presetId} onSelect={onSelect} />
    </section>
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
 * 收成两栏：左边预设 + 表单，右边训练记录。2026-11-11 起平铺在白板上（小样 6 选 B），
 * ⛔ 卡框。
 */
export function TrainWizard() {
  const isMobile = useIsMobile()
  const tTraining = useTranslations('LoraTraining')
  const { presetId, presetPanelRef, selectPreset, clearPreset, requestPreset } =
    useLoraTrainWizard()

  // 主列：预设在上（一键填好类型 / 底模 / 触发词）、表单在下；右栏只留训练记录 + 产物去向。
  const formColumn = (
    <div className="space-y-7">
      <div ref={presetPanelRef}>
        <PresetPanel presetId={presetId} onSelect={selectPreset} />
      </div>
      <LoraTrainingForm
        hideRecentJobs
        showEmptyState
        selectedPresetId={presetId}
        onPresetClear={clearPreset}
        onRequestPreset={requestPreset}
      />
    </div>
  )

  const sideColumn = (
    <aside className="flex flex-col gap-3">
      <LoraTrainingHistorySidebar />
      {/* CD：训练产物去向——完成的 LoRA 进「我的资源」，在库里可挂载（把训练与生成两侧连起来）。 */}
      <p className="text-2xs leading-relaxed text-muted-foreground">
        {tTraining('historyOutputHint')}
      </p>
    </aside>
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

  // 桌面：两栏平铺，表单 7 份、训练记录 5 份，中间留 48。
  return (
    <section className="mx-auto grid max-w-7xl gap-12 md:grid-cols-12 md:items-start">
      <div className="md:col-span-7">{formColumn}</div>
      <div className="md:col-span-5">{sideColumn}</div>
    </section>
  )
}
