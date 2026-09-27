import { describe, expect, it } from 'vitest'

import { parseCliArgs, summarizeResults } from './backfill-generation-previews'

describe('parseCliArgs', () => {
  it('defaults to report only', () => {
    expect(parseCliArgs([])).toEqual({ apply: false })
    expect(parseCliArgs(['--apply', '--limit', '5'])).toEqual({
      apply: true,
      limit: 5,
    })
    expect(parseCliArgs(['--apply', '--limit=5'])).toEqual({
      apply: true,
      limit: 5,
    })
  })

  it('throws on unknown flags and bad limits', () => {
    expect(() => parseCliArgs(['--aply'])).toThrow()
    expect(() => parseCliArgs(['--limit', '0'])).toThrow()
    expect(() => parseCliArgs(['--limit'])).toThrow()
  })
})

describe('summarizeResults', () => {
  it('counts each outbox once by its last result, splitting deleted images from real failures', () => {
    const summary = summarizeResults(
      [
        {
          outboxId: 'o1',
          status: 'retrying',
          generationId: 'g1',
          error: 'R2 blip',
        },
        { outboxId: 'o1', status: 'completed', generationId: 'g1' },
        {
          outboxId: 'o2',
          status: 'failed',
          generationId: 'g2',
          error: 'Image generation for derivative task was not found',
        },
        {
          outboxId: 'o3',
          status: 'failed',
          generationId: 'g3',
          error: 'Input buffer contains unsupported image format',
        },
        {
          outboxId: 'o4',
          status: 'retrying',
          generationId: 'g4',
          error: 'R2 blip',
        },
        { outboxId: 'o5', status: 'skipped' },
      ],
      new Set(['g1', 'g3', 'g4']),
    )

    expect(summary).toEqual({
      generated: 1,
      imageDeleted: 1,
      failed: 1,
      retrying: 1,
      skipped: 1,
    })
  })
})
