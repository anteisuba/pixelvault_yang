'use client'
import { useStudioForm } from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import {
  getNovelAiCharacterLayoutMode,
  getNovelAiMaxCharacters,
  snapToNovelAiGrid,
} from '@/constants/novelai'
import {
  moveNovelAiCharacter,
  removeNovelAiCharacter,
} from '@/lib/novelai-cast'
import type { NovelAiCharacterLayout } from '@/types/novelai'

export function useNovelAiCharacters() {
  const { state, dispatch } = useStudioForm()
  const { runModels } = useStudioRunModels()
  const model = runModels.find((model) =>
    getNovelAiCharacterLayoutMode(model.modelId),
  )
  const mode = getNovelAiCharacterLayoutMode(model?.modelId)
  const max = model ? getNovelAiMaxCharacters(model.modelId) : 0
  const layout = state.advancedParams.novelAiLayout
  const characters = layout?.characters ?? []
  const setLayout = (value: NovelAiCharacterLayout | undefined) =>
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...state.advancedParams, novelAiLayout: value },
    })
  const select = (index: number | null) =>
    dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: index })
  const update = (
    index: number,
    patch: Partial<NovelAiCharacterLayout['characters'][number]>,
  ) => {
    if (layout)
      setLayout({
        ...layout,
        characters: characters.map((character, i) =>
          i === index ? { ...character, ...patch } : character,
        ),
      })
  }
  /** 在末尾加一位角色；返回它的下标（加不了时 `null`）。 */
  const append = (prompt: string): number | null => {
    if (!mode || characters.length >= max) return null
    const x = (characters.length + 1) / (characters.length + 3)
    setLayout({
      positioning: layout?.positioning ?? 'auto',
      characters: [
        ...characters,
        {
          prompt,
          negativePrompt: '',
          position: { x: mode === 'grid' ? snapToNovelAiGrid(x) : x, y: 0.5 },
        },
      ],
    })
    return characters.length
  }
  const add = () => {
    const index = append('')
    if (index !== null) select(index)
  }
  /**
   * 查资料「加到 ＋新角色」：带着标签建一位，⛔ 不切过去 —— 用户还在查资料，
   * 输入框那一页亮个小点就够了（查资料 B 动效表）。
   */
  const addWithPrompt = (prompt: string) => append(prompt)
  /** 删人：指向他的互动一起删，后面的人下标前移（`novelai-cast`）。 */
  const remove = (index: number) => {
    const next = removeNovelAiCharacter(characters, index)
    setLayout(
      next.length && layout ? { ...layout, characters: next } : undefined,
    )
    select(null)
  }
  /** 换顺序（拖分页）：交给模型时这就是从左到右的站位；互动跟着人走。 */
  const move = (from: number, to: number) => {
    if (!layout) return
    setLayout({
      ...layout,
      characters: moveNovelAiCharacter(characters, from, to),
    })
    // 正在编辑的那位跟着人走（夹在中间的人各挪一格）。
    const active = state.activeTagCharacterIndex
    if (active === null) return
    if (active === from) select(to)
    else if (from < active && active <= to) select(active - 1)
    else if (to <= active && active < from) select(active + 1)
  }
  return {
    model,
    mode,
    max,
    layout,
    characters,
    activeIndex: state.activeTagCharacterIndex,
    setLayout,
    select,
    update,
    add,
    addWithPrompt,
    remove,
    move,
  }
}
