'use client'

import { useState } from 'react'
import { ChevronDown, ListChecks } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { AssistantAskedPair } from '@/types/assistant-protocol'

/**
 * A2c ·「已询问」折叠块 —— 这一轮聊下来助手问过什么、你答了什么，收起来可回看。
 *
 * ⚠ **这是客户端的聚合视图，不是模型每轮重发的载荷。** 让模型每轮把问答对再吐一遍
 * 会让 payload 随轮次线性膨胀 —— 那正是 `canvas-pipeline-gap-2026-07-31.md` §2 那道
 * 「4000 字符静默悬崖」的病根（装配时根本没有字符预算，16 条 × 4000 理论上能进同一个
 * prompt）。这里零额外 token。
 *
 * 默认收起：它是「想不起来时翻一下」的东西，不是每轮都要读的东西。
 */
export function AssistantAskedLog({ pairs }: { pairs: AssistantAskedPair[] }) {
  const t = useTranslations('PromptAssistant.turn')
  const [open, setOpen] = useState(false)

  if (pairs.length === 0) return null

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ListChecks className="size-3.5 shrink-0" />
        <span className="flex-1 text-left">
          {t('askedTitle', { count: pairs.length })}
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-base ease-standard',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <dl className="space-y-2 border-t border-border/60 px-3 py-2.5">
          {pairs.map((pair, index) => (
            <div key={index} className="space-y-0.5">
              <dt className="text-xs leading-5 text-muted-foreground">
                {pair.question}
              </dt>
              <dd className="text-xs font-medium leading-5 text-foreground">
                {pair.answer}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
