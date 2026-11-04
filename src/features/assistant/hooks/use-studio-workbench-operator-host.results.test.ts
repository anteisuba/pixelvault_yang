// @vitest-environment jsdom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS, IMAGE_GENERATION } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { useStudioWorkbenchOperatorHost } from '@/features/assistant/hooks/use-studio-workbench-operator-host'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import {
  appendOperatorPendingResult,
  claimOperatorThreadScope,
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import { buildGenerationDisplayName } from '@/lib/generation-name'
import { setStudioStageFocus } from '@/lib/studio-stage-focus'
import { apiKeyRecord, runIdleTasksImmediately } from '@/test/api-keys'
import { fakeStudioServer, renderHookWithStudio } from '@/test/studio-harness'
import type { StudioOperatorResultOwner } from '@/types/studio-assistant-operator'

/**
 * 宿主契约的 `results`（切片 3a）—— **结果行卡的唯一数据源**。
 *
 * ⭐ 这一格存在的理由：此前映射长在面板里（`useStudioGenOptional()?.activeRun`），
 * 而 `/studio/lora` 故意不挂 `<StudioProvider>` —— 那条路上它恒空，结果行卡在
 * LoRA 装配台上**结构性地**永远不可能出现。搬到宿主之后，两个宿主各自映射自己的
 * 结果列，面板一行都不用判自己挂在哪儿。
 *
 * 钉的是：
 *  ① 只收**跑完且有地址**的那些（在飞的格子画出来是一个永远转着的骨架）；
 *  ② `thumbnailUrl` 与 `url` 分开带（视频的 url 是媒体本身，喂 `next/image`
 *     得到一个碎图标）；
 *  ③ 别的台 / 别的对话 / 别的账号的那一批认领不到。
 *
 * 全程真出图：真 `useStudioGenerateAction` 按下去 → 真 `useUnifiedGenerate` 提交、
 * 轮询（假时钟走 2 秒一拍）→ 真 `activeRun`。只假出图那两条 api-client（提交 / 查状态）
 * 与 key 名单接口。
 * （旧用例「没有 <StudioProvider> 时是空数组」删了：宿主读表单要 `useStudioForm`，
 *  没有 Provider 它直接抛——真路径上到不了那一档。换成「还没出过图时是空数组」。）
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/zh/studio',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>()
  return {
    ...actual,
    toast: Object.assign(vi.fn(), {
      ...actual.toast,
      info: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
    }),
  }
})

/**
 * 出图服务端的剧本：第 N 次提交怎么回（`pending` = 一直在飞、`fail` = 提交就失败、
 * 其余 = 一个 jobId），每个 jobId 查状态时回哪一张。
 */
type Submit = 'pending' | 'fail' | { jobId: string }
const server = vi.hoisted(() => ({
  submits: [] as Submit[],
  jobs: new Map<string, Record<string, unknown>>(),
}))
vi.mock('@/lib/api-client/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/generation')>()),
  studioGenerateAPI: vi.fn(async () => {
    const next = server.submits.shift() ?? 'fail'
    if (next === 'pending') return new Promise(() => {})
    if (next === 'fail') return { success: false, error: 'boom' }
    return { success: true, data: { jobId: next.jobId } }
  }),
  checkImageGenerationStatusAPI: vi.fn(async (jobId: string) => {
    const generation = server.jobs.get(jobId)
    return generation
      ? {
          success: true,
          data: { status: 'COMPLETED', jobId, generation },
        }
      : { success: true, data: { status: 'IN_PROGRESS', jobId } }
  }),
}))

const GPT2 = AI_MODELS.OPENAI_GPT_IMAGE_2
const NAI = AI_MODELS.NOVELAI_V5_FULL
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
]

/** 服务端回来的一张图（状态口给的 `generation`）。 */
function generation(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    url: `https://cdn.test/${id}.png`,
    prompt: 'malfoy',
    outputType: 'IMAGE',
    model: GPT2,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  }
}

