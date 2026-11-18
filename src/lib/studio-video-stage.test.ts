import { describe, expect, it } from 'vitest'

import type { GenerationRecord, RunItem } from '@/types'

import { resolveStudioVideoStageItem } from './studio-video-stage'

const running = (id: string): RunItem => ({
  id,
  modelId: 'wan-3.0',
  status: 'generating',
  generation: null,
  error: null,
  startedAt: 1,
})

const completed = (id: string): RunItem => ({
  id,
  modelId: 'wan-3.0',
  status: 'completed',
  generation: { id: `gen-${id}` } as GenerationRecord,
  error: null,
})

const failed = (id: string): RunItem => ({
  id,
  modelId: 'wan-3.0',
  status: 'failed',
  generation: null,
  error: 'boom',
})

describe('resolveStudioVideoStageItem', () => {
  it('keeps the only running take on stage after submit returns', () => {
    const items = [running('a')]
    expect(
      resolveStudioVideoStageItem({ items, focusedItemId: null })?.id,
    ).toBe('a')
  })

  it('hands the stage back once the take finishes (result shows instead)', () => {
    expect(
      resolveStudioVideoStageItem({
        items: [completed('a')],
        focusedItemId: null,
      }),
    ).toBeNull()
  })

  it('shows the latest running take over an earlier finished one', () => {
    expect(
      resolveStudioVideoStageItem({
        items: [completed('a'), running('b')],
        focusedItemId: null,
      })?.id,
    ).toBe('b')
  })

  it('does not steal the stage from a finished take the user opened', () => {
    expect(
      resolveStudioVideoStageItem({
        items: [completed('a'), running('b')],
        focusedItemId: 'a',
      }),
    ).toBeNull()
  })

  it('does not pick one when several takes are running', () => {
    expect(
      resolveStudioVideoStageItem({
        items: [running('a'), running('b')],
        focusedItemId: null,
      }),
    ).toBeNull()
  })

  it('does not show an older running take when the newest already ended', () => {
    expect(
      resolveStudioVideoStageItem({
        items: [running('a'), failed('b')],
        focusedItemId: null,
      }),
    ).toBeNull()
    expect(
      resolveStudioVideoStageItem({
        items: [running('a'), completed('b')],
        focusedItemId: null,
      }),
    ).toBeNull()
  })

  it('ignores a focus id that is not a finished take', () => {
    expect(
      resolveStudioVideoStageItem({
        items: [running('a')],
        focusedItemId: 'a',
      })?.id,
    ).toBe('a')
  })
})
