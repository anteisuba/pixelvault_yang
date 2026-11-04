import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 图片卡发出去的那一路：真生成 hook（真 plan / 真提交 / 真轮询）、真模型选择器、真配 key
// 弹窗、真 key 名单。只假网络：提交 / 状态 / 取消三跳在 api-client 边界上假，
// key 存取与验证、角色库走 fakeServer。卡面其余行为在 ImageNodeV4.test.tsx。

vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${Object.values(values).join('/')}` : key,
      {
        has: () => true,
        rich: (key: string) => key,
        markup: (key: string) => key,
        raw: (key: string) => key,
      },
    ),
  useLocale: () => 'zh',
  useFormatter: () => ({
    number: (value: number) => String(value),
    dateTime: () => 'date',
    relativeTime: () => 'relative-time',
  }),
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src as string} alt="" />
  ),
}))

vi.mock('@xyflow/react', () => ({
  useNodeId: () => 'node-1',
  useStore: <T,>(
    selector: (state: { transform: [number, number, number] }) => T,
  ) => selector({ transform: [0, 0, 1] }),
  Handle: () => <span data-testid="handle" />,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? <div>{props.children as ReactNode}</div> : null,
}))

/** key 名单按登录用户缓存：每一条用例换一个人，名单都重新拉一次。 */
const user = vi.hoisted(() => ({ seq: 0 }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: `image-gen-${user.seq}`,
  }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/canvas',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const api = vi.hoisted(() => ({
  studioGenerateAPI: vi.fn(),
  checkImageGenerationStatusAPI: vi.fn(),
  cancelGenerationsAPI: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  ...api,
}))

import { API_ENDPOINTS, IMAGE_GENERATION } from '@/constants/config'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { applyNodeMediaPatch } from '@/lib/node-media-patch'
import { FAKE_GENERATION } from '@/test/api-helpers'
import { runIdleTasksImmediately } from '@/test/api-keys'
import { fakeServer } from '@/test/app-harness'
import { stubBrowserObservers } from '@/test/fake-routes'
import type {
  NodeV4,
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

import { ImageNodeV4 } from './ImageNodeV4'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

const NOW = '2026-09-10T00:00:00.000Z'
const ok = (data: unknown) => Response.json({ success: true, data })

function option(
  optionId: string,
  modelId: string,
  adapterType: string,
  patch: Partial<NodeWorkflowModelOption> = {},
): NodeWorkflowModelOption {
  return {
    optionId,
    modelId,
    adapterType,
    providerConfig: {},
    requestCount: 0,
    sourceType: 'saved',
    ...patch,
  } as NodeWorkflowModelOption
}

const selection = (from: NodeWorkflowModelOption): NodeWorkflowModelSelection =>
  ({
    optionId: from.optionId,
    modelId: from.modelId,
    adapterType: from.adapterType,
    providerConfig: {},
    ...(from.apiKeyId ? { apiKeyId: from.apiKeyId } : {}),
  }) as NodeWorkflowModelSelection

/** 配好了 key 的那一条（发得出去）。 */
const GPT = option('opt_gpt', 'gpt-image-2', 'openai', { apiKeyId: 'key-gpt' })
const SEEDREAM_LITE = option('opt_lite', 'seedream-5.0-lite', 'fal', {
  apiKeyId: 'key-fal',
})

function imageNode(id: string, data: Record<string, unknown> = {}): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'reference',
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...data,
    },
  } as NodeV4
}

function harness(
  nodes: readonly NodeV4[],
  overrides: Partial<NodeV4CanvasContextValue> = {},
): NodeV4CanvasContextValue {
  return {
    nodes,
    edges: [],
    draggingFrom: null,
    changedNodeIds: [],
    expandedNodeId: null,
    selectedNodeIds: [],
    modelOptionsByKind: { image: [GPT] },
    onToggleExpanded: vi.fn(),
    onSelectSlotVersion: vi.fn(),
    onDisconnectSlot: vi.fn(),
    onFocusNode: vi.fn(),
    onEditText: vi.fn(),
    onDeriveFromText: vi.fn(),
    onSetPrompt: vi.fn(),
    readGraph() {
      return { nodes: this.nodes, edges: this.edges }
    },
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(),
    onTidyLayout: vi.fn(),
    onPlaceBeside: vi.fn(() => undefined),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  }
}

function Host({ children }: { children: ReactNode }) {
  return <ApiKeysProvider>{children}</ApiKeysProvider>
}

function renderImage(
  context: NodeV4CanvasContextValue,
  nodeId = 'i_1',
  selected = true,
) {
  const target = context.nodes.find((item) => item.id === nodeId)!
  return render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <ImageNodeV4 id={nodeId} data={target.data} selected={selected} />
    </NodeV4CanvasProvider>,
    { wrapper: Host },
  )
}

/**
 * 卡上的数据跟着 `onSetMedia` 走（宿主那一层把补丁真落到卡上）。`apply` = 落补丁的
 * 办法：默认浅合并；一次多张那几条用真的 `applyNodeMediaPatch`（带 url 的补丁追加一版）。
 */
function renderLive(
  data: Record<string, unknown> = {},
  {
    overrides = {},
    apply,
  }: {
    overrides?: Partial<NodeV4CanvasContextValue>
    apply?: (current: NodeV4['data'], patch: object) => NodeV4['data']
  } = {},
) {
  const onSetMedia = vi.fn()
  const onApplyOp = vi.fn()
  function Fixture() {
    const [node, setNode] = useState(
      imageNode('i_1', { prompt: '站台', model: selection(GPT), ...data }),
    )
    const context = harness([node], {
      selectedNodeIds: ['i_1'],
      onApplyOp,
      onSetMedia: (id, patch) => {
        onSetMedia(id, patch)
        setNode(
          (current) =>
            ({
              ...current,
              data: apply
                ? apply(current.data, patch)
                : { ...current.data, ...patch },
            }) as NodeV4,
        )
      },
      ...overrides,
    })
    return (
      <NodeV4CanvasProvider value={context}>
        {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
        <ImageNodeV4 id="i_1" data={node.data} selected />
      </NodeV4CanvasProvider>
    )
  }
  render(<Fixture />, { wrapper: Host })
  return {
    onSetMedia,
    onApplyOp,
    submit: () =>
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }),
  }
}

const card = () => document.querySelector('[data-node-kind="image"]')

/** 一个可以从外面放行的承诺（某一跳「迟迟不回」）。 */
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

const submitted = (jobId: string) => ({ success: true, data: { jobId } })
const completed = (jobId: string, url: string) => ({
  success: true,
  data: {
    jobId,
    status: 'COMPLETED',
    generation: { ...FAKE_GENERATION, id: `gen-${jobId}`, url },
  },
})

/** 最后一次提交出去的请求体。 */
const lastSubmit = () =>
  api.studioGenerateAPI.mock.lastCall?.[0] as
    | { modelId: string; freePrompt: string; referenceImages?: string[] }
    | undefined

let savedKeys: string[]

beforeEach(() => {
  user.seq += 1
  window.localStorage.clear()
  stubBrowserObservers()
  // key 名单挂上就拉（jsdom 没有空闲回调）。
  runIdleTasksImmediately()
  savedKeys = []
  api.studioGenerateAPI.mockReset()
  api.checkImageGenerationStatusAPI.mockReset()
  api.cancelGenerationsAPI.mockReset().mockResolvedValue({
    success: true,
    data: { cancelled: [], alreadyFinished: [], notFound: [] },
  })
  fakeServer()
    .on('GET', API_ENDPOINTS.API_KEYS, () => ok([]))
    .on('GET', API_ENDPOINTS.CHARACTER_CARDS, () => ok([]))
    // 配 key 弹窗：存 key → 回新 id；验证 → 可用。
    .on('POST', API_ENDPOINTS.API_KEYS, async (request) => {
      const body = (await request.json()) as { modelId: string }
      savedKeys.push(body.modelId)
      return ok({
        id: 'key-new',
        adapterType: 'fal',
        label: 'new',
        maskedKey: '••••',
        isActive: true,
        createdAt: NOW,
      })
    })
    .on(
      'POST',
      `${API_ENDPOINTS.API_KEYS}/:id/verify`,
      async (_request, { params }) =>
        ok({ id: (await params).id, status: 'available' }),
    )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('图片生成失败反馈', () => {
  it('提交尚未创建任务就失败时持久化并显示具体错误', async () => {
    const failure = {
      success: false as const,
      error: 'Reference image could not be read',
      errorCode: 'reference_image_unreachable',
      i18nKey: 'errors.generation.reference_image_unreachable',
    }
    api.studioGenerateAPI.mockResolvedValue(failure)
    const { submit, onSetMedia } = renderLive()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'generation.reference_image_unreachable',
    )
    expect(onSetMedia).toHaveBeenCalledWith('i_1', {
      mediaJobId: undefined,
      generationFailure: {
        error: failure.error,
        errorCode: failure.errorCode,
        i18nKey: failure.i18nKey,
      },
    })
    expect(card()).toHaveAttribute('data-generating', 'false')
  })

  it('未识别的服务端错误仍显示原有具体原因', async () => {
    api.studioGenerateAPI.mockResolvedValue({
      success: false,
      error: 'Execution dispatch outcome unknown',
    })
    const { submit } = renderLive()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Execution dispatch outcome unknown',
    )
  })

  it('刷新恢复的错误保持可见并保留此前图片', () => {
    renderImage(
      harness([
        imageNode('i_1', {
          url: 'https://cdn.test/previous.png',
          generationFailure: { error: 'Execution dispatch outcome unknown' },
        }),
      ]),
      'i_1',
      false,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Execution dispatch outcome unknown',
    )
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.test/previous.png',
    )
  })

  it('没选模型（画布上也没有可用的）：不提交，显示选模型提示', async () => {
    const { submit } = renderLive(
      { model: undefined },
      { overrides: { modelOptionsByKind: {} } },
    )
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'generateDesk.noModel',
    )
    expect(api.studioGenerateAPI).not.toHaveBeenCalled()
  })

  it('轮询窗口过了服务器仍在跑：保留任务，不显示失败', async () => {
    vi.useFakeTimers()
    api.studioGenerateAPI.mockResolvedValue(submitted('job-pending'))
    api.checkImageGenerationStatusAPI.mockResolvedValue({
      success: true,
      data: { jobId: 'job-pending', status: 'IN_PROGRESS' },
    })
    const { submit, onSetMedia } = renderLive()
    submit()
    for (let i = 0; i <= IMAGE_GENERATION.MAX_POLL_ATTEMPTS; i += 1) {
      await act(() =>
        vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS),
      )
    }
    expect(api.checkImageGenerationStatusAPI).toHaveBeenCalledTimes(
      IMAGE_GENERATION.MAX_POLL_ATTEMPTS,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSetMedia).toHaveBeenLastCalledWith('i_1', {
      mediaJobId: 'job-pending',
    })
    expect(card()).toHaveAttribute('data-generating', 'true')
  })

  it('服务器确认取消后清理任务，不把取消显示成生成失败', async () => {
    api.studioGenerateAPI.mockResolvedValue(submitted('job-cancelled'))
    api.checkImageGenerationStatusAPI.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-cancelled',
        status: 'CANCELLED',
        error: 'Node media generation failed',
      },
    })
    const { submit, onSetMedia } = renderLive()
    submit()
    await waitFor(() =>
      expect(onSetMedia).toHaveBeenLastCalledWith('i_1', {
        mediaJobId: undefined,
        generationFailure: undefined,
      }),
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(card()).toHaveAttribute('data-generating', 'false')
  })

  it('再次提交立即清除旧失败状态', () => {
    api.studioGenerateAPI.mockReturnValue(new Promise(() => {}))
    const { submit, onSetMedia } = renderLive({
      generationFailure: { error: 'previous failure' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('previous failure')
    submit()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSetMedia).toHaveBeenCalledWith('i_1', {
      generationFailure: undefined,
    })
  })

  it('本地取消后迟到的失败不再显示或持久化为生成失败', async () => {
    const late = deferred<unknown>()
    api.studioGenerateAPI.mockReturnValue(late.promise)
    const { submit, onSetMedia } = renderLive()
    submit()
    await waitFor(() => expect(api.studioGenerateAPI).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    await act(async () =>
      late.resolve({ success: false, error: 'late provider failure' }),
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      onSetMedia.mock.calls.every(
        ([, patch]) =>
          !(patch as { generationFailure?: unknown }).generationFailure,
      ),
    ).toBe(true)
    expect(card()).toHaveAttribute('data-generating', 'false')
  })
})

describe('发送', () => {
  it('回车 = 生成新版本：先落提示词，再按卡上的模型发出去', async () => {
    api.studioGenerateAPI.mockReturnValue(new Promise(() => {}))
    const context = harness(
      [
        imageNode('i_1', {
          url: 'https://cdn.test/a.png',
          prompt: '站台',
          model: selection(GPT),
        }),
      ],
      { selectedNodeIds: ['i_1'] },
    )
    renderImage(context)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '站台，夜' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(context.onSetPrompt).toHaveBeenCalledWith('i_1', '站台，夜')
    await waitFor(() =>
      expect(lastSubmit()).toMatchObject({
        modelId: 'gpt-image-2',
        apiKeyId: 'key-gpt',
        freePrompt: '站台，夜',
      }),
    )
  })

  it('发送读 op 之后的图：刚 @ 出来的参考连线这一枪就带上', async () => {
    api.studioGenerateAPI.mockReturnValue(new Promise(() => {}))
    const shot = imageNode('i_1', {
      subtype: 'shot',
      prompt: '站台',
      model: selection(GPT),
    })
    const ref = imageNode('i_ref', { url: 'https://cdn.test/ref.png' })
    // 渲染时画布上还没有这张参考、也没有这条线：都是那句 `set_prompt` 刚落下来的。
    const context = harness([shot], { selectedNodeIds: ['i_1'] })
    context.readGraph = () => ({
      nodes: [shot, ref],
      edges: [
        {
          id: 'e_mention',
          source: 'i_ref',
          sourceHandle: 'out',
          target: 'i_1',
          slot: NODE_SLOT_IDS.reference,
        },
      ],
    })
    renderImage(context)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '站台 @i_ref' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(lastSubmit()?.referenceImages).toEqual([
        'https://cdn.test/ref.png',
      ]),
    )
  })

  it('取消 = 这一批在飞的几单一起向服务端取消，各自的在飞标记摘掉', async () => {
    // 三张一批：前两单的 job 马上回来，第三单的 id 晚到。
    const third = deferred<unknown>()
    api.studioGenerateAPI
      .mockResolvedValueOnce(submitted('job_1'))
      .mockResolvedValueOnce(submitted('job_2'))
      .mockReturnValueOnce(third.promise)
    api.checkImageGenerationStatusAPI.mockReturnValue(new Promise(() => {}))
    const { submit, onSetMedia } = renderLive({ params: { count: 3 } })
    submit()
    await waitFor(() =>
      expect(onSetMedia).toHaveBeenCalledWith('i_1', { addBatchJob: 'job_2' }),
    )
    expect(onSetMedia).toHaveBeenCalledWith('i_1', { addBatchJob: 'job_1' })

    fireEvent.click(
      document.querySelector('[data-prompt-bar-cancel]') as HTMLElement,
    )
    expect(api.cancelGenerationsAPI).toHaveBeenCalledWith(['job_1', 'job_2'])
    expect(onSetMedia).toHaveBeenCalledWith('i_1', { settleBatchJob: 'job_1' })
    expect(onSetMedia).toHaveBeenCalledWith('i_1', { settleBatchJob: 'job_2' })

    // job id 晚回来的那一单：一到手就补一刀。
    await act(async () => third.resolve(submitted('job_3')))
    expect(api.cancelGenerationsAPI).toHaveBeenLastCalledWith(['job_3'])
  })

  it('收起时的草稿进入画中框，画中框编辑后走同一条生成路径', async () => {
    api.studioGenerateAPI.mockReturnValue(new Promise(() => {}))
    const node = imageNode('i_1', {
      subtype: 'shot',
      url: 'https://cdn.test/a.png',
      prompt: '原始提示词',
      model: selection(GPT),
    })
    const context = harness([node], { selectedNodeIds: ['i_1'] })
    const view = renderImage(context)
    fireEvent.change(document.querySelector('[data-prompt-bar-input]')!, {
      target: { value: '收起时输入的新内容' },
    })
    view.rerender(
      <NodeV4CanvasProvider value={{ ...context, expandedNodeId: 'i_1' }}>
        {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
        <ImageNodeV4 id="i_1" data={node.data} selected />
      </NodeV4CanvasProvider>,
    )
    const editor = document.querySelector(
      '[data-image-frame-body] [role="textbox"]',
    ) as HTMLElement
    expect(editor).toHaveTextContent('收起时输入的新内容')
    editor.textContent = '画中框继续输入'
    fireEvent.input(editor)
    fireEvent.click(document.querySelector('[data-image-regenerate]')!)
    await waitFor(() => expect(lastSubmit()?.freePrompt).toBe('画中框继续输入'))
  })
})

/** 点开真模型选择器，挑 `modelId` 那一行。 */
async function pickModel(modelId: string) {
  fireEvent.click(document.querySelector('[data-model-chip]')!)
  const row = await waitFor(() => {
    const found = document.querySelector(
      `[role="option"][data-model-key="${modelId}"]`,
    )
    expect(found).not.toBeNull()
    return found as HTMLElement
  })
  fireEvent.click(row)
}

/** 真配 key 弹窗：填一把 key，点验证。 */
function verifyKeyInDialog() {
  fireEvent.change(screen.getByLabelText('step2'), {
    target: { value: 'test-key-value-123' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'verify' }))
}

describe('模型 chip 与缺 key 闸', () => {
  it('模型 chip 单选：选中回落 onSetModel', async () => {
    const context = harness(
      [
        imageNode('i_1', {
          url: 'https://cdn.test/a.png',
          model: selection(GPT),
        }),
      ],
      {
        selectedNodeIds: ['i_1'],
        modelOptionsByKind: { image: [GPT, SEEDREAM_LITE] },
      },
    )
    renderImage(context)
    await pickModel('seedream-5.0-lite')
    expect(context.onSetModel).toHaveBeenCalledWith(
      'i_1',
      expect.objectContaining({
        optionId: 'opt_lite',
        modelId: 'seedream-5.0-lite',
      }),
    )
  })

  it('新空卡用可用的默认模型：发送时落库，这一枪也用它', async () => {
    api.studioGenerateAPI.mockReturnValue(new Promise(() => {}))
    const missing = option('opt_missing', 'gpt-image-2', 'openai', {
      sourceType: 'workspace',
    })
    const context = harness([imageNode('i_1', { prompt: '山间晨雾' })], {
      selectedNodeIds: ['i_1'],
      modelOptionsByKind: { image: [missing, SEEDREAM_LITE] },
    })
    renderImage(context)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(context.onSetModel).toHaveBeenCalledWith(
      'i_1',
      expect.objectContaining({ optionId: 'opt_lite' }),
    )
    await waitFor(() =>
      expect(lastSubmit()).toMatchObject({
        modelId: 'seedream-5.0-lite',
        apiKeyId: 'key-fal',
      }),
    )
  })

  it('型号缺 key：发送不出图，就地弹配置；验证过才发（Hard Rule 8）', async () => {
    api.studioGenerateAPI.mockReturnValue(new Promise(() => {}))
    const missing = option('opt_missing', 'seedream-5.0-lite', 'fal', {
      sourceType: 'workspace',
    })
    const context = harness(
      [imageNode('i_1', { prompt: '山间晨雾', model: selection(missing) })],
      { selectedNodeIds: ['i_1'], modelOptionsByKind: { image: [missing] } },
    )
    const { container } = renderImage(context)
    // key 名单回来之后才判得出「缺 key」（回来之前是不知道，⛔ 当成缺）。
    await waitFor(() =>
      expect(
        container.querySelector('[data-image-send-readout="missing-key"]'),
      ).not.toBeNull(),
    )
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    await screen.findByRole('dialog')
    expect(api.studioGenerateAPI).not.toHaveBeenCalled()

    verifyKeyInDialog()
    await waitFor(() => expect(api.studioGenerateAPI).toHaveBeenCalledTimes(1))
    expect(savedKeys).toEqual(['seedream-5.0-lite'])
    expect(lastSubmit()?.modelId).toBe('seedream-5.0-lite')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  /** Seedream 5.0 Pro 在 fal / 火山两家各一条。 */
  const seedreamChannels = (volcKey: boolean) => [
    option('opt_fal', 'seedream-5.0-pro', 'fal', { sourceType: 'workspace' }),
    option('opt_volc', 'seedream-5.0-pro-volcengine', 'volcengine', {
      sourceType: 'workspace',
      ...(volcKey ? { providerKeyId: 'pk_volc' } : {}),
    }),
  ]

  it('卡上那家没 key、同型号另一家配好了：发送键旁提示改走，点一下才切', async () => {
    const [fal] = seedreamChannels(true)
    const context = harness(
      [imageNode('i_1', { prompt: '山间晨雾', model: selection(fal!) })],
      {
        selectedNodeIds: ['i_1'],
        modelOptionsByKind: { image: seedreamChannels(true) },
      },
    )
    const { container } = renderImage(context)
    const hint = await waitFor(() => {
      const found = container.querySelector(
        '[data-image-send-readout="switch-channel"]',
      )
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    // 没点之前卡上那家不动 —— ⛔ 偷偷换厂商。
    expect(context.onSetModel).not.toHaveBeenCalled()
    fireEvent.click(hint)
    expect(context.onSetModel).toHaveBeenCalledWith(
      'i_1',
      expect.objectContaining({ optionId: 'opt_volc' }),
    )
    expect(api.studioGenerateAPI).not.toHaveBeenCalled()
  })

  it('多厂商一家都没配：弹窗里挑配哪家，验证过这一枪走那一家', async () => {
    api.studioGenerateAPI.mockReturnValue(new Promise(() => {}))
    const [fal] = seedreamChannels(false)
    const context = harness(
      [imageNode('i_1', { prompt: '山间晨雾', model: selection(fal!) })],
      {
        selectedNodeIds: ['i_1'],
        modelOptionsByKind: { image: seedreamChannels(false) },
      },
    )
    const { container } = renderImage(context)
    await waitFor(() =>
      expect(
        container.querySelector('[data-image-send-readout="missing-key"]'),
      ).not.toBeNull(),
    )
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    await screen.findByRole('dialog')
    expect(
      document.querySelector('[data-quick-setup-channel="opt_fal"]'),
    ).not.toBeNull()
    fireEvent.click(
      document.querySelector('[data-quick-setup-channel="opt_volc"]')!,
    )
    expect(
      document.querySelector('[data-quick-setup-channel="opt_volc"]'),
    ).toHaveAttribute('aria-checked', 'true')

    verifyKeyInDialog()
    await waitFor(() =>
      expect(lastSubmit()?.modelId).toBe('seedream-5.0-pro-volcengine'),
    )
    // key 存在挑的那一家名下；卡也落到那一家。
    expect(savedKeys).toEqual(['seedream-5.0-pro-volcengine'])
    expect(context.onSetModel).toHaveBeenCalledWith(
      'i_1',
      expect.objectContaining({ optionId: 'opt_volc' }),
    )
  })
})

describe('一次多张 = 进版本，出完 2×2 挑一张（spec §3 A1）', () => {
  let minted = 0
  /** 回填走真的 `applyNodeMediaPatch`：带 url 的补丁追加一版。 */
  function renderBatch(count: number) {
    minted = 0
    return renderLive(
      { url: 'https://cdn.test/old.png', params: { count } },
      {
        apply: (current, patch) =>
          applyNodeMediaPatch(current as never, patch as never, {
            now: NOW,
            mintId: () => `v_${(minted += 1)}`,
          }) as NodeV4['data'],
      },
    )
  }

  /** 每一单一个 job，状态那一跳按 job 各自放行。 */
  function jobsFinishOnDemand(count: number) {
    const status = new Map<string, ReturnType<typeof deferred<unknown>>>()
    for (let index = 1; index <= count; index += 1) {
      status.set(`job_${index}`, deferred())
    }
    let next = 0
    api.studioGenerateAPI.mockImplementation(async () =>
      submitted(`job_${(next += 1)}`),
    )
    api.checkImageGenerationStatusAPI.mockImplementation(
      (jobId: string) => status.get(jobId)!.promise,
    )
    return (jobId: string, url: string) =>
      act(async () => status.get(jobId)!.resolve(completed(jobId, url)))
  }

  it('出图中版本条末尾是还没回来的占位，出完卡面铺成挑图', async () => {
    const finish = jobsFinishOnDemand(2)
    const { submit, onApplyOp } = renderBatch(2)
    act(() => submit())
    expect(
      document.querySelectorAll('[data-version-thumb-pending]'),
    ).toHaveLength(2)
    await waitFor(() =>
      expect(api.checkImageGenerationStatusAPI).toHaveBeenCalledTimes(2),
    )

    await finish('job_2', 'https://cdn.test/a.png')
    expect(
      document.querySelectorAll('[data-version-thumb-pending]'),
    ).toHaveLength(1)
    await finish('job_1', 'https://cdn.test/b.png')

    await waitFor(() =>
      expect(document.querySelector('[data-image-batch-pick]')).not.toBeNull(),
    )
    expect(document.querySelectorAll('[data-version-thumb]')).toHaveLength(3)
    const choices = document.querySelectorAll('[data-image-batch-pick-option]')
    // 旧图是第 0 版，这一批落在第 1、2 版。
    expect(
      Array.from(choices, (item) =>
        item.getAttribute('data-image-batch-pick-option'),
      ),
    ).toEqual(['1', '2'])
    fireEvent.click(choices[0] as HTMLElement)
    expect(onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: 'i_1',
      index: 1,
    })
    expect(document.querySelector('[data-image-batch-pick]')).toBeNull()
  })

  it('Esc = 保持最新一张，挑图收起、不切版本', async () => {
    api.studioGenerateAPI
      .mockResolvedValueOnce(submitted('job_1'))
      .mockResolvedValueOnce(submitted('job_2'))
    api.checkImageGenerationStatusAPI.mockImplementation(
      async (jobId: string) =>
        completed(jobId, `https://cdn.test/${jobId}.png`),
    )
    const { submit, onApplyOp } = renderBatch(2)
    submit()
    const pick = await waitFor(() => {
      const found = document.querySelector('[data-image-batch-pick]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    fireEvent.keyDown(pick, { key: 'Escape' })
    expect(document.querySelector('[data-image-batch-pick]')).toBeNull()
    expect(onApplyOp).not.toHaveBeenCalled()
  })

  it('只出一张不挑图', async () => {
    api.studioGenerateAPI.mockResolvedValue(submitted('job_1'))
    api.checkImageGenerationStatusAPI.mockResolvedValue(
      completed('job_1', 'https://cdn.test/a.png'),
    )
    const { submit, onSetMedia } = renderBatch(1)
    submit()
    await waitFor(() =>
      expect(onSetMedia).toHaveBeenCalledWith(
        'i_1',
        expect.objectContaining({ url: 'https://cdn.test/a.png' }),
      ),
    )
    await waitFor(() =>
      expect(card()).toHaveAttribute('data-generating', 'false'),
    )
    expect(document.querySelector('[data-image-batch-pick]')).toBeNull()
  })
})
