// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const importWebImageAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/web-image-import', () => ({ importWebImageAPI }))

import {
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'

import { useOperatorUserUrlMount } from './use-operator-user-url-mount'

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
