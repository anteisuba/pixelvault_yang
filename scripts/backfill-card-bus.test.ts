import { describe, expect, it } from 'vitest'

import {
  parseCliArgs,
  planCardBackfill,
  type BackfillCardRow,
} from './backfill-card-bus'

function row(overrides: Partial<BackfillCardRow> = {}): BackfillCardRow {
  return {
    id: 'c1',
    userId: 'u1',
    name: '林夏',
    parentId: null,
    variantLabel: null,
    isDeleted: false,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    handle: null,
    referenceSlots: null,
    sourceImageUrl: 'https://cdn.test/main.png',
    sourceImages: ['https://cdn.test/main.png'],
    sourceImageEntries: null,
    referenceImages: ['https://cdn.test/refine.png'],
    referenceRoles: null,
    ...overrides,
  }
}

describe('parseCliArgs', () => {
  it('defaults to report only', () => {
    expect(parseCliArgs([])).toEqual({ apply: false })
    expect(parseCliArgs(['--apply'])).toEqual({ apply: true })
  })

  it('throws on unknown flags', () => {
    expect(() => parseCliArgs(['--aply'])).toThrow()
  })
})

describe('planCardBackfill', () => {
  it('fills handle and reference slots for an untouched card', () => {
    const [plan] = planCardBackfill([row()])
    expect(plan?.handle).toBe('林夏')
    expect(
      plan?.referenceSlots?.map((slot) => [slot.url, slot.origin]),
    ).toEqual([
      ['https://cdn.test/main.png', 'upload'],
      ['https://cdn.test/refine.png', 'refine'],
    ])
  })

  it('skips cards whose new columns are already written', () => {
    expect(
      planCardBackfill([row({ handle: '林夏', referenceSlots: [] })]),
    ).toEqual([])
  })

  it('keeps existing and soft-deleted handles taken and suffixes in order', () => {
    const plans = planCardBackfill([
      row({ id: 'old', handle: '林夏', isDeleted: true, referenceSlots: [] }),
      row({ id: 'b', createdAt: new Date('2026-05-03T00:00:00Z') }),
      row({ id: 'a', createdAt: new Date('2026-05-02T00:00:00Z') }),
    ])
    expect(plans.map((plan) => [plan.id, plan.handle, plan.suffixed])).toEqual([
      ['a', '林夏-2', true],
      ['b', '林夏-3', true],
    ])
  })

  it('allocates handles per user independently', () => {
    const plans = planCardBackfill([
      row({ id: 'x', userId: 'u2' }),
      row({ id: 'y', userId: 'u1' }),
    ])
    expect(plans.map((plan) => plan.handle)).toEqual(['林夏', '林夏'])
  })

  it('derives a variant handle from the parent handle allocated in the same run', () => {
    const plans = planCardBackfill([
      row({
        id: 'v',
        parentId: 'p',
        variantLabel: '雨夜',
        createdAt: new Date('2026-04-01T00:00:00Z'),
      }),
      row({ id: 'p', name: 'Lin Xia' }),
    ])
    expect(plans.map((plan) => [plan.id, plan.handle])).toEqual([
      ['p', 'Lin-Xia'],
      ['v', 'Lin-Xia-雨夜'],
    ])
  })

  it('treats a variant with a missing parent as a root card', () => {
    const [plan] = planCardBackfill([row({ parentId: 'gone' })])
    expect(plan?.handle).toBe('林夏')
  })

  it('is stable when run again on its own output', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })]
    const first = planCardBackfill(rows)
    const second = planCardBackfill(
      rows.map((card) => {
        const plan = first.find((entry) => entry.id === card.id)
        return {
          ...card,
          handle: plan?.handle ?? card.handle,
          referenceSlots: plan?.referenceSlots ?? card.referenceSlots,
        }
      }),
    )
    expect(second).toEqual([])
  })
})