/** 假时钟往前走（让提交、轮询那几拍跑完）。 */
async function advance(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function renderBench() {
  const view = renderHookWithStudio(() => ({
    host: useStudioWorkbenchOperatorHost(),
    // REQUEST_GENERATE 的执行端（工作台上就是参数栏那颗出图键）。
    action: useStudioGenerateAction(),
  }))
  await advance()
  const dispatch = (
    action: Parameters<typeof view.result.current.studio.dispatch>[0],
  ) => act(() => view.result.current.studio.dispatch(action))
  return {
    ...view,
    host: () => view.result.current.value.host,
    state: () => view.result.current.studio.state,
    dispatch,
    /** 摆好表单、按一下出图（可带助手那一枪的提交身份），等轮询那一拍。 */
    async shoot({
      optionId,
      count = 1,
      dialect = 'natural',
      owner,
    }: {
      optionId: string
      count?: number
      dialect?: 'natural' | 'tags'
      owner?: StudioOperatorResultOwner
    }) {
      dispatch({ type: 'SET_PROMPT_DIALECT', payload: dialect })
      dispatch({ type: 'SET_OPTION_ID', payload: optionId })
      dispatch({ type: 'SET_PROMPT', payload: 'malfoy' })
      dispatch({ type: 'SET_IMAGE_BATCH_COUNT', payload: count })
      dispatch({ type: 'REQUEST_GENERATE', owner })
      await advance()
      await advance(IMAGE_GENERATION.POLL_INTERVAL_MS)
    },
  }
}

function ownerFor(threadScope: string, pendingResultId: string, total = 1) {
  claimOperatorThreadScope(threadScope, 'image')
  appendOperatorPendingResult({ id: pendingResultId, total })
  return {
    threadScope,
    localThreadId: getOperatorState().localThreadId,
    pendingResultId,
  }
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  })
  window.localStorage.clear()
  resetOperatorThread()
  server.submits = []
  server.jobs.clear()
  runIdleTasksImmediately()
  fakeStudioServer().on('GET', API_ENDPOINTS.API_KEYS, () =>
    Response.json({ success: true, data: KEYS }),
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setStudioStageFocus(null)
})

describe('useStudioWorkbenchOperatorHost 的 results 映射', () => {
  it('还没出过图时是空数组', async () => {
    const bench = await renderBench()
    expect(bench.host().results).toEqual([])
    expect(bench.host().resultRun).toBeUndefined()
  })

  it('只收跑完且有地址的那些，缩略图与地址分开带', async () => {
    // 一轮四张：在飞 / 出好 / 出好却没有地址 / 提交就失败。
    server.submits = ['pending', { jobId: 'job-2' }, { jobId: 'job-3' }, 'fail']
    server.jobs.set(
      'job-2',
      generation('gen-2', {
        url: 'https://cdn.test/b.png',
        thumbnailUrl: 'https://cdn.test/b-thumb.png',
        prompt: '一把红伞',
        seq: 21,
      }),
    )
    // ⚠ 跑完了却没有地址 —— 也不收：画出来是一个空格子。
    server.jobs.set('job-3', generation('gen-3', { url: '' }))

    const bench = await renderBench()
    await bench.shoot({ optionId: 'key:k-openai', count: 4 })

    expect(bench.host().results).toEqual([
      {
        id: 'gen-2',
        url: 'https://cdn.test/b.png',
        thumbnailUrl: 'https://cdn.test/b-thumb.png',
        // ⭐ 切片 N1：结果格的 label 是**产物名**（`图_0xx·一把红伞`），因为它
        //    同时是用户照着打出来指认这一张的那串字。
        label: buildGenerationDisplayName({ seq: 21, prompt: '一把红伞' }),
        // 角标与 `@` 指认的本钱：列表口读到的**真序号**（⛔ 不是派生值）。
        seq: 21,
        outputType: 'IMAGE',
      },
    ])
  })

  it('切换方言与视频台时隐藏其他台的在飞与完成结果，回来继续显示', async () => {
    const owner = ownerFor('user-a:image-tags', 'tag-pending', 2)
    server.submits = [{ jobId: 'job-tag' }, 'pending']
    server.jobs.set(
      'job-tag',
      generation('tag-result', { model: NAI, prompt: '1girl' }),
    )

    const bench = await renderBench()
    await bench.shoot({
      optionId: 'key:k-nai',
      count: 2,
      dialect: 'tags',
      owner,
    })
    expect(bench.host().results.map((result) => result.id)).toEqual([
      'tag-result',
    ])
    expect(bench.host().resultRun).toMatchObject({
      total: 2,
      completed: 1,
      settled: false,
    })

    bench.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'natural' })
    expect(bench.host().results).toEqual([])
    expect(bench.host().resultRun).toBeUndefined()

    bench.dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
    expect(bench.host().results).toEqual([])

    bench.dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'image' })
    bench.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
    expect(bench.host().resultRun).toMatchObject({
      total: 2,
      completed: 1,
      settled: false,
    })
  })

  it('同台的新对话与新账号不能认领上一次提交的结果', async () => {
    const oldOwner = ownerFor('user-a:image-natural', 'old-pending')
    server.submits = [{ jobId: 'job-old' }]
    server.jobs.set('job-old', generation('old-generation'))

    const bench = await renderBench()
    await bench.shoot({ optionId: 'key:k-openai', owner: oldOwner })
    expect(bench.host().resultRun?.owner).toEqual(oldOwner)

    act(() => {
      resetOperatorThread()
      appendOperatorPendingResult({ id: 'new-pending', total: 1 })
    })
    expect(bench.host().resultRun).toBeUndefined()

    act(() => {
      claimOperatorThreadScope('user-b:image-natural', 'image')
      appendOperatorPendingResult({ id: 'old-pending', total: 1 })
    })
    expect(bench.host().resultRun).toBeUndefined()
  })
})

