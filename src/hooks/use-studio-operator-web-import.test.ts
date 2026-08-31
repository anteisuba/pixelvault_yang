import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord } from '@/types'
import type { AssistantOperatorWebImage } from '@/types/assistant-operator'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

import { useStudioOperatorWebImport } from './use-studio-operator-web-import'

/**
 * 联网候选「看与选分开 + 零残留」的契约闸（P3-B → 2026-08-31 按拍板 21 重做）。
 *
 * 钉五件事，每一件都是编译期看不见的失效：
 *  ① **点「选用」之前一次网络都不发**（这一层连「看」的入口都没有——看是灯箱的事）；
 *  ② 取消选用 = 摘附件 **+ 走既有删除路径把那条素材清掉**（拍板 21 的零残留）；
 *  ③ 选满之后再选 = 换掉最早那张，并把它一并清掉；
 *  ④ 在飞途中被取消的那次，成功回来时**也要把刚落库的那张删掉**（最隐蔽的残留）；
 *  ⑤ 失败不静默、按 entryId 各记各的。
 */

const importWebImageAPI = vi.hoisted(() => vi.fn())
const deleteGenerationAPI = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    t.has = () => false
    return t
  },
}))

vi.mock('@/lib/api-client/web-image-import', () => ({ importWebImageAPI }))
vi.mock('@/lib/api-client/gallery', () => ({ deleteGenerationAPI }))

const CANDIDATE_A: AssistantOperatorWebImage = {
  imageUrl: 'https://cdn.example.com/a.jpg',
  thumbnailUrl: 'https://tbn.example.com/a.jpg',
  pageUrl: 'https://example.com/a',
  domain: 'example.com',
  title: 'candidate A',
}
const CANDIDATE_B: AssistantOperatorWebImage = {
  imageUrl: 'https://cdn.other.com/b.jpg',
  pageUrl: 'https://other.com/b',
  domain: 'other.com',
}
const CANDIDATE_C: AssistantOperatorWebImage = {
  imageUrl: 'https://cdn.third.com/c.jpg',
  domain: 'third.com',
}

function generation(id: string): GenerationRecord {
  return {
    id,
    url: `https://cdn.pixelvault.test/${id}.jpg`,
    thumbnailUrl: `https://cdn.pixelvault.test/${id}.thumbnail.webp`,
    outputType: 'IMAGE',
    prompt: '',
    model: 'user-upload',
  } as unknown as GenerationRecord
}

function setup(limit = 1) {
  const imported: StudioOperatorAttachment[] = []
  const removed: string[] = []
  const hook = renderHook(() =>
    useStudioOperatorWebImport({
      onImported: (attachment) => imported.push(attachment),
      onRemoved: (attachmentId) => removed.push(attachmentId),
      limit,
    }),
  )
  return { hook, imported, removed }
}

function picksOf(
  hook: ReturnType<typeof setup>['hook'],
  entryId = 'entry-1',
): readonly { imageUrl: string; status: string; generationId?: string }[] {
  return hook.result.current.states[entryId]?.picks ?? []
}

beforeEach(() => {
  vi.clearAllMocks()
  importWebImageAPI.mockResolvedValue({
    success: true,
    data: { generation: generation('gen-a') },
  })
  deleteGenerationAPI.mockResolvedValue({ success: true })
})

