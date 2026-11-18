import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'

import { StudioTagPresetNote } from './StudioTagPresetNote'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn() }),
}))

const T = (key: string, values?: Record<string, string>) =>
  text(`StudioTags.${key}`, values)
const OPTION = (capability: string, value: string) =>
  text(`AdvancedSettings.${capability}Option.${value}`)

function renderNote(
  polarity: 'positive' | 'negative',
  modelId: string = AI_MODELS.NOVELAI_V5_FULL,
) {
  const view = renderWithStudio(<StudioTagPresetNote polarity={polarity} />)
  act(() => {
    const { dispatch } = view.studio.current
    dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
    dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${modelId}` })
  })
  return view.studio as { current: StudioHandle }
}

beforeEach(() => {
  fakeStudioServer()
})

/**
 * 质量标签 / UC 预设是替用户拼进去的字，缺省与官方一致是开着的 —— 框底下必须看得见、
 * 就地关得掉（⛔ 不能再有用户看不见的静默追加）。
 */
describe('标签台预设提示', () => {
  it('正面：缺省说明会加 Standard 质量标签，点一下关掉', () => {
    const studio = renderNote('positive')
    expect(
      screen.getByText(
        T('presetNote.quality', {
          preset: OPTION('qualityToggle', 'standard'),
        }),
      ),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: T('presetNote.turnOffQuality') }),
    )
    expect(studio.current.state.advancedParams.qualityToggle).toBe('off')
    expect(
      screen.queryByRole('button', { name: T('presetNote.turnOffQuality') }),
    ).not.toBeInTheDocument()
  })

  it('负面：缺省说明会加 Heavy UC 预设，点一下关掉', () => {
    const studio = renderNote('negative', AI_MODELS.NOVELAI_V45_CURATED)
    expect(
      screen.getByText(
        T('presetNote.uc', { preset: OPTION('ucPreset', 'heavy') }),
      ),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: T('presetNote.turnOffUc') }),
    )
    expect(studio.current.state.advancedParams.ucPreset).toBe('none')
  })
})
