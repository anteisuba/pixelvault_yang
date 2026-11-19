/**
 * 技能页的说明行：内置技能显示给人看的三语短说明（`Settings.assistantSkills.<slug>`），
 * 不显示写给模型读的英文 `description`；没有短说明 / 改过的 / 我的 → 显示原文。
 */
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { message, renderWithApp } from '@/test/app-harness'
import type { UseAssistantSkillsValue } from '@/features/assistant/hooks/use-assistant-skills'
import type { AssistantSkillView } from '@/types/assistant-skill'

import { AssistantSkillsPane } from './AssistantSkillsPane'

function skill(overrides: Partial<AssistantSkillView>): AssistantSkillView {
  return {
    id: null,
    slug: 'character-profiles',
    name: '角色设定怎么查怎么写',
    description: 'Researching canon characters and writing a profile.',
    body: 'body',
    references: {},
    origin: 'builtin',
    enabled: true,
    autoRead: true,
    ...overrides,
  }
}

function store(skills: AssistantSkillView[]): UseAssistantSkillsValue {
  const ok = vi.fn(async () => true)
  return {
    skills,
    isLoading: false,
    error: null,
    create: ok,
    update: ok,
    remove: ok,
    setBuiltinEnabled: ok,
    overrideBuiltin: ok,
    reload: vi.fn(async () => {}),
  }
}

describe('AssistantSkillsPane · 说明行', () => {
  it('内置技能显示三语短说明，不显示给模型读的英文', () => {
    renderWithApp(
      <AssistantSkillsPane
        skills={store([
          skill({}),
          skill({
            slug: 'no-such-summary',
            name: '没有短说明的',
            description: 'Fallback english text.',
          }),
        ])}
      />,
    )

    expect(
      screen.getByText(message('Settings.assistantSkills.character-profiles')),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Researching canon characters and writing a profile.'),
    ).toBeNull()
    // 没有短说明 → 回退原文。
    expect(screen.getByText('Fallback english text.')).toBeInTheDocument()
  })

  it('改过的内置、我的技能照旧显示你写的那句', () => {
    renderWithApp(
      <AssistantSkillsPane
        skills={store([
          skill({
            id: 'row-1',
            origin: 'override',
            description: '我改过的说明',
          }),
          skill({
            id: 'row-2',
            slug: 'mine-1',
            name: '我的技能',
            origin: 'mine',
            autoRead: false,
            description: '我自己写的说明',
          }),
        ])}
      />,
    )

    expect(screen.getByText('我改过的说明')).toBeInTheDocument()
    expect(screen.getByText('我自己写的说明')).toBeInTheDocument()
  })
})
