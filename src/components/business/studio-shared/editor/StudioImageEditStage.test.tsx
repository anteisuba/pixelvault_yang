import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  settle,
} from '@/test/studio-harness'
import type { UserApiKeyRecord } from '@/types'

import {
  StudioImageEditStage,
  type StudioImageEditTarget,
} from './StudioImageEditStage'

/**
 * 工作台编辑舞台，全程真的：真 `ImageEditSurface`（默认「整图修改」）、真工作台参考图槽、
 * 真 canvas-capability-runtime → 真 api-client；只假网络（object-replace 那条接口）。
 * 「跑完一步」= 写一句修改、点「应用修改」、服务端回一张新图。
 */

const auth = vi.hoisted(() => ({ userId: 'user-0', n: 0 }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: auth.userId }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

const T = (key: string, values?: Record<string, string | number>) =>
  text(`StudioImageEdit.${key}`, values)
const ORIGINAL = 'https://cdn.example.com/original.png'
const ok = (data: unknown) => Response.json({ success: true, data })

const GEMINI_KEY: UserApiKeyRecord = {
  id: 'gemini-key',
  modelId: 'gemini-3-pro-image',
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
  label: 'Gemini',
  maskedKey: 'test-****',
  isActive: true,
  isDefault: false,
  createdAt: new Date('2026-01-01'),
}

/** 每次提交回下一张图；`hold` 时先挂着，由用例决定什么时候回。 */
let nextOutputs: string[] = []
let held: Array<() => void> = []
let hold = false
let server: ReturnType<typeof fakeStudioServer>

beforeEach(() => {
  auth.n += 1
  auth.userId = `user-${auth.n}`
  nextOutputs = []
  held = []
  hold = false
  stubBrowserLayout()
  server = fakeStudioServer()
    .on('GET', API_ENDPOINTS.API_KEYS, () => ok([GEMINI_KEY]))
    .on('POST', API_ENDPOINTS.IMAGE_OBJECT_REPLACE, () => {
      const imageUrl = nextOutputs.shift()
      const response = ok({ imageUrl, width: 1024, height: 1024 })
      if (!hold) return response
      return new Promise<Response>((resolve) => {
        held.push(() => resolve(response))
      })
    })
})
afterEach(() => vi.unstubAllGlobals())

/** 宿主在真实用法里会把新 target 回灌进来，这里用受控包装模拟那条回路。 */
async function renderStage(references: string[], total = references.length) {
  function Harness() {
    const [target, setTarget] = useState<StudioImageEditTarget>({
      url: ORIGINAL,
      referenceIndex: 0,
      referenceTotal: total,
    })
    return (
      <StudioImageEditStage
        target={target}
        onBack={() => undefined}
        onTargetChange={setTarget}
      />
    )
  }
  const view = renderWithStudio(<Harness />)
  act(() => {
    for (const url of references)
      view.studio.current.imageUpload.addReferenceImage(url)
  })
  await settle()
  await settle()
  return view.studio
}

/** 舞台上当前这一步那张图：原图是「源图」，编过之后是前后对比里的「修改后」。 */
const stageImage = () =>
  (screen.queryByRole('img', { name: T('compareAfter') }) ??
    screen.getByRole('img', { name: T('sourceAlt') })) as HTMLImageElement

function submitEdit(instruction: string, output: string) {
  nextOutputs.push(output)
  fireEvent.change(
    screen.getByRole('textbox', { name: T('editPromptLabel') }),
    {
      target: { value: instruction },
    },
  )
  fireEvent.click(screen.getByRole('button', { name: T('applyEdit') }))
}

async function applyEdit(instruction: string, output: string) {
  submitEdit(instruction, output)
  await waitFor(() => expect(stageImage().src).toBe(output))
}

const historyLabels = () =>
  screen
    .getAllByRole('button', { name: /./ })
    .filter((b) => b.closest('nav'))
    .map((b) => b.textContent)

const stepLabel = (index: number, summary: string) =>
  `${T('stageHistoryStep', { index })} · ${summary}`

describe('StudioImageEditStage · 编辑历史', () => {
  it('每成功一步就在历史里多一格，并就地替换参考图槽位', async () => {
    const studio = await renderStage([ORIGINAL])

    // 只有原图时不渲染历史条 —— 一格的历史是噪音。
    expect(screen.queryByRole('navigation')).toBeNull()

    await applyEdit('red jacket', 'https://cdn.example.com/a.png')
    await applyEdit('bare feet', 'https://cdn.example.com/b.png')

    expect(historyLabels()).toEqual([
      T('stageHistoryOriginal'),
      stepLabel(1, 'red jacket'),
      stepLabel(2, 'bare feet'),
    ])
    expect(studio.current.imageUpload.referenceEntries[0]?.url).toBe(
      'https://cdn.example.com/b.png',
    )
  })

  // E4 的验收原话：「改五次能回到第三次」。
  it('改五次能回到第三次', async () => {
    const studio = await renderStage([ORIGINAL])
    for (const n of [1, 2, 3, 4, 5]) {
      await applyEdit(`edit ${n}`, `https://cdn.example.com/step${n}.png`)
    }

    fireEvent.click(
      screen.getByRole('button', { name: stepLabel(3, 'edit 3') }),
    )

    expect(stageImage().src).toBe('https://cdn.example.com/step3.png')
    expect(studio.current.imageUpload.referenceEntries[0]?.url).toBe(
      'https://cdn.example.com/step3.png',
    )
  })

  it('从中间回退后再编辑，砍掉后面的分支而不是并排堆着', async () => {
    await renderStage([ORIGINAL])
    await applyEdit('edit a', 'https://cdn.example.com/a.png')
    await applyEdit('edit b', 'https://cdn.example.com/b.png')

    fireEvent.click(
      screen.getByRole('button', { name: stepLabel(1, 'edit a') }),
    )
    await applyEdit('edit c', 'https://cdn.example.com/c.png')

    const labels = historyLabels()
    expect(labels).toEqual([
      T('stageHistoryOriginal'),
      stepLabel(1, 'edit a'),
      stepLabel(2, 'edit c'),
    ])
    expect(labels.some((label) => label?.includes('edit b'))).toBe(false)
  })

  it('参考槽在编辑途中被换了图：不把编辑结果写进那个槽', async () => {
    const studio = await renderStage([ORIGINAL])
    act(() => {
      studio.current.imageUpload.replaceReferenceImage(
        0,
        'https://cdn.example.com/another-reference.png',
      )
    })

    await applyEdit('edit old source', 'https://cdn.example.com/edited-old.png')
    expect(studio.current.imageUpload.referenceEntries[0]?.url).toBe(
      'https://cdn.example.com/another-reference.png',
    )

    await applyEdit('continue', 'https://cdn.example.com/edited-again.png')
    expect(studio.current.imageUpload.referenceEntries[0]?.url).toBe(
      'https://cdn.example.com/another-reference.png',
    )
  })

  it('编辑跑着时删了源参考图：回来的结果不覆盖前移上来的另一张', async () => {
    const other = 'https://cdn.example.com/another-reference.png'
    const studio = await renderStage([ORIGINAL, other])
    hold = true
    submitEdit('edit old source', 'https://cdn.example.com/edited-old.png')
    await waitFor(() => expect(held).toHaveLength(1))

    act(() => studio.current.imageUpload.removeReferenceImage(0))
    await act(async () => held.shift()!())
    await waitFor(() =>
      expect(stageImage().src).toBe('https://cdn.example.com/edited-old.png'),
    )

    expect(
      studio.current.imageUpload.referenceEntries.map((e) => e.url),
    ).toEqual([other])
    expect(
      server.requests.filter(
        (r) => r.path === API_ENDPOINTS.IMAGE_OBJECT_REPLACE,
      ),
    ).toHaveLength(1)
  })
})
