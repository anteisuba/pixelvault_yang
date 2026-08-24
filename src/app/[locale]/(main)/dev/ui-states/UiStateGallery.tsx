'use client'

import { useState } from 'react'

import { CompareGrid } from '@/components/business/image/CompareGrid'
import { StudioReferenceRail } from '@/components/business/studio-shared/chrome/StudioReferenceRail'
import { StudioProvider } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

import { UI_STATE_CASES, UI_STATE_REFERENCE_ENTRIES } from './fixtures'

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
        </div>
      </div>
    </StudioProvider>
  )
}
