'use client'

import { useState } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * 「这条音色属于谁」——视频生成里 `audioBindings[].characterName` 的**唯一录入
 * 控件**（台账 A + X，owner 2026-08-29 拍板）。
 *
 * ── 它在答什么 ──────────────────────────────────────────────────────
 * Seedance 2.5 这类多模态参考模型的官方推荐写法是
 * 「Images 1-2 are Character 1 and correspond to Audio 1」—— 也就是说**每条音频
 * 要能钉到一个角色**，worker 才生成得出 `{Name} (@AudioN)` 那个提示词 token
 * （`workers/execution/src/index.ts`）。没有名字的多角色对白片，模型只能拿到
 * 一串无标签的 @Audio1/@Audio2，谁在说话全靠提示词里再用文字描述一遍。
 *
 * ── 为什么两个域共用这一个 ──────────────────────────────────────────
 * 画布与工作台此前是两种残缺：
 *   · **画布**（台账 X）：音色**绕过角色卡**直接挂进视频节点时无处可填，
 *     送出预览里两条都写「旁白」，看不出哪条属于谁。
 *   · **工作台**（台账 A）：连挂音频的地方都没有，整条通道断在 UI 层。
 * 补的时候如果各写一个，「归属」就会有两套语义。这里收成一个：**候选名单由
 * 调用方给**（画布给上游角色卡，工作台给已应用的角色卡），控件只负责
 * 「无归属 / 从名单挑 / 手填」这三态。
 *
 * ⚠ 皮肤不在这里：画布用 `node-*` 令牌、工作台用脊柱令牌，两域的表面不共用
 * （见 `studio-shared/README.md` 第 2 条与「薄脊柱 + 域皮肤」）。所以触发器的
 * className 由调用方传，组件本身只出结构与行为。
 *
 * ⚠ 空值语义是 `undefined` 而不是空串：`audioBindings[].characterName` 在
 * schema 上是 `.min(1).optional()`，写空串会被服务端拒收。
 */

/** 「不属于任何角色」——送出去时就是不带 `characterName` 的那一档。 */
const NONE_VALUE = '__none__'
/** 「名单里没有，我自己写」。 */
const CUSTOM_VALUE = '__custom__'

export interface AudioOwnerPickerLabels {
  /** 无归属那一档的文案（画布/工作台都写「旁白」）。 */
  none: string
  /** 手填那一档的文案。 */
  custom: string
  /** 手填输入框的占位。 */
  customPlaceholder: string
  /** 触发器与输入框的可访问名。 */
  ariaLabel: string
}

export interface AudioOwnerPickerProps {
  value: string | undefined
  /** 可挑的角色名。画布传上游角色卡，工作台传本次已应用的角色卡。 */
  candidates: readonly string[]
  onChange(next: string | undefined): void
  labels: AudioOwnerPickerLabels
  /** 域皮肤 —— 挂在 SelectTrigger 与输入框上。 */
  className?: string
  disabled?: boolean
}

export function AudioOwnerPicker({
  value,
  candidates,
  onChange,
  labels,
  className,
  disabled,
}: AudioOwnerPickerProps) {
  const trimmed = value?.trim()
  const isCustomValue = Boolean(trimmed) && !candidates.includes(trimmed ?? '')
  /**
   * 「正在手填」是个**视图状态**：用户点了「手填…」但还没敲字时，值仍是
   * undefined，光看值分不出他是想手填还是想选无归属。所以单独记一位。
   */
  const [customMode, setCustomMode] = useState(isCustomValue)
  const showCustomInput = customMode || isCustomValue

  const selectValue = showCustomInput
    ? CUSTOM_VALUE
    : (trimmed ?? '') === ''
      ? NONE_VALUE
      : (trimmed as string)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {/* 名单为空时（画布上没有角色卡 / 工作台没应用角色卡）不摆一个只有两项的
          下拉 —— 那时「挑」这个动作本身没有内容，直接给输入框。 */}
      {candidates.length > 0 ? (
        <Select
          value={selectValue}
          disabled={disabled}
          onValueChange={(next) => {
            if (next === CUSTOM_VALUE) {
              setCustomMode(true)
              return
            }
            setCustomMode(false)
            onChange(next === NONE_VALUE ? undefined : next)
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={labels.ariaLabel}
            className={cn('w-full', className)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{labels.none}</SelectItem>
            {candidates.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_VALUE}>{labels.custom}</SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      {candidates.length === 0 || showCustomInput ? (
        <input
          type="text"
          value={trimmed ?? ''}
          disabled={disabled}
          placeholder={labels.customPlaceholder}
          aria-label={labels.ariaLabel}
          onChange={(event) => {
            const next = event.target.value.trim()
            onChange(next.length > 0 ? next : undefined)
          }}
          // 画布把键盘事件当快捷键吃掉，输入框必须自己拦住（与域内其它输入同款）。
          onKeyDown={(event) => event.stopPropagation()}
          className={cn('nodrag nopan nowheel w-full', className)}
        />
      ) : null}
    </div>
  )
}
