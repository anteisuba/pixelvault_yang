// @vitest-environment jsdom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { AI_MODELS, getModelMessageKey } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { useStudioWorkbenchOperatorHost } from '@/features/assistant/hooks/use-studio-workbench-operator-host'
import { resetOperatorThread } from '@/hooks/use-studio-operator-store'
import { apiKeyRecord, runIdleTasksImmediately } from '@/test/api-keys'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderHookWithStudio,
  settle,
} from '@/test/studio-harness'

/**
 * 工作台的助手宿主（`useStudioWorkbenchOperatorHost`）—— 真工作台里跑：真 `StudioProvider`
 * （真表单 reducer、真参考图轨）、真 `ApiKeysProvider`、真型号目录、真快照构造器。
 * 只假网络：key 名单那条接口，与规则 / 素材库撤销那三条 api-client。
 * 断言的是表单里落了什么、快照里给了助手什么、回执说成没成 —— ⛔ 不数 dispatch。
 *
 * 结果行卡那一组（要真出一轮图）在 `use-studio-workbench-operator-host.results.test.ts`。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
// 默认型号自动补位只在 `/studio/image` 上开火：这里要从「没选模型」起手。
vi.mock('next/navigation', () => ({
  usePathname: () => '/zh/studio',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
const routerPush = vi.hoisted(() => vi.fn())
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio',
  useRouter: () => ({ push: routerPush }),
}))

const deleteAssistantMemoryAPI = vi.hoisted(() => vi.fn())
const deleteProjectRuleAPI = vi.hoisted(() => vi.fn())
const revertAssistantAssetWriteAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/assistant-memories', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/api-client/assistant-memories')
  >()),
  deleteAssistantMemoryAPI,
}))
vi.mock('@/lib/api-client/assistant-persona', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/api-client/assistant-persona')
  >()),
  deleteProjectRuleAPI,
}))
vi.mock('@/lib/api-client/assistant-operator', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/api-client/assistant-operator')
  >()),
  revertAssistantAssetWriteAPI,
}))

const GPT2 = AI_MODELS.OPENAI_GPT_IMAGE_2
const NAI = AI_MODELS.NOVELAI_V5_FULL
const LITE = 'seedream-5.0-lite-volcengine'
const PRO = 'seedream-5.0-pro-volcengine'

/** 她配过的 key：OpenAI、NovelAI、火山各一把（同家的其它型号由 provider key 覆盖成可跑）。 */
const KEYS = [
  apiKeyRecord({
    id: 'k-openai',
    modelId: GPT2,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
  }),
  apiKeyRecord({
    id: 'k-nai',
    modelId: NAI,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
  }),
  apiKeyRecord({
    id: 'k-volc',
    modelId: LITE,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
  }),
]

type HostProps = Parameters<typeof useStudioWorkbenchOperatorHost>[0]

async function renderHost(props: { current: HostProps } = { current: {} }) {
  const view = renderHookWithStudio(() =>
    useStudioWorkbenchOperatorHost(props.current),
  )
  await settle()
  return {
    ...view,
    host: () => view.result.current.value,
    state: () => view.result.current.studio.state,
    studio: () => view.result.current.studio,
    dispatch: (
      action: Parameters<typeof view.result.current.studio.dispatch>[0],
    ) => act(() => view.result.current.studio.dispatch(action)),
  }
}

