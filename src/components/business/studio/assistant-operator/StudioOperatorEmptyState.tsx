'use client'

/**
 * 面板**空态**（v2 §4.2 / 画板 BEmpty）—— 首次打开、或刚开一条新会话时，
 * 时间线那一格里长的东西。
 *
 * 清单逐条（§4.2）：
 *  · 助手头像（大一号）+ 一句自我介绍（`我是 {name}，你的画面搭档`）+ 一段能力说明；
 *  · **三颗起手药丸**，复用 v1 的 `STUDIO_OPERATOR_SUGGESTIONS`（语境化 +
 *    `minChanges` 门）—— §4.2 明说「只换文案与呈现」，所以**点即发送**那条
 *    行为（拍板 15）⛔ 不动：它们是起手势不是草稿模板，填进框里还要再点一次
 *    发送，等于把一句已经写好的话降级成待办。
 *  · ⛔ 空态**不显示**结论记录区与钉住区（§4.2 末行）—— 那两样此刻还不存在
 *    （#13 才做），这里也不为它们留占位。
 *
 * ⚠ 呈现是**整行**不是小圆药丸（画板 BEmpty：44px 高、图标 + 文案、左对齐）：
 *   一行一句完整的话，挤成 chip 的话三句中文会折行成六行。
 * ⚠ 头像走 `AssistantTimelineAvatar`（与时间线沟里那颗同一份实现），⛔ 不在这里第二次实现
 *   「自传头像优先于预设」那套判断。
 */

import { BookOpen, ImageIcon, Search, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { LucideIcon } from 'lucide-react'

import { STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT } from '@/constants/studio-assistant-operator'
import { AssistantTimelineAvatar } from '@/components/business/studio/assistant-operator/TimelineAvatar'
import type { AssistantPersona } from '@/types/assistant-persona'

/**
 * 每颗药丸左边那枚图标（画板 BEmpty：配图 / 素材库 / 放大镜）。
 *
 * ⚠ 键是**药丸 id** 不是域：同一颗药丸在哪个域都长同一个样。
 * ⚠ 表里没有的 id 回落到 `Sparkles` —— 药丸表加一条而这里忘了跟上时，界面上
 *   少的是一枚图标，⛔ 不是一颗崩掉的组件。
 */
const SUGGESTION_ICONS: Readonly<Record<string, LucideIcon>> = {
  setupShot: ImageIcon,
  findReference: BookOpen,
  checkStyle: Search,
}

interface StudioOperatorEmptyStateProps {
  /** 已经过 `minChanges` 门的那些药丸（面板算好传进来，⛔ 这里不重算）。 */
  suggestions: readonly { id: string; minChanges: number }[]
  /** 点一颗 = **直接发这句话**（拍板 15），⛔ 不是填进输入框。 */
  onSuggestion(text: string): void
  persona?: AssistantPersona
}

export function StudioOperatorEmptyState({
  suggestions,
  onSuggestion,
  persona,
}: StudioOperatorEmptyStateProps) {
  const t = useTranslations('StudioOperator')
  const name = persona?.name?.trim() || t('timeline.assistantFallback')

  return (
    <div
      data-testid="operator-empty"
      className="flex flex-col items-center gap-6 px-4 py-10 text-center"
    >
      {/* 68px = 时间线那颗 32px 的放大档（画板 BEmpty）—— 同一颗组件换尺寸，
          ⛔ 不是第二种头像。 */}
      <AssistantTimelineAvatar
        {...(persona ? { persona } : {})}
        className="size-17"
      />

      <div className="flex flex-col items-center gap-2.5">
        {/* 20px（画板 BEmpty）——空态大标题是这一屏唯一的主角，18px 读起来
            像一行小标题。 */}
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {t('emptyState.title', { name })}
        </h2>
        <p className="max-w-95 text-sm leading-relaxed text-muted-foreground">
          {t('emptyState.description')}
        </p>
      </div>

      {suggestions.length > 0 ? (
        <div className="flex w-full flex-col gap-2">
          {suggestions
            .slice(0, STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT)
            .map((suggestion) => {
              const Icon = SUGGESTION_ICONS[suggestion.id] ?? Sparkles
              return (
                <button
                  key={suggestion.id}
                  type="button"
                  data-testid="operator-empty-suggestion"
                  data-suggestion={suggestion.id}
                  onClick={() => onSuggestion(t(`suggestion.${suggestion.id}`))}
                  /* 10px 圆角（`rounded-lg`，画板 BEmpty）：这一行是一张可点的
                     卡而不是一颗控件，⛔ 不用控件档的 `rounded-md`。 */
                  className="flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-4 text-left text-sm text-foreground shadow-assistant-card transition-colors duration-(--duration-fast) ease-standard hover:bg-accent active:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    {t(`suggestion.${suggestion.id}`)}
                  </span>
                </button>
              )
            })}
        </div>
      ) : null}
    </div>
  )
}
