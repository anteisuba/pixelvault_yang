'use client'

import { useState } from 'react'
import { ImageOff } from '@/components/icons'

import { CompareGrid } from '@/components/business/image/CompareGrid'
import { StudioReferenceRail } from '@/components/business/studio-shared/chrome/StudioReferenceRail'
import { StudioVideoQueueStrip } from '@/components/business/studio-shared/chrome/StudioVideoQueueStrip'
import { GenerationPreview } from '@/components/business/studio/GenerationPreview'
import { StudioProvider } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

import {
  UI_STATE_CASES,
  UI_STATE_REFERENCE_ENTRIES,
  UI_STATE_VIDEO_GENERATION,
} from './fixtures'

/**
 * 结果区状态样板间 —— 用假数据把「只有生成完才存在」的界面摆出来。
 *
 * ⚠ 外壳必须与 `StudioWorkbenchLayout` **逐个类名**一致（`lg:w-72` 参数栏 +
 * `studio-workbench-stage` 结果区 + 同样的 padding）。差一个 padding，量出来的
 * 「一格多高 / 首屏放得下几格」就全是假的 —— 这个页面唯一的价值就是量得准。
 *
 * 用例切换器长在左栏（参数栏的位置），结果区里除了被测组件不放任何东西。
 */
export function UiStateGallery() {
  const [caseKey, setCaseKey] = useState<string>(UI_STATE_CASES[0].key)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [referenceIndex, setReferenceIndex] = useState(0)

  const active =
    UI_STATE_CASES.find((c) => c.key === caseKey) ?? UI_STATE_CASES[0]
  const presetSelected =
    active.selectedIndex === null
      ? null
      : (active.items[active.selectedIndex]?.generation?.id ?? null)

  return (
    <StudioProvider>
      <div className="flex min-h-0 flex-1 flex-col lg:h-svh lg:flex-none lg:flex-row">
        <div className="studio-param-panel flex shrink-0 flex-col gap-3 border-b border-border/60 p-3 lg:w-72 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:p-4">
          <p className="text-xs font-medium text-muted-foreground">
            结果区状态样板间
          </p>
          <div className="flex flex-col gap-2">
            {UI_STATE_CASES.map((c) => (
              <button
                key={c.key}
                type="button"
                data-ui-case-trigger={c.key}
                onClick={() => {
                  setCaseKey(c.key)
                  setSelectedId(null)
                }}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors',
                  c.key === active.key
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:text-foreground',
                )}
              >
                {c.title}
              </button>
            ))}
          </div>
          <p className="mt-auto text-2xs leading-relaxed text-muted-foreground">
            仅开发环境可见。数据全是假的，不发任何生成请求。 用{' '}
            <code>scripts/ui-probe.js</code> 量这一屏。
          </p>
        </div>

        <div
          data-ui-case={active.key}
          className="studio-workbench-stage studio-scroll-area flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 lg:p-6"
        >
          {active.kind === 'video-queue' ? (
            /* 移动端队列卡片列 —— 视频模型在本机全部缺 key，这一屏在真机上
               走不到（选择器每一行都路由去 QuickSetupDialog）。 */
            <StudioVideoQueueStrip
              variant="cards"
              items={[...active.items]}
              focusedItemId={null}
              onFocus={() => {}}
              onRetry={() => {}}
              onCancel={() => {}}
            />
          ) : active.kind === 'video-result' ? (
            /* 播放器 + 动作行 + mono 元信息。⚠ 参考轨故意不画：它会占掉一段
               纵向，量「播放器有没有超过 45vh」时那段就是噪音。 */
            <GenerationPreview
              generation={UI_STATE_VIDEO_GENERATION}
              isLatestResult
              onRemix={() => {}}
              onSaveRecipe={() => {}}
            />
          ) : active.kind === 'empty-state' ? (
            /* 空态模板三态（视觉语言总板 D1 ④）。⛔ 不画插画 —— 三格并排摆出来
               就是为了量「去掉插画之后，标题到主动作的距离还读不读得出层次」。 */
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
              <EmptyState
                icon={<ImageOff />}
                title="还没有生成过图"
                description="写一句提示词就能开始，或者从画廊里挑一张当参考。"
                action={<Button className="rounded-full">开始生成</Button>}
                secondaryAction={
                  <Button variant="outline" className="rounded-full">
                    去画廊挑图
                  </Button>
                }
              />
              <EmptyState
                icon={<ImageOff />}
                title="这个筛选下没有资产"
                description="换一个模型或时间范围试试。"
                action={<Button className="rounded-full">清除筛选</Button>}
              />
              <EmptyState
                icon={<ImageOff />}
                title="这里还是空的"
                description="没有动作可给时只留一句说明 —— ⛔ 不放假按钮占位。"
              />
            </div>
          ) : (
            <>
              {/* 参考轨与结果**并存** —— 旧版参考图区的渲染条件是「还没有结果」，
                  第一张图落地就整块消失。这里两者同屏，量的是它们真实的相对位置
                  （尤其是右上角那颗固定的助手浮标会不会压住轨上的按钮）。 */}
              <StudioReferenceRail
                label="参考图"
                entries={UI_STATE_REFERENCE_ENTRIES}
                activeIndex={referenceIndex}
                onActiveIndexChange={setReferenceIndex}
                onEdit={() => {}}
                onRemove={() => {}}
              />
              <div className="mx-auto w-full">
                <CompareGrid
                  items={[...active.items]}
                  selectedItemId={selectedId ?? presetSelected}
                  onSelect={setSelectedId}
                  elapsedSeconds={12}
                  onEdit={() => {}}
                  onUseAsReference={() => {}}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </StudioProvider>
  )
}
