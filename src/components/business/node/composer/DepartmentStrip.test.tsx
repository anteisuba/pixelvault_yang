import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { ComposerReferenceToken } from '@/hooks/node/use-video-composer'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { DepartmentStrip } from './DepartmentStrip'

function makeToken(
  over: Partial<ComposerReferenceToken>,
): ComposerReferenceToken {
  return {
    id: 'c1',
    kind: 'character',
    label: '角色A',
    token: '@角色A',
    ...over,
  }
}

function renderStrip(
  tokens: ComposerReferenceToken[],
  handlers?: {
    onRemove?: (token: ComposerReferenceToken) => void
    onInsert?: (data: unknown, el: HTMLElement) => void
    onAddReference?: (request: unknown) => void
    onAddVoice?: (characterNodeId: string) => void
    onAddCloseup?: (characterNodeId: string) => void
  },
) {
  return render(
    <DepartmentStrip
      tokens={tokens}
      onInsert={handlers?.onInsert ?? vi.fn()}
      onRemove={handlers?.onRemove}
      onAddReference={handlers?.onAddReference}
      onAddVoice={handlers?.onAddVoice}
      onAddCloseup={handlers?.onAddCloseup}
    />,
  )
}

describe('DepartmentStrip (cast 五卡)', () => {
  it('renders the five cast cards in fixed order, even when empty', () => {
    renderStrip([])
    const cards = screen.getAllByRole('region')
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'departments.character',
      'departments.scene',
      'departments.shot',
      'departments.motion',
      'departments.narration',
    ])
    expect(screen.getAllByText('references.emptyDept')).toHaveLength(5)
  })

  it('routes character / background / shot into their own separate cards', () => {
    renderStrip([
      makeToken({ id: 'c1' }),
      makeToken({
        id: 'b1',
        kind: 'background',
        label: '教室',
        token: '@教室',
      }),
      makeToken({ id: 's1', kind: 'shot', label: '远景', token: '@远景' }),
    ])
    const characterCard = screen.getByRole('region', {
      name: 'departments.character',
    })
    const sceneCard = screen.getByRole('region', { name: 'departments.scene' })
    const shotCard = screen.getByRole('region', { name: 'departments.shot' })
    expect(
      within(characterCard).getByRole('button', { name: '@角色A' }),
    ).toBeInTheDocument()
    expect(
      within(sceneCard).getByRole('button', { name: '@教室' }),
    ).toBeInTheDocument()
    expect(
      within(shotCard).getByRole('button', { name: '@远景' }),
    ).toBeInTheDocument()
    // motion + narration are the only empty cards.
    expect(screen.getAllByText('references.emptyDept')).toHaveLength(2)
  })

  it('shows the payload-order corner badge for image, audio and video slots', () => {
    renderStrip([
      makeToken({ id: 'c1', imageSlotIndex: 0 }),
      makeToken({
        id: 'v1',
        kind: 'voice',
        label: '旁白',
        token: '@Audio1',
        audioSlotIndex: 0,
      }),
      makeToken({
        id: 'ref1',
        kind: 'video',
        label: '',
        token: '',
        insertable: false,
        videoSlotIndex: 0,
      }),
    ])
    expect(screen.getByText('references.slotBadgeImage')).toBeInTheDocument()
    expect(screen.getByText('references.slotBadgeAudio')).toBeInTheDocument()
    expect(screen.getByText('references.slotBadgeVideo')).toBeInTheDocument()
  })

  it('groups a keyframe token into the shot (镜头) card', () => {
    renderStrip([
      makeToken({
        id: 'kf1',
        kind: 'keyframe',
        label: '',
        token: '',
        insertable: false,
      }),
    ])
    const shotCard = screen.getByRole('region', { name: 'departments.shot' })
    expect(
      within(shotCard).getByRole('button', { name: 'refKind.keyframe' }),
    ).toBeInTheDocument()
  })

  it('projects an unready 旁白 voice as a dimmed slot in the narration card', () => {
    renderStrip([
      makeToken({
        id: 'voice1',
        kind: 'voice',
        label: '旁白甲',
        token: '',
        insertable: false,
        dimmed: true,
      }),
    ])
    const narrationCard = screen.getByRole('region', {
      name: 'departments.narration',
    })
    const slot = within(narrationCard).getByRole('button', { name: '旁白甲' })
    expect(slot.className).toContain('opacity-40')
  })

  it('shows a character voice badge when a boundVoice exists', () => {
    renderStrip([
      makeToken({
        id: 'c1',
        boundVoice: {
          nodeId: 'voice1',
          label: '卡提希娅',
          ready: true,
        },
      }),
    ])
    // Voice badge is a titled span (音色：{name}) inside the character slot.
    expect(screen.getByTitle('references.voiceBadge')).toBeInTheDocument()
  })

  it('offers ＋配音 on a character with no voice, wiring to that character', () => {
    const onAddVoice = vi.fn()
    renderStrip([makeToken({ id: 'c1' })], { onAddVoice })
    fireEvent.click(screen.getByRole('button', { name: 'references.addVoice' }))
    expect(onAddVoice).toHaveBeenCalledWith('c1')
  })

  it('groups a closeup token into the 角色 card, after its character (§9 B)', () => {
    renderStrip([
      makeToken({ id: 'c1', imageSlotIndex: 0 }),
      makeToken({
        id: 'cu1',
        kind: 'closeup',
        label: '特写1',
        token: '@特写1',
        imageSlotIndex: 1,
        parentCharacterId: 'c1',
      }),
    ])
    const characterCard = screen.getByRole('region', {
      name: 'departments.character',
    })
    // Both live in the 角色 card (identity unit); closeup is NOT its own card.
    expect(
      within(characterCard).getByRole('button', { name: '@角色A' }),
    ).toBeInTheDocument()
    expect(
      within(characterCard).getByRole('button', { name: '@特写1' }),
    ).toBeInTheDocument()
    // Still five cards — no standalone closeup card leaked in.
    expect(screen.getAllByRole('region')).toHaveLength(5)
  })

  it('offers ＋特写 on a character slot, wiring to that character', () => {
    const onAddCloseup = vi.fn()
    renderStrip([makeToken({ id: 'c1' })], { onAddCloseup })
    fireEvent.click(
      screen.getByRole('button', { name: 'references.addCloseup' }),
    )
    expect(onAddCloseup).toHaveBeenCalledWith('c1')
  })

  it('offers × (delete edge) only for tokens with a direct edge', () => {
    const onRemove = vi.fn()
    renderStrip(
      [
        makeToken({ id: 'c1', edgeId: 'e1' }),
        makeToken({ id: 's1', kind: 'shot', label: '远景', token: '@远景' }),
      ],
      { onRemove },
    )
    const removeButtons = screen.getAllByRole('button', {
      name: 'references.remove',
    })
    expect(removeButtons).toHaveLength(1)
    fireEvent.click(removeButtons[0])
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', edgeId: 'e1' }),
    )
  })

  it('keeps the slot itself clickable for @token insertion', () => {
    const onInsert = vi.fn()
    renderStrip([makeToken({ id: 'c1' })], { onInsert })
    fireEvent.click(screen.getByRole('button', { name: '@角色A' }))
    expect(onInsert).toHaveBeenCalled()
  })

  it('hides the ＋添加位 tiles when onAddReference is not provided', () => {
    renderStrip([])
    expect(
      screen.queryByRole('button', { name: 'references.add' }),
    ).not.toBeInTheDocument()
  })

  it('fires the add request directly per card — no role submenu', () => {
    const onAddReference = vi.fn()
    renderStrip([], { onAddReference })
    // Character card ＋ carries role=character (each card is one role now).
    fireEvent.click(
      within(
        screen.getByRole('region', { name: 'departments.character' }),
      ).getByRole('button', { name: 'references.add' }),
    )
    expect(onAddReference).toHaveBeenCalledWith({
      nodeType: NODE_TYPE_IDS.image,
      role: NODE_IMAGE_ROLE_IDS.character,
      mediaType: 'image',
    })
    // Narration card ＋ spawns a voice, no role.
    fireEvent.click(
      within(
        screen.getByRole('region', { name: 'departments.narration' }),
      ).getByRole('button', { name: 'references.add' }),
    )
    expect(onAddReference).toHaveBeenCalledWith({
      nodeType: NODE_TYPE_IDS.voice,
      role: undefined,
      mediaType: 'voice',
    })
  })
})
