import { beforeEach, describe, expect, it, vi } from 'vitest'

const { byLocalName, byMeaning } = vi.hoisted(() => ({
  byLocalName: vi.fn(),
  byMeaning: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/services/research/danbooru-tag-name.service', () => ({
  findTagsByLocalName: byLocalName,
  findTagsByMeaning: byMeaning,
}))

import {
  clearSearchExpansionCache,
  expandSearchQuery,
  expandSearchWords,
} from './search-expansion.service'

const tag = (name: string) => ({ name, category: 0, post_count: 1 })

beforeEach(() => {
  vi.clearAllMocks()
  clearSearchExpansionCache()
  byLocalName.mockResolvedValue([])
  byMeaning.mockResolvedValue([])
})

describe('expandSearchWords', () => {
  it('local names first, then by meaning; spaced spelling, no duplicates, not the query itself', async () => {
    byLocalName.mockResolvedValue([tag('rain'), tag('after_rain')])
    byMeaning.mockResolvedValue([tag('rain'), tag('raincloud')])
    expect(await expandSearchWords('下雨')).toEqual([
      'rain',
      'after rain',
      'raincloud',
    ])
    expect(byLocalName).toHaveBeenCalledWith('下雨', [0, 3, 4], 3)
    expect(byMeaning).toHaveBeenCalledWith('下雨', [0, 3, 4], 3)

    byMeaning.mockResolvedValue([tag('rain'), tag('heavy_rain')])
    expect(await expandSearchWords('rain')).toEqual([
      'after rain',
      'heavy rain',
    ])
  })

  it('remembers a translated query', async () => {
    byMeaning.mockResolvedValue([tag('cat_ears')])
    await expandSearchWords('猫耳')
    expect(await expandSearchWords(' 猫耳 ')).toEqual(['cat ears'])
    expect(byMeaning).toHaveBeenCalledTimes(1)
  })

  it('never throws: a failure is an empty list, tried again next time', async () => {
    byLocalName.mockRejectedValueOnce(new Error('db down'))
    expect(await expandSearchWords('猫耳')).toEqual([])
    byMeaning.mockResolvedValue([tag('cat_ears')])
    expect(await expandSearchWords('猫耳')).toEqual(['cat ears'])
  })

  it('empty query → nothing asked', async () => {
    expect(await expandSearchWords('  ')).toEqual([])
    expect(byMeaning).not.toHaveBeenCalled()
  })
})

describe('expandSearchQuery', () => {
  it('translates each word and merges, dropping spellings already in the query', async () => {
    byMeaning.mockImplementation(async (text: string) =>
      text === '下雨'
        ? [tag('rain')]
        : text === '猫耳'
          ? [tag('cat_ears')]
          : [tag('rain')],
    )
    expect(await expandSearchQuery('下雨 猫耳, rain')).toEqual(['cat ears'])
    expect(await expandSearchQuery('下雨 猫耳')).toEqual(['rain', 'cat ears'])
  })
})
