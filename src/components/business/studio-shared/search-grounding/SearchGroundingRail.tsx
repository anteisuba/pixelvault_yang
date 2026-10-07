'use client'

import { useState } from 'react'

import {
  SearchGroundingSources,
  type SearchGroundingSourcesLayout,
} from '@/components/business/studio-shared/search-grounding/SearchGroundingSources'
import type { SearchGroundingView } from '@/lib/search-grounding'
import { cn } from '@/lib/utils'

export interface SearchGroundingRailState {
  phase: 'searching' | 'done'
  view?: SearchGroundingView
}

interface SearchGroundingRailProps {
  /** `null` = 这一刻没有资料（没开搜索 / 离开出图那一刻 / 一份都没交回）。 */
  state: SearchGroundingRailState | null
  layout: SearchGroundingSourcesLayout
  wireTarget?: () => HTMLElement | null
  /** 图墙格子顺序的指纹：变了就重描出线。 */
  wireKey?: string
  className?: string
}

/**
 * 资料位：图左边让出来的那一列（`column`，宽 0 → 内容宽，spring-expand）或图上方
 * 那一条（`strip`，高 0 → 内容高，spring-slot）。收回时内容留着一起淡出、宽 / 高
 * 收回 0（base），⛔ 先空掉再收。
 */
export function SearchGroundingRail({
  state,
  layout,
  wireTarget,
  wireKey,
  className,
}: SearchGroundingRailProps) {
  const open = state !== null && (state.phase === 'searching' || !!state.view)
  // 收回那一拍还要画着上一份（淡出），所以记住最后一份有内容的状态。
  const [shown, setShown] = useState(state)
  if (open && state !== shown) setShown(state)

  return (
    <div
      data-open={open ? 'true' : 'false'}
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'search-sources-slot',
        layout === 'strip' && 'search-sources-slot--rows',
        className,
      )}
    >
      <div
        className={cn(layout === 'column' && 'flex flex-col justify-center')}
      >
        {shown ? (
          <SearchGroundingSources
            layout={layout}
            phase={shown.phase}
            view={shown.view}
            wireTarget={wireTarget}
            wireKey={wireKey}
          />
        ) : null}
      </div>
    </div>
  )
}
