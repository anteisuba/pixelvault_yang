// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const importWebImageAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/web-image-import', () => ({ importWebImageAPI }))

import {
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'

import {
  awaitUserUrlMount,
  useOperatorUserUrlMount,
} from './use-operator-user-url-mount'

it('导入成功后把入库的那张挂成参考图', async () => {
  importWebImageAPI.mockResolvedValueOnce({
    success: true,
    data: { generation: { url: 'https://cdn.test/imported.png' } },
  })
  const addReferenceImage = vi.fn()
  const { result } = renderHook(() =>
    useOperatorUserUrlMount({
      referenceEntries: [],
      addReferenceImage,
      removeReferenceImage: vi.fn(),
    }),
  )
  act(() => result.current.mountUserUrl('https://source.test/first.png'))
  await waitFor(() =>
    expect(addReferenceImage).toHaveBeenCalledExactlyOnceWith(
      'https://cdn.test/imported.png',
    ),
  )
})

describe('导入失败不挂图，线程里交代一行', () => {
  it.each([false, true])('网络异常=%s', async (reject) => {
    resetOperatorThread()
    if (reject) importWebImageAPI.mockRejectedValueOnce(new Error('network'))
    else importWebImageAPI.mockResolvedValueOnce({ success: false })
    const addReferenceImage = vi.fn()
    const { result } = renderHook(() =>
      useOperatorUserUrlMount({
        referenceEntries: [],
        addReferenceImage,
        removeReferenceImage: vi.fn(),
      }),
    )
    act(() =>
      result.current.mountUserUrl(`https://source.test/failure-${reject}.png`),
    )
    // 真的线程 store 里多了那一行。
    await waitFor(() =>
      expect(getOperatorState().entries).toContainEqual(
        expect.objectContaining({ code: 'urlImportFailed' }),
      ),
    )
    expect(addReferenceImage).not.toHaveBeenCalled()
  })
})

describe('挂载结论可等（11-19：取不回来时读回要写「没挂上 + 原因」）', () => {
  const surface = () => ({
    referenceEntries: [],
    addReferenceImage: vi.fn(),
    removeReferenceImage: vi.fn(),
  })

  it('取不回来：结论是失败，detail 带站点与原因码', async () => {
    importWebImageAPI.mockResolvedValueOnce({
      success: false,
      error: 'Upstream 403',
      errorCode: 'WEB_IMAGE_IMPORT_FORBIDDEN',
    })
    const { result } = renderHook(() => useOperatorUserUrlMount(surface()))
    const url = 'https://cdn.leonardo.test/outcome-fail.jpg'
    act(() => result.current.mountUserUrl(url, 'app.leonardo.ai'))
    const outcome = await awaitUserUrlMount(url)
    expect(outcome).toMatchObject({
      ok: false,
      errorCode: 'WEB_IMAGE_IMPORT_FORBIDDEN',
    })
    expect(outcome?.ok === false && outcome.detail).toMatch(
      /could not fetch that picture from app\.leonardo\.ai \(WEB_IMAGE_IMPORT_FORBIDDEN\).*NOT on the bench/,
    )
  })

  it('取回来并挂上：结论是成功', async () => {
    importWebImageAPI.mockResolvedValueOnce({
      success: true,
      data: { generation: { url: 'https://cdn.test/outcome-ok.png' } },
    })
    const target = surface()
    const { result } = renderHook(() => useOperatorUserUrlMount(target))
    const url = 'https://source.test/outcome-ok.png'
    act(() => result.current.mountUserUrl(url))
    await expect(awaitUserUrlMount(url)).resolves.toEqual({ ok: true })
    expect(target.addReferenceImage).toHaveBeenCalledWith(
      'https://cdn.test/outcome-ok.png',
    )
  })

  it('从没交过的地址没有结论（调用方不等）', () => {
    expect(awaitUserUrlMount('https://source.test/never.png')).toBeNull()
  })
})
