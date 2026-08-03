'use client'

import { useState } from 'react'

interface DraftNumberFieldProps {
  /** 已落库的值。`undefined` = 没设。 */
  value: number | undefined
  /** 提交回调。传 `undefined` 表示用户清空了这一格。 */
  onCommit(next: number | undefined): void
  min: number
  max: number
  step?: number
  label: string
  placeholder?: string
  invalid?: boolean
}

/**
 * 带草稿态的数字输入。
 *
 * ⚠ **为什么不能直接受控**：视频合并的两个裁剪输入原本是
 * `value={String(storedNumber)}` + 每次 change 都 `Number()` 后夹到 [0,600] 再落库。
 * 于是想输「1.5」时，敲完「1.」那一帧值变成 `1`、点被吃掉；想清空再重输时
 * 第一个字符就被夹成合法数。**用户根本打不出小数**。
 *
 * 这与刚修掉的焦点 bug 是同一类病：把「用户正在输入的中间态」和「已落库的值」
 * 当成同一个东西。文本字段靠 `IMEAwareField` 挡住了，数字字段一直没人管。
 *
 * 规矩：编辑期间只信本地草稿；`blur` 或 `Enter` 时才解析、夹范围、落库；
 * 外部值在**不聚焦**时才回灌（否则别处改动会打断正在输入的人）。
 */
export function DraftNumberField({
  value,
  onCommit,
  min,
  max,
  step = 0.1,
  label,
  placeholder,
  invalid,
}: DraftNumberFieldProps) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value))
  const [syncedValue, setSyncedValue] = useState(value)
  // ⚠ 用 state 不用 ref：下面那段回灌发生在**渲染期**，而渲染期读 ref 是被禁的
  //（`react-hooks` 的 "Cannot access refs during render"）。这里也确实需要它
  // 参与渲染判断，本来就该是 state。
  const [focused, setFocused] = useState(false)

  // ⚠ 在**渲染期**对齐而不是放进 effect（React 官方的 "adjusting state when a
  // prop changes"）。放 effect 里会先用旧草稿画一帧再回灌，输入框肉眼可见地闪一下；
  // 项目的 lint 也直接禁 `react-hooks/set-state-in-effect`。
  // ⚠ 聚焦期间不回灌：别处的改动不能打断正在输入的人。
  if (!focused && value !== syncedValue) {
    setSyncedValue(value)
    setDraft(value === undefined ? '' : String(value))
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      onCommit(undefined)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      // 打了一半的东西（「1.」「-」）不落库，也**不回滚**——回滚会在用户
      // 眼皮底下清掉他刚敲的字。原样留着，等他补完。
      return
    }
    const clamped = Math.min(max, Math.max(min, parsed))
    setDraft(String(clamped))
    onCommit(clamped)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={invalid || undefined}
      step={step}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(event) => {
        // 画布在文档层监听键盘（删除节点、空格拖拽…），输入框里的按键不能冒上去。
        event.stopPropagation()
        if (event.key === 'Enter') commit()
      }}
      className="canvas-detail-krow-input"
      data-invalid={invalid || undefined}
    />
  )
}
