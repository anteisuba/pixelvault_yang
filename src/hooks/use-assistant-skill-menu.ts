'use client'

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'

import type { MentionInputHandle } from '@/components/ui/mention-input'
import { useAssistantSkills } from '@/hooks/use-assistant-skills'
import type { AssistantSkillView } from '@/types/assistant-skill'

/**
 * 助手输入框的「/」技能菜单（第 7b 步）：光标前打了 `/查询` 就弹开，列开着的技能
 * （内置的 + 你写的），选中把 `/查询` 换成 `/名字 `（普通文字）。服务端照 `/名字` 认。
 *
 * ⚠ 第一次打「/」才去取技能列表（⛔ 一打开助手就取）。
 * ⚠ `/` 前面得是开头或空白（⛔ 网址里的斜杠）；查询里有空格就算写完了。
 */

const MAX_OPTIONS = 8
const SLASH_QUERY = /(?:^|\s)\/([^\s/]{0,30})$/

export interface UseAssistantSkillMenuResult {
  readonly open: boolean
  readonly listId: string
  readonly options: readonly AssistantSkillView[]
  readonly activeIndex: number
  optionId(index: number): string
  setActiveIndex(index: number): void
  /** 输入框内容变了（或光标动了）：重新认一遍 `/查询`。 */
  sync(): void
  pick(skill: AssistantSkillView): void
  /** 菜单开着时接住方向键 / 回车 / Tab / Esc；接住了回 true。 */
  onKeyDown(event: KeyboardEvent): boolean
}

export function useAssistantSkillMenu(
  inputRef: RefObject<MentionInputHandle | null>,
): UseAssistantSkillMenuResult {
  const listId = useId()
  const [query, setQuery] = useState<string | null>(null)
  const [wanted, setWanted] = useState(false)
  const [active, setActive] = useState(0)
  const { skills } = useAssistantSkills({ enabled: wanted })

  const options = useMemo(() => {
    if (query === null) return []
    const q = query.toLowerCase()
    return skills
      .filter(
        (skill) =>
          skill.enabled &&
          (skill.name.toLowerCase().includes(q) || skill.slug.includes(q)),
      )
      .sort((a, b) => Number(a.origin !== 'mine') - Number(b.origin !== 'mine'))
      .slice(0, MAX_OPTIONS)
  }, [query, skills])
  const open = query !== null && options.length > 0
  const activeIndex = options.length ? Math.min(active, options.length - 1) : 0

  const sync = useCallback(() => {
    const before = inputRef.current?.textBeforeCaret() ?? null
    const match = before === null ? null : SLASH_QUERY.exec(before)
    setQuery(match ? match[1]! : null)
    setActive(0)
    if (match) setWanted(true)
  }, [inputRef])

  const pick = useCallback(
    (skill: AssistantSkillView) => {
      if (query === null) return
      inputRef.current?.replaceBeforeCaret(query.length + 1, `/${skill.name} `)
      setQuery(null)
    },
    [inputRef, query],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return false
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          const step = event.key === 'ArrowDown' ? 1 : -1
          setActive((activeIndex + step + options.length) % options.length)
          break
        }
        case 'Enter':
        case 'Tab':
          pick(options[activeIndex]!)
          break
        case 'Escape':
          setQuery(null)
          break
        default:
          return false
      }
      event.preventDefault()
      event.stopPropagation()
      return true
    },
    [activeIndex, open, options, pick],
  )

  return {
    open,
    listId,
    options,
    activeIndex,
    optionId: (index) => `${listId}-${index}`,
    setActiveIndex: setActive,
    sync,
    pick,
    onKeyDown,
  }
}
