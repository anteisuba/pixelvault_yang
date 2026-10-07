'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

interface SearchSuggestionsProps {
  /** Google 的 `searchEntryPoint.renderedContent`。 */
  html: string
  className?: string
}

/**
 * Google 搜索建议条：**原样**嵌入 `renderedContent`（Gemini API 条款：不改、不删、
 * 不与别的内容混排，只给提交提示词的本人看，⛔ 不缓存）。
 *
 * 为什么是 iframe：那段 HTML 自带 `<style>`，直接塞进页面会把它的类名泄漏成
 * 全局样式。`sandbox` 不给脚本；`allow-same-origin` 只是让外面量得到高度，
 * `<base target="_blank">` 让点建议在新标签页打开 —— 点了就离开这一页，而来源
 * 与建议条按条款只在出图当下显示、离开就没了。
 */
export function SearchSuggestions({ html, className }: SearchSuggestionsProps) {
  const t = useTranslations('SearchGrounding')
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number | null>(null)

  const measure = useCallback(() => {
    const body = frameRef.current?.contentDocument?.body
    if (!body) return
    setHeight(Math.ceil(body.scrollHeight))
  }, [])

  return (
    <iframe
      ref={frameRef}
      title={t('suggestions')}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0}</style></head><body>${html}</body></html>`}
      onLoad={measure}
      // 应用只有浅色：建议条跟着宿主走浅色，不随系统暗色翻过来。
      style={{ colorScheme: 'light', ...(height ? { height } : {}) }}
      className={cn('block h-12 w-full border-0', className)}
    />
  )
}
