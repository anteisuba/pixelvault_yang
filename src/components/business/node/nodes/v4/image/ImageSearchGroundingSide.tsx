'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Globe } from '@/components/icons'
import { SearchGroundingSources } from '@/components/business/studio-shared/search-grounding/SearchGroundingSources'
import { useNodeSearchGrounding } from '@/hooks/node/use-node-search-grounding'
import { cn } from '@/lib/utils'

interface ImageSearchGroundingSideProps {
  nodeId: string
  selected: boolean
  onSelect(): void
}

/**
 * 画布图片卡的「先搜再画」资料（B 定稿）：选中时资料列在卡左边、梳子连线描到卡的
 * 输入口；取消选中，资料与建议条一起收起，输入口旁冒出「资料 N」（点它或点卡再展开）。
 * 来源只在内存里（`use-node-search-grounding`），刷新 / 切旧版本后就没有了。
 */
export function ImageSearchGroundingSide({
  nodeId,
  selected,
  onSelect,
}: ImageSearchGroundingSideProps) {
  const t = useTranslations('SearchGrounding')
  const state = useNodeSearchGrounding(nodeId)
  // 收起那一拍还要画着上一份（淡出），记住最后一份有内容的。
  const [shown, setShown] = useState(state)
  if (state && state !== shown) setShown(state)

  const hasContent =
    state !== null && (state.phase === 'searching' || Boolean(state.view))
  const open = hasContent && selected
  const grounded = state?.phase === 'done' && state.view?.status === 'grounded'
  const folded = grounded && !selected

  return (
    <>
      <div
        data-shown={open ? 'true' : 'false'}
        aria-hidden={!open}
        inert={!open}
        className="node-search-stack nodrag nopan absolute -top-7.5 right-full mr-14 w-50"
      >
        {shown ? (
          <SearchGroundingSources
            layout="column"
            phase={shown.phase}
            view={shown.view}
            className="search-sources--canvas w-50 pr-0"
          />
        ) : null}
      </div>
      <button
        type="button"
        data-shown={folded ? 'true' : 'false'}
        aria-hidden={!folded}
        tabIndex={folded ? 0 : -1}
        onClick={onSelect}
        aria-label={t('expand')}
        className={cn(
          'node-search-fold nodrag nopan absolute top-40 right-full mr-2.5 inline-flex h-6.5 items-center gap-1.25 rounded-full bg-card px-2.5 text-xs whitespace-nowrap text-foreground shadow-card ring-1 ring-border',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        )}
      >
        <Globe className="size-3.25 text-muted-foreground" aria-hidden />
        {t('folded', { count: state?.view?.sources.length ?? 0 })}
      </button>
    </>
  )
}