describe('useStudioWorkbenchOperatorHost 交给助手的舞台', () => {
  /**
   * ⭐ 10-25 查明：记录里的类型是大写 `IMAGE`，旧筛选比小写，台上的图一张都没交给过助手
   *   （助手说「台上没有挂结果图」去库里翻）。这里用记录的真实写法锁住。
   */
  it('⭐ 台上这一批（大写 IMAGE）交给助手，选中的那张标出来', async () => {
    server.submits = [{ jobId: 'job-a' }, { jobId: 'job-b' }]
    server.jobs.set('job-a', generation('gen-a', { seq: 1701 }))
    server.jobs.set('job-b', generation('gen-b', { seq: 1702 }))

    const bench = await renderBench()
    await bench.shoot({ optionId: 'key:k-openai', count: 2 })
    setStudioStageFocus('gen-b')

    expect(bench.host().buildSnapshot().results).toEqual([
      {
        assetId: 'gen-a',
        url: 'https://cdn.test/gen-a.png',
        label: buildGenerationDisplayName({ seq: 1701, prompt: 'malfoy' }),
      },
      {
        assetId: 'gen-b',
        url: 'https://cdn.test/gen-b.png',
        label: buildGenerationDisplayName({ seq: 1702, prompt: 'malfoy' }),
        selected: true,
      },
    ])
  })

  it('这一批一张都没出来时交舞台上的上一张', async () => {
    // 上一轮出了一张；这一轮提交就失败了 —— 舞台上摆着的还是上一张。
    server.submits = [{ jobId: 'job-last' }, 'fail']
    server.jobs.set('job-last', generation('gen-last', { seq: 1690 }))

    const bench = await renderBench()
    await bench.shoot({ optionId: 'key:k-openai' })
    await bench.shoot({ optionId: 'key:k-openai' })
    expect(bench.host().results).toEqual([])

    expect(bench.host().buildSnapshot().results).toEqual([
      {
        assetId: 'gen-last',
        url: 'https://cdn.test/gen-last.png',
        label: buildGenerationDisplayName({ seq: 1690, prompt: 'malfoy' }),
        selected: true,
      },
    ])
  })
})
