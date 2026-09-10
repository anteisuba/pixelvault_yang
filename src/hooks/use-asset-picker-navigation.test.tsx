import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSET_PICKER_CACHE_TTL_MS } from '@/constants/assets-grid'
import { fetchAssetSectionCounts } from '@/lib/api-client/gallery'
import { listProjectsAPI } from '@/lib/api-client/projects'
import type { AssetSectionCounts, ProjectRecord } from '@/types'
import { useAssetPickerNavigation } from './use-asset-picker-navigation'

vi.mock('@/lib/api-client/gallery', () => ({
  fetchAssetSectionCounts: vi.fn(),
}))
vi.mock('@/lib/api-client/projects', () => ({ listProjectsAPI: vi.fn() }))

const counts: AssetSectionCounts = {
  all: 3,
  favorites: 1,
  published: 0,
  unassigned: 3,
  image: 3,
  video: 0,
  audio: 0,
  model_3d: 0,
  byProject: {},
  byModel: {},
}
const projects = [{ id: 'folder', name: 'Characters' }] as ProjectRecord[]
let scopeNumber = 0
let scope = ''
let now = 1_000

beforeEach(() => {
  scope = `picker-user-${++scopeNumber}`
  now = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.mocked(listProjectsAPI)
    .mockReset()
    .mockResolvedValue({ success: true, data: projects })
  vi.mocked(fetchAssetSectionCounts)
    .mockReset()
    .mockResolvedValue({ success: true, data: counts })
})
afterEach(() => vi.restoreAllMocks())

describe('useAssetPickerNavigation', () => {
  it('loads counts only after the image grid is ready', async () => {
    const view = renderHook(
      ({ ready }) => useAssetPickerNavigation(scope, 'image', ready),
      { initialProps: { ready: false } },
    )
    await waitFor(() => expect(view.result.current.projects).toEqual(projects))
    expect(fetchAssetSectionCounts).not.toHaveBeenCalled()
    view.rerender({ ready: true })
    await waitFor(() => expect(view.result.current.counts).toEqual(counts))
    expect(listProjectsAPI).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent opens and reuses fresh navigation on reopen', async () => {
    const first = renderHook(() => useAssetPickerNavigation(scope, 'image'))
    const second = renderHook(() => useAssetPickerNavigation(scope, 'image'))
    await waitFor(() => expect(second.result.current.counts).toEqual(counts))
    expect(listProjectsAPI).toHaveBeenCalledTimes(1)
    expect(fetchAssetSectionCounts).toHaveBeenCalledTimes(1)
    first.unmount()
    second.unmount()
    const reopened = renderHook(() => useAssetPickerNavigation(scope, 'image'))
    expect(reopened.result.current.projects).toEqual(projects)
    expect(reopened.result.current.counts).toEqual(counts)
    await act(async () => {})
    expect(listProjectsAPI).toHaveBeenCalledTimes(1)
    expect(fetchAssetSectionCounts).toHaveBeenCalledTimes(1)
  })

  it('shows stale counts immediately and refreshes them after expiration', async () => {
    const first = renderHook(() => useAssetPickerNavigation(scope, 'image'))
    await waitFor(() => expect(first.result.current.counts).toEqual(counts))
    first.unmount()
    now += ASSET_PICKER_CACHE_TTL_MS + 1
    vi.mocked(fetchAssetSectionCounts).mockResolvedValue({
      success: true,
      data: { ...counts, all: 4 },
    })
    const reopened = renderHook(() => useAssetPickerNavigation(scope, 'image'))
    expect(reopened.result.current.counts?.all).toBe(3)
    await waitFor(() => expect(reopened.result.current.counts?.all).toBe(4))
    expect(fetchAssetSectionCounts).toHaveBeenCalledTimes(2)
  })

  it('never displays another account or media type counts', async () => {
    const view = renderHook(
      ({ user, type }) => useAssetPickerNavigation(user, type),
      { initialProps: { user: scope, type: 'image' as 'image' | 'video' } },
    )
    await waitFor(() => expect(view.result.current.counts).toEqual(counts))
    vi.mocked(fetchAssetSectionCounts).mockReturnValue(new Promise(() => {}))
    vi.mocked(listProjectsAPI).mockReturnValue(new Promise(() => {}))
    view.rerender({ user: scope, type: 'video' })
    expect(view.result.current.counts).toBeNull()
    expect(view.result.current.projects).toEqual(projects)
    view.rerender({ user: `${scope}-other`, type: 'image' })
    expect(view.result.current.counts).toBeNull()
    expect(view.result.current.projects).toEqual([])
  })

  it('refreshes counts after upload even within the freshness window', async () => {
    const view = renderHook(() => useAssetPickerNavigation(scope, 'image'))
    await waitFor(() => expect(view.result.current.counts).toEqual(counts))
    vi.mocked(fetchAssetSectionCounts).mockResolvedValue({
      success: true,
      data: { ...counts, all: 5 },
    })
    await act(async () => view.result.current.refreshCounts())
    expect(view.result.current.counts?.all).toBe(5)
    expect(fetchAssetSectionCounts).toHaveBeenCalledTimes(2)
  })

  it('fetches fresh counts after an upload overlaps an older request', async () => {
    let resolveOlder!: (
      value: Awaited<ReturnType<typeof fetchAssetSectionCounts>>,
    ) => void
    vi.mocked(fetchAssetSectionCounts).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOlder = resolve
      }),
    )
    const view = renderHook(() => useAssetPickerNavigation(scope, 'image'))
    vi.mocked(fetchAssetSectionCounts).mockResolvedValue({
      success: true,
      data: { ...counts, all: 5 },
    })
    await act(async () => {
      const refresh = view.result.current.refreshCounts()
      resolveOlder({ success: true, data: counts })
      await refresh
    })
    expect(view.result.current.counts?.all).toBe(5)
    expect(fetchAssetSectionCounts).toHaveBeenCalledTimes(2)
  })
})