beforeEach(() => {
  window.localStorage.clear()
  resetOperatorThread()
  routerPush.mockClear()
  runIdleTasksImmediately()
  fakeStudioServer().on('GET', API_ENDPOINTS.API_KEYS, () =>
    Response.json({ success: true, data: KEYS }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('useStudioWorkbenchOperatorHost 的生成入口', () => {
  it('图片编辑期间撤下生成入口，退出编辑后重新接回', async () => {
    const props = { current: { generationEnabled: true } as HostProps }
    const view = await renderHost(props)
    const trigger = view.host().apply.triggerGeneration
    const request = {
      model: { id: GPT2, label: 'GPT Image' },
      count: 1,
      specs: { aspectRatio: null, resolution: null, durationSeconds: null },
    }
    const before = view.state().generateRequestId

    props.current = { generationEnabled: false }
    view.rerender()
    expect(view.host().apply.triggerGeneration).toBeUndefined()
    // 编辑期间手上那份旧入口按下去也不出图。
    act(() => trigger?.(request))
    expect(view.state().generateRequestId).toBe(before)

    props.current = { generationEnabled: true }
    view.rerender()
    act(() => view.host().apply.triggerGeneration?.(request))
    expect(view.state().generateRequestId).toBe(before + 1)
    expect(view.state().generateRequestOwner).toBeUndefined()
  })
})

describe('useStudioWorkbenchOperatorHost 的网络撤销回执', () => {
  beforeEach(() => {
    deleteAssistantMemoryAPI.mockReset().mockResolvedValue({ success: true })
    deleteProjectRuleAPI.mockReset().mockResolvedValue({ success: true })
    revertAssistantAssetWriteAPI.mockReset()
  })

  it.each(['note', 'sourceAllow', 'sourceDeny'] as const)(
    '规则 %s 撤销走其真实存储位置',
    async (kind) => {
      const view = await renderHost()
      const remove = view.host().apply.deleteProjectRule
      expect(remove).toBeDefined()

      expect(await remove?.({ ruleId: 'rule-1', kind })).toBe(true)
      if (kind === 'note') {
        expect(deleteAssistantMemoryAPI).toHaveBeenCalledWith('rule-1')
        expect(deleteProjectRuleAPI).not.toHaveBeenCalled()
      } else {
        expect(deleteProjectRuleAPI).toHaveBeenCalledWith('rule-1')
        expect(deleteAssistantMemoryAPI).not.toHaveBeenCalled()
      }
    },
  )

  it('删除失败原样返回失败回执', async () => {
    deleteAssistantMemoryAPI.mockResolvedValue({ success: false })
    const view = await renderHost()
    expect(
      await view.host().apply.deleteProjectRule?.({
        ruleId: 'memory-1',
        kind: 'note',
      }),
    ).toBe(false)
  })

  it.each([
    [null, false],
    [{ revertedCount: 0, skipped: 1 }, false],
    [{ revertedCount: 2, skipped: 0 }, true],
  ] as const)('素材库撤销按完整回执判成功 %j', async (receipt, success) => {
    revertAssistantAssetWriteAPI.mockResolvedValue(receipt)
    const view = await renderHost()
    expect(
      await view.host().apply.revertAssetWrite?.({
        tool: 'tag_asset',
        entries: [{ assetId: 'asset-1', tags: [] }],
      }),
    ).toBe(success)
  })
})

describe('useStudioWorkbenchOperatorHost 的图片快照', () => {
  it('⭐ 把这一轮的全部模型交给快照 —— 专属 chip 行不能只看主模型', async () => {
    const view = await renderHost()
    view.dispatch({ type: 'SET_OPTION_ID', payload: 'key:k-volc' })
    view.dispatch({ type: 'TOGGLE_EXTRA_MODEL', payload: `workspace:${PRO}` })

    const snapshot = view.host().buildSnapshot()
    // 主模型是 Lite：Pro 才有的背景 / 分层照样在，并注明只对 Pro 生效。
    expect(snapshot.model).toMatchObject({ id: LITE })
    expect(snapshot.extraModels?.map((model) => model.id)).toEqual([PRO])
    expect(
      snapshot.capabilities
        ?.filter((chip) => chip.models)
        .map(({ key, models }) => ({ key, models })),
    ).toEqual([
      { key: 'background', models: [PRO] },
      { key: 'layerDecomposition', models: [PRO] },
    ])
  })
})

/**
 * 具名槽落地（第二期 · 视频域）。
 *
 * ⭐ 锁的是「挂到哪儿」在宿主这一跳**分成了三条真的不同的路**：首尾帧进具名槽
 * （覆盖写那一格）、参考视频进参考视频列表、默认档照旧进参考图轨。
 * ⛔ 三条合成一条的表现是「助手说换了尾帧，画面上换的是首帧」——两张图看上去
 *    都很合理，没人查得出来。
 */
describe('useStudioWorkbenchOperatorHost 的 addReference/removeReference 分槽', () => {
  it.each([['first'], ['last']] as const)(
    'slot=%s 写进具名槽，撤销把**那一格**清空（⛔ 不动另一格）',
    async (slot) => {
      const view = await renderHost()
      const other = slot === 'first' ? 'last' : 'first'
      view.dispatch({
        type: 'SET_VIDEO_FRAME_SLOT',
        payload: { slot: other, url: 'https://cdn.test/other.png' },
      })

      act(() => view.host().apply.addReference('https://cdn.test/f.png', slot))
      expect(view.state().videoFrameSlots[slot]).toBe('https://cdn.test/f.png')

      act(() =>
        view.host().apply.removeReference('https://cdn.test/f.png', slot),
      )
      expect(view.state().videoFrameSlots).toEqual({
        [slot]: null,
        [other]: 'https://cdn.test/other.png',
      })
      // 帧槽一路都没碰参考图列表。
      expect(view.studio().imageUpload.referenceImages).toEqual([])
    },
  )

  it('slot=video 走参考视频列表，按 URL 去重', async () => {
    const view = await renderHost()
    act(() => view.host().apply.addReference('https://cdn.test/a.mp4', 'video'))
    act(() => view.host().apply.addReference('https://cdn.test/a.mp4', 'video'))
    expect(view.state().videoReferenceVideos).toEqual([
      'https://cdn.test/a.mp4',
    ])

    act(() =>
      view.host().apply.removeReference('https://cdn.test/a.mp4', 'video'),
    )
    expect(view.state().videoReferenceVideos).toEqual([])
  })

  it('没写 slot 就是默认档 —— 照旧走参考图轨（图片域一个字都没变）', async () => {
    const view = await renderHost()
    act(() => view.host().apply.addReference('https://cdn.test/a.png'))
    expect(view.studio().imageUpload.referenceImages).toEqual([
      'https://cdn.test/a.png',
    ])
    expect(view.state().videoFrameSlots).toEqual({ first: null, last: null })
    expect(view.state().videoReferenceVideos).toEqual([])

    act(() => view.host().apply.removeReference('https://cdn.test/a.png'))
    expect(view.studio().imageUpload.referenceImages).toEqual([])
  })
})

describe('useStudioWorkbenchOperatorHost 的 face（D7b ③）', () => {
  const noModel = () => text('StudioOperator.face.noModel')

  it('① 图片档：那一句带模型 · 比例 · 张数，改张数就跟着刷', async () => {
    const view = await renderHost()
    const ratio = view.state().aspectRatio
    expect(view.host().face.contextLine()).toBe(
      text('StudioOperator.face.image.context', {
        model: noModel(),
        ratio,
        count: 1,
      }),
    )

    view.dispatch({ type: 'SET_IMAGE_BATCH_COUNT', payload: 4 })
    expect(view.host().face.contextLine()).toBe(
      text('StudioOperator.face.image.context', {
        model: noModel(),
        ratio,
        count: 4,
      }),
    )

    // 选上模型：那一格写的是显示名（⛔ 不是 id）。
    view.dispatch({ type: 'SET_OPTION_ID', payload: 'key:k-openai' })
    expect(view.host().face.contextLine()).toBe(
      text('StudioOperator.face.image.context', {
        model: text(`Models.${getModelMessageKey(GPT2)}.label`),
        ratio,
        count: 4,
      }),
    )
  })

  it('① 视频档换的是另一句（时长而不是张数）', async () => {
    const view = await renderHost()
    view.dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
    view.dispatch({ type: 'SET_VIDEO_DURATION', payload: 8 })
    expect(view.host().domain).toBe(ASSISTANT_PROTOCOL_DOMAIN_IDS.video)
    expect(view.host().face.contextLine()).toBe(
      text('StudioOperator.face.video.context', {
        model: noModel(),
        ratio: view.state().aspectRatio,
        seconds: 8,
      }),
    )
  })

  it('②③ 两档的空态句与占位词各不相同', async () => {
    const view = await renderHost()
    const image = view.host().face
    expect(image.emptyLine).toBe(text('StudioOperator.face.image.empty'))
    expect(image.inputPlaceholder).toBe(
      text('StudioOperator.face.image.placeholder'),
    )

    view.dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
    expect(view.host().face.emptyLine).toBe(
      text('StudioOperator.face.video.empty'),
    )
    expect(view.host().face.inputPlaceholder).toBe(
      text('StudioOperator.face.video.placeholder'),
    )
  })
})

describe('useStudioWorkbenchOperatorHost 当前工作台的模型边界', () => {
  const isNai = (id: string) => id.startsWith('nai-')

  it.each([
    ['natural', GPT2, NAI],
    ['tags', NAI, GPT2],
  ] as const)(
    '%s 台只给当前方言的模型及确认卡选项',
    async (dialect, allowed, denied) => {
      const view = await renderHost()
      view.dispatch({ type: 'SET_PROMPT_DIALECT', payload: dialect })

      const listed = view
        .host()
        .buildSnapshot()
        .availableModels.map((model) => model.id)
      const onCard = view
        .host()
        .generationControls!.models.map((model) => model.id)
      expect(listed).toContain(allowed)
      expect(listed.every((id) => isNai(id) === (dialect === 'tags'))).toBe(
        true,
      )
      expect(onCard).toEqual(listed)
      expect(view.host().apply.resolveOptionId(denied)).toBeNull()
      expect(view.host().workspace).toBe(
        dialect === 'tags' ? 'image-tags' : 'image-natural',
      )
    },
  )

  it.each([
    ['natural', NAI],
    ['tags', GPT2],
  ] as const)(
    '%s 台拒绝跨方言换模，表单与路由不变',
    async (dialect, modelId) => {
      const view = await renderHost()
      view.dispatch({ type: 'SET_PROMPT_DIALECT', payload: dialect })
      const before = view.state().selectedOptionId
      const applied = view
        .host()
        .apply.selectModelChannel?.({ modelId, channelId: null })
      expect(applied).toBe(false)
      expect(view.state().selectedOptionId).toBe(before)
      expect(routerPush).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['natural', GPT2],
    ['tags', NAI],
  ] as const)('%s 台内合法换模仍生效', async (dialect, modelId) => {
    const view = await renderHost()
    view.dispatch({ type: 'SET_PROMPT_DIALECT', payload: dialect })
    let applied: boolean | undefined
    act(() => {
      applied = view
        .host()
        .apply.selectModelChannel?.({ modelId, channelId: null })
    })
    expect(applied).toBe(true)
    expect(view.host().buildSnapshot().model).toMatchObject({ id: modelId })
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('手动换台后，助手快照和换模边界跟着当前台更新', async () => {
    const view = await renderHost()
    view.dispatch({ type: 'SET_OPTION_ID', payload: 'key:k-openai' })
    view.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })

    const snapshot = view.host().buildSnapshot()
    expect(snapshot.availableModels.every((model) => isNai(model.id))).toBe(
      true,
    )
    // 自然语言台留下的 GPT 不算这一台的模型。
    expect(snapshot.model).toBeNull()
    expect(snapshot).not.toHaveProperty('extraModels')
    expect(view.host().apply.resolveOptionId(GPT2)).toBeNull()
  })
})
