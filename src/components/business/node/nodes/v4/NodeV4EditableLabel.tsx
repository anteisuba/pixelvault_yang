'use client'

/**
 * v4 卡头的**原地改名**（node-canvas-v2 §4.2 · legacy `EditableNodeLabel` 的移植）。
 *
 * legacy 那一版住在 `nodes/NodeShell.tsx` 里，皮肤挂在 `canvas-label-*` 那套画布
 * 私有令牌上——那套令牌世界随第三期整体删除，所以这里**只保交互、重画皮肤**：
 * 脊柱令牌（`bg-background` / `border` / `ring`），⛔ 无任意值。
 *
 * 保住的四条交互（缺一条都会在真机上被抓到）：
 * ① **IME 组字保护**——CJK 输入法用 Enter 确认候选词，不挡就会把半截缓冲区提交掉；
 * ② Enter 提交 / Esc 回退 / 失焦提交；
 * ③ Enter/Esc 关闭输入框会顺带触发一次原生 `blur`，`suppressBlurRef` 吃掉它，
 *    否则 Esc 丢弃的草稿会被随后的 blur 重新提交回去；
 * ④ **空名静默回退**，⛔ 不落库、不报错——用户只是清空了想重打。
 *
 * ⚠ 重名**就地拒绝**（`renameStableNodeName` 的 `taken` 判据），⛔ 不加后缀：
 * 加后缀会让用户以为改成功了，而他下次 `@` 的是自己以为的那个名字。
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { PencilLine } from 'lucide-react'

import { IMEAwareInput } from '@/components/business/node/inspector/IMEAwareField'
import { focusUnlessTouch } from '@/lib/touch'
import { cn } from '@/lib/utils'

export interface NodeV4EditableLabelProps {
  readonly value: string
  /**
   * 进编辑态时填进输入框的值。默认 = `value`。⚠ 镜头节点显示的是带 `S02·` 前缀的
   * 显示串，而改的是**不带前缀的 `label`**——两者分开传，⛔ 不让用户把前缀改进
   * 稳定名里（那正是 C1 契约修正 1 要拆掉的东西）。
   */
  readonly editValue?: string
  readonly ariaLabel: string
  /** 返回 `false` = 被拒（重名/空名），输入框留在编辑态让用户改。 */
  onCommit(next: string): boolean
  /**
   * 什么手势进编辑态。v3 卡（`NodeCardShell`）走 `doubleClick`（spec §2：名字**单击
   * 不进编辑**，否则选卡时蹭到名字就掉进输入框）；旧卡头保持 `click`。
   */
  readonly activateOn?: 'click' | 'doubleClick'
  /**
   * 受控入口：这个数每变一次就进一次编辑态，给 ⋯ 菜单的「改名」用。
   * ⛔ 不要再去 `querySelector('[data-node-rename-trigger]').click()`——那是 S2 的绕路。
   */
  readonly renameRequest?: number
  readonly className?: string
}

export function NodeV4EditableLabel({
  value,
  editValue,
  ariaLabel,
  onCommit,
  activateOn = 'click',
  renameRequest,
  className,
}: NodeV4EditableLabelProps) {
  const editable = editValue ?? value
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(editable)
  const inputRef = useRef<HTMLInputElement>(null)
  const suppressBlurRef = useRef(false)

  // 受控入口：渲染期同步（React 官方的「派生 state」写法），⛔ 不放 effect 里。
  const [servedRequest, setServedRequest] = useState(renameRequest)
  if (renameRequest !== servedRequest) {
    setServedRequest(renameRequest)
    setDraft(editable)
    setEditing(true)
  }

  useEffect(() => {
    if (!editing) return
    // ⚠ `select()` **不含** `focus()`：只选中不聚焦的话输入框看着是可编辑的，
    // 键盘却还在画布上——用户点了名字、开始打字，字全被 ReactFlow 当快捷键吃掉。
    // 走 `focusUnlessTouch`（legacy `EditableNodeLabel` 用的同一个）而不是裸
    // `focus()`：⛔ 触屏上不主动聚焦——弹起的软键盘会盖住半张画布，而用户点名字
    // 常常只是想看全称。
    focusUnlessTouch(inputRef.current, { select: true })
  }, [editing])

  const commit = (): boolean => {
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      setDraft(editable)
      return true
    }
    if (trimmed === editable) return true
    return onCommit(trimmed)
  }

  const handleBlur = () => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false
      return
    }
    if (commit()) setEditing(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      suppressBlurRef.current = true
      if (commit()) setEditing(false)
      else suppressBlurRef.current = false
    } else if (event.key === 'Escape') {
      event.preventDefault()
      suppressBlurRef.current = true
      setDraft(editable)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <IMEAwareInput
        inputRef={inputRef}
        value={draft}
        onValueChange={setDraft}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        data-node-rename-input
        className="nodrag nopan nowheel h-6 min-w-0 rounded-md border bg-background px-1 text-xs"
      />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      data-node-rename-trigger
      aria-label={ariaLabel}
      title={value}
      onClick={(event) => {
        // ⚠ 卡头整条是展开切换按钮，改名要吃掉这一次冒泡，否则点名字会顺带
        // 把卡收起来。
        event.stopPropagation()
        if (activateOn !== 'click') return
        setDraft(editable)
        setEditing(true)
      }}
      onDoubleClick={(event) => {
        if (activateOn !== 'doubleClick') return
        event.stopPropagation()
        setDraft(editable)
        setEditing(true)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        setDraft(editable)
        setEditing(true)
      }}
      className={cn(
        'nodrag group/label flex min-w-0 items-center gap-1 text-left',
        className,
      )}
    >
      <span className="min-w-0 truncate">{value}</span>
      <PencilLine
        aria-hidden
        className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/label:opacity-100"
      />
    </span>
  )
}