describe('联网候选 · 选用才下载（拍板 21）', () => {
  it('⛔ 没点「选用」之前一次网络都不发 —— 看大图那条路根本不经过这里', () => {
    const { hook } = setup()
    expect(hook.result.current.states).toEqual({})
    expect(importWebImageAPI).not.toHaveBeenCalled()
    expect(deleteGenerationAPI).not.toHaveBeenCalled()
  })

  it('点「选用」→ 只发 URL（⛔ 请求体里没有任何字节）→ 挂成附件', async () => {
    const { hook, imported } = setup()
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })

    expect(importWebImageAPI).toHaveBeenCalledWith({
      imageUrl: CANDIDATE_A.imageUrl,
      pageUrl: CANDIDATE_A.pageUrl,
      domain: CANDIDATE_A.domain,
      title: CANDIDATE_A.title,
    })
    const body = importWebImageAPI.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([
      'domain',
      'imageUrl',
      'pageUrl',
      'title',
    ])
    for (const value of Object.values(body)) {
      expect(String(value)).not.toMatch(/^data:|^blob:/)
    }

    await waitFor(() => {
      expect(picksOf(hook)[0]?.status).toBe('imported')
    })
    expect(imported).toHaveLength(1)
    expect(imported[0].id).toBe('gen-a')
    expect(imported[0].kind).toBe('image')
  })
})

/**
 * ⭐ 拍板 21 的后半句。🔬 owner 真机：换个选择之后，被换掉的那张仍留在素材库里 ——
 * 浏览了几张就采购了几张。
 */
describe('联网候选 · 换选零残留', () => {
  it('取消选用 = 摘附件 + 走既有删除路径清掉那条素材', async () => {
    const { hook, imported, removed } = setup()
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    await waitFor(() => {
      expect(picksOf(hook)[0]?.status).toBe('imported')
    })

    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })

    expect(removed).toEqual(['gen-a'])
    expect(deleteGenerationAPI).toHaveBeenCalledWith('gen-a')
    expect(picksOf(hook)).toHaveLength(0)
    // ⛔ 取消不该再发一次导入。
    expect(importWebImageAPI).toHaveBeenCalledTimes(1)
    expect(imported).toHaveLength(1)
  })

  it('选满之后再选 = 换掉最早那张，并把它一并清掉', async () => {
    const { hook, imported, removed } = setup(1)
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    await waitFor(() => {
      expect(picksOf(hook)[0]?.status).toBe('imported')
    })

    importWebImageAPI.mockResolvedValue({
      success: true,
      data: { generation: generation('gen-b') },
    })
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_B)
    })
    await waitFor(() => {
      expect(picksOf(hook)[0]?.status).toBe('imported')
    })

    expect(picksOf(hook).map((pick) => pick.imageUrl)).toEqual([
      CANDIDATE_B.imageUrl,
    ])
    expect(removed).toEqual(['gen-a'])
    expect(deleteGenerationAPI).toHaveBeenCalledWith('gen-a')
    expect(imported.map((item) => item.id)).toEqual(['gen-a', 'gen-b'])
  })

  it('⭐ 上限 > 1 时可以同时选好几张（受工作台参考位上限）', async () => {
    const { hook, imported, removed } = setup(3)
    importWebImageAPI
      .mockResolvedValueOnce({
        success: true,
        data: { generation: generation('gen-a') },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { generation: generation('gen-b') },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { generation: generation('gen-c') },
      })

    for (const candidate of [CANDIDATE_A, CANDIDATE_B, CANDIDATE_C]) {
      act(() => {
        hook.result.current.toggleCandidate('entry-1', candidate)
      })
      // ⚠ 逐张等落地才验得出「三张同时在」——⛔ 并行发会让上限判断读到同一份旧态。
      await waitFor(() => {
        expect(
          picksOf(hook).find((pick) => pick.imageUrl === candidate.imageUrl)
            ?.status,
        ).toBe('imported')
      })
    }

    expect(picksOf(hook)).toHaveLength(3)
    expect(imported.map((item) => item.id)).toEqual(['gen-a', 'gen-b', 'gen-c'])
    // 没超上限就不该删任何东西。
    expect(removed).toEqual([])
    expect(deleteGenerationAPI).not.toHaveBeenCalled()
  })

  it('⭐ 在飞途中被取消的那次，成功回来时也要把刚落库的那张删掉', async () => {
    const { hook, imported, removed } = setup()
    let resolveFirst: (value: unknown) => void = () => {}
    importWebImageAPI.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve
      }),
    )

    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    expect(picksOf(hook)[0]?.status).toBe('importing')

    // 还没回来就取消了 —— 界面上那一格立刻不再是选中的。
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    expect(picksOf(hook)).toHaveLength(0)

    await act(async () => {
      resolveFirst({ success: true, data: { generation: generation('gen-a') } })
      await Promise.resolve()
    })

    // ⛔ 不许挂上去（用户已经不要了），且库里那条必须清掉。
    expect(imported).toHaveLength(0)
    expect(removed).toEqual([])
    await waitFor(() => {
      expect(deleteGenerationAPI).toHaveBeenCalledWith('gen-a')
    })
    expect(picksOf(hook)).toHaveLength(0)
  })

  it('⛔ 清理失败不静默：说出来，让人能去素材页手动删', async () => {
    deleteGenerationAPI.mockResolvedValue({
      success: false,
      error: 'Generation not found or access denied',
    })
    const { hook } = setup()
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    await waitFor(() => {
      expect(picksOf(hook)[0]?.status).toBe('imported')
    })

    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    await waitFor(() => {
      expect(hook.result.current.states['entry-1']?.cleanupError).toBeTruthy()
    })
  })
})

