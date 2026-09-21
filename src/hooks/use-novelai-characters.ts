'use client'
import { useStudioForm } from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import {
  getNovelAiCharacterLayoutMode,
  getNovelAiMaxCharacters,
  snapToNovelAiGrid,
} from '@/constants/novelai'
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
  const add = () => {
    if (!mode || characters.length >= max) return
    const x = (characters.length + 1) / (characters.length + 3)
    setLayout({
      positioning: layout?.positioning ?? 'auto',
      characters: [
        ...characters,
        {
          prompt: '',
          negativePrompt: '',
          position: { x: mode === 'grid' ? snapToNovelAiGrid(x) : x, y: 0.5 },
        },
      ],
    })
    select(characters.length)
  }
  const remove = (index: number) => {
    const next = characters.filter((_, i) => i !== index)
    setLayout(
      next.length && layout ? { ...layout, characters: next } : undefined,
    )
    select(null)
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
    remove,
  }
}
