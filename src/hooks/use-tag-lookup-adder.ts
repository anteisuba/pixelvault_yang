'use client'

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'

import type {
  TagLookupTarget,
  TagsLibraryAdder,
} from '@/contexts/studio-library-pick'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { flashTagTarget } from '@/hooks/use-tag-target-flash'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import { addLookupTags, hasTag, toggleStyleTag } from '@/lib/tag-lookup'

/**
 * 查资料 / 标签库「加进来」那一份（标签台的手机查资料与桌面标签库共用，第 9f 步 9f-2c）：
 * 加到 整体 / 角色 N / 新建一位 · 画风开关。已在目标里的不重复加。
 *
 * ⭐ 函数是稳定引用（读最新的台状态走 ref），返回值只在数据真的变了才换 ——
 *   桌面把它登记进外壳（`useRegisterTagsLibraryPick`），换引用就会登记一轮。
 */
export function useTagLookupAdder(benchLabel: string): TagsLibraryAdder {
  const { state, dispatch } = useStudioForm()
  const { isGenerating } = useStudioGen()
  const characters = useNovelAiCharacters()

  const live = useRef({ tagChips: state.tagChips, dispatch, characters })
  useLayoutEffect(() => {
    live.current = { tagChips: state.tagChips, dispatch, characters }
  })

  const add = useCallback(
    (tags: readonly string[], target: TagLookupTarget): number | null => {
      const { tagChips, dispatch: send, characters: cast } = live.current
      if (!tags.length) return null
      if (target === 'whole') {
        send({
          type: 'SET_TAG_CHIPS',
          payload: {
            polarity: 'positive',
            chips: addLookupTags(tagChips, [...tags]),
          },
        })
        return null
      }
      if (target === 'new') {
        const index = cast.addWithPrompt(tags.join(', '))
        if (index !== null) flashTagTarget(index)
        return index
      }
      const character = cast.characters[target]
      if (!character) return null
      cast.update(target, {
        prompt: serializeTagChips(
          addLookupTags(parseTagChips(character.prompt), [...tags]),
        ),
      })
      flashTagTarget(target)
      return null
    },
    [],
  )

  const toggleStyle = useCallback((name: string) => {
    const { tagChips, dispatch: send } = live.current
    send({
      type: 'SET_TAG_CHIPS',
      payload: { polarity: 'positive', chips: toggleStyleTag(tagChips, name) },
    })
  }, [])

  const tagChips = state.tagChips
  const hasPositive = useCallback(
    (tag: string) => hasTag(tagChips, tag),
    [tagChips],
  )

  const composition = Boolean(characters.mode)
  const characterCount = characters.characters.length
  const canAddCharacter = composition && characterCount < characters.max
  const followTarget: TagLookupTarget =
    composition &&
    characters.activeIndex !== null &&
    characters.activeIndex < characterCount
      ? characters.activeIndex
      : 'whole'

  return useMemo(
    () => ({
      benchLabel,
      composition,
      characterCount,
      canAddCharacter,
      followTarget,
      busy: isGenerating,
      hasPositive,
      add,
      toggleStyle,
    }),
    [
      benchLabel,
      composition,
      characterCount,
      canAddCharacter,
      followTarget,
      isGenerating,
      hasPositive,
      add,
      toggleStyle,
    ],
  )
}