describe('联网候选 · 失败与隔离', () => {
  it('⛔ 失败不静默：那一格留着、带原因、不挂任何附件；再点 = 重试', async () => {
    importWebImageAPI.mockResolvedValue({
      success: false,
      error: 'Failed to fetch image (403)',
    })
    const { hook, imported } = setup()
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    await waitFor(() => {
      expect(picksOf(hook)[0]?.status).toBe('error')
    })
    expect(picksOf(hook)[0]?.imageUrl).toBe(CANDIDATE_A.imageUrl)
    expect(imported).toHaveLength(0)
    // ⛔ 失败的那张没落库，也就没有东西要清。
    expect(deleteGenerationAPI).not.toHaveBeenCalled()

    importWebImageAPI.mockResolvedValue({
      success: true,
      data: { generation: generation('gen-a') },
    })
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    await waitFor(() => {
      expect(picksOf(hook)[0]?.status).toBe('imported')
    })
    expect(importWebImageAPI).toHaveBeenCalledTimes(2)
  })

  it('失败的那张不占参考位（上限 1 时仍能选另一张，且不删任何东西）', async () => {
    importWebImageAPI.mockResolvedValueOnce({
      success: false,
      error: 'boom',
    })
    const { hook, removed } = setup(1)
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    await waitFor(() => {
      expect(picksOf(hook)[0]?.status).toBe('error')
    })

    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_B)
    })
    await waitFor(() => {
      expect(
        picksOf(hook).find((pick) => pick.imageUrl === CANDIDATE_B.imageUrl)
          ?.status,
      ).toBe('imported')
    })
    expect(removed).toEqual([])
    expect(deleteGenerationAPI).not.toHaveBeenCalled()
  })

  it('两条日志条各自记自己的选中项（按 entryId 存，不串台）', async () => {
    const { hook } = setup()
    act(() => {
      hook.result.current.toggleCandidate('entry-1', CANDIDATE_A)
    })
    await waitFor(() => {
      expect(picksOf(hook, 'entry-1')[0]?.status).toBe('imported')
    })
    importWebImageAPI.mockResolvedValue({
      success: true,
      data: { generation: generation('gen-b') },
    })
    act(() => {
      hook.result.current.toggleCandidate('entry-2', CANDIDATE_B)
    })
    await waitFor(() => {
      expect(picksOf(hook, 'entry-2')[0]?.status).toBe('imported')
    })

    expect(picksOf(hook, 'entry-1')[0]?.generationId).toBe('gen-a')
    expect(picksOf(hook, 'entry-2')[0]?.generationId).toBe('gen-b')
    // ⚠ 换选是**条内**的事：entry-2 不该去动 entry-1 挂上的那条。
    expect(deleteGenerationAPI).not.toHaveBeenCalled()
  })
})
