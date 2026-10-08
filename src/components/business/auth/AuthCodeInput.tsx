'use client'

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'

import { AUTH_CODE_LENGTH } from '@/constants/auth'

const emptyCode = () => Array.from({ length: AUTH_CODE_LENGTH }, () => '')

function digitsOf(text: string): string[] {
  return text.replace(/\D/g, '').split('')
}

/**
 * 6 格验证码（owner 2026-10-08 登录注册原型）：
 *
 * · 粘贴一串 → 六格一起填满；填满就自己提交（⛔ 不用再点）。
 * · 退格在空格上 → 回到上一格并清掉它；←/→ 在格间走。
 * · 输错（`errorSerial` 变了且 `invalid`）→ 格子变红、清空、焦点回第一格。⛔ 不晃。
 *
 * 第一格带 `autocomplete="one-time-code"`：手机键盘的「来自邮件的验证码」一次塞进
 * 整串，走的是 onChange 多字符那条路，同样分到六格。
 */
export function AuthCodeInput({
  invalid,
  errorSerial,
  disabled,
  label,
  onComplete,
  onEdit,
}: {
  invalid: boolean
  /** 每报一次错 +1；变了且 `invalid` 时清空回第一格。 */
  errorSerial: number
  disabled?: boolean
  /** 整组的读屏名，比如「验证码」。 */
  label: string
  onComplete: (code: string) => void
  /** 用户又开始输了：红色可以退了。 */
  onEdit?: () => void
}) {
  const [digits, setDigits] = useState<string[]>(emptyCode)
  const boxes = useRef<Array<HTMLInputElement | null>>([])

  const focusBox = (index: number) => {
    const box =
      boxes.current[Math.max(0, Math.min(AUTH_CODE_LENGTH - 1, index))]
    box?.focus()
    box?.select()
  }

  useEffect(() => {
    focusBox(0)
  }, [])

  /* 输错：清空、回第一格。只认「又错了一次」，不认 invalid 本身一直为真。
     清空在渲染里做（React 文档「存前一次的值」写法），焦点等挂到 DOM 上再给。 */
  const [seenSerial, setSeenSerial] = useState(errorSerial)
  const [clears, setClears] = useState(0)
  if (seenSerial !== errorSerial) {
    setSeenSerial(errorSerial)
    if (invalid) {
      setDigits(emptyCode())
      setClears((n) => n + 1)
    }
  }
  useEffect(() => {
    if (clears > 0) focusBox(0)
  }, [clears])

  const commit = (next: string[]) => {
    setDigits(next)
    if (next.every((d) => d !== '')) onComplete(next.join(''))
  }

  /** 从第 `start` 格起依次写入，返回写完后该停在哪一格。 */
  const fillFrom = (start: number, incoming: string[]) => {
    const next = [...digits]
    let index = start
    for (const d of incoming) {
      if (index >= AUTH_CODE_LENGTH) break
      next[index] = d
      index += 1
    }
    commit(next)
    focusBox(index)
  }

  const handleChange = (index: number, value: string) => {
    onEdit?.()
    const incoming = digitsOf(value)
    if (incoming.length === 0) {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }
    /* 一格里进来不止一位：自动填充或老浏览器的粘贴。整串够长就从头写满。 */
    const start = incoming.length >= AUTH_CODE_LENGTH ? 0 : index
    fillFrom(
      start,
      incoming.length > 1 ? incoming : [incoming[incoming.length - 1]],
    )
  }

  const handlePaste = (
    index: number,
    event: ClipboardEvent<HTMLInputElement>,
  ) => {
    const incoming = digitsOf(event.clipboardData.getData('text'))
    event.preventDefault()
    if (incoming.length === 0) return
    onEdit?.()
    fillFrom(incoming.length >= AUTH_CODE_LENGTH ? 0 : index, incoming)
  }

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      event.preventDefault()
      const next = [...digits]
      next[index - 1] = ''
      setDigits(next)
      focusBox(index - 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="auth-code"
      data-invalid={invalid || undefined}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            boxes.current[index] = node
          }}
          className="auth-code-box"
          value={digit}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`${label} ${index + 1}/${AUTH_CODE_LENGTH}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          onChange={(event) => handleChange(index, event.target.value)}
          onPaste={(event) => handlePaste(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  )
}
