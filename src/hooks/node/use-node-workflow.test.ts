import { act, renderHook, waitFor } from '@testing-library/react'
import type { Connection } from '@xyflow/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getNodeStudioWorkflowStorageKey,
  NODE_STUDIO_AGENT_MODE_IDS,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NodeWorkflowStorageSchema } from '@/types/node-workflow'
import type { CanvasDerivedImageOutput } from '@/types/canvas-image-edit'
import type { ScriptBreakdownResult } from '@/types/script-breakdown'

import {
  SERVER_WRITE_DEBOUNCE_MS,
  SERVER_WRITE_OPERATIONS,
  useNodeWorkflow,
} from './use-node-workflow'

// The hook only reaches for i18n + toast on one path: the alarm it raises
// when localStorage persistence stops working. `translate` is created once
// inside the factory (not per call) so the hook's identity-stable reporter
// callback really is stable — an unstable `t` would re-run the hydrate
// effect on every render.
vi.mock('next-intl', () => {
  const translate = (key: string) => key
  return { useTranslations: () => translate }
})

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }))

const loggerErrorMock = vi.hoisted(() => vi.fn())
const loggerWarnMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: loggerWarnMock,
    error: loggerErrorMock,
  },
}))

/**
 * Make every `localStorage.setItem` throw the DOMException browsers use for
 * "you are out of quota". jsdom's storage is unbounded, so the only way to
 * exercise the overflow path is to inject the throw.
 */
function stubQuotaExceededStorage(errorName = 'QuotaExceededError') {
  const setItem = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      const error = new Error('Storage quota exceeded')
      error.name = errorName
      throw error
    })
  return setItem
}

const FIRST_POSITION = { x: 20, y: 40 }
const SECOND_POSITION = { x: 220, y: 40 }
const MOVED_POSITION = { x: 80, y: 120 }
const DEFAULT_PROJECT_NAME = 'Untitled project'
const TEST_CLERK_ID = 'user_test_clerk_1'
const OTHER_CLERK_ID = 'user_test_clerk_2'
const TEST_STORAGE_KEY = getNodeStudioWorkflowStorageKey(TEST_CLERK_ID)
const TEST_CANVAS_APPEARANCE = {
  backgroundColor: '#171A16',
  image: {
    url: 'https://cdn.example.com/canvas-wallpaper.jpg',
    sourceGenerationId: 'generation-wallpaper-1',
    fit: 'cover' as const,
    opacity: 0.35,
  },
}

const FAKE_BREAKDOWN: ScriptBreakdownResult = {
  title: 'Quiet Orbit',
  logline: 'A cartographer maps a silent moon before sunrise.',
  referenceIntent: 'Soft cinematic sci-fi with warm practical light.',
  copyRisk: 'low',
  characters: [
    {
      id: 'char-1',
      label: 'Lead',
      nameSuggestion: 'Mira',
      role: 'Cartographer',
      functionInStory: 'Maps the moon route.',
      personality: 'Patient and observant.',
      visualSeed: 'weathered explorer in amber field jacket',
      goal: 'Find the hidden landing path.',
    },
    {
      id: 'char-2',
      label: 'Guide',
      nameSuggestion: 'Sol',
      role: 'Signal keeper',
      functionInStory: 'Guards the route beacon.',
      personality: 'Measured and dryly funny.',
      visualSeed: 'silver-haired signal keeper with prism lantern',
      goal: 'Keep the beacon alive.',
    },
  ],
  scenes: [
    {
      id: 'scene-1',
      label: 'Moon Ridge',
      summary: 'Mira studies a luminous ridge.',
      location: 'Lunar plateau',
      timeOfDay: 'Dawn',
      mood: 'Quiet resolve',
    },
  ],
  actions: [
    {
      id: 'action-1',
      sceneId: 'scene-1',
      label: 'Trace route',
      description: 'Mira traces a route across the glowing dust.',
    },
  ],
  beats: [
    {
      id: 'beat-1',
      sceneId: 'scene-1',
      label: 'Discovery',
      emotionalTurn: 'Doubt becomes focus.',
      description: 'The map reveals a hidden pass.',
    },
  ],
  shots: [
    {
      id: 'shot-1',
      sceneId: 'scene-1',
      beatId: 'beat-1',
      label: 'Wide ridge',
      camera: 'Slow lateral move',
      composition: 'Tiny figure against a broad glowing horizon',
      promptSeed: 'wide lunar ridge at dawn with amber light',
    },
  ],
}

function renderNodeWorkflowHook(clerkId: string | null = TEST_CLERK_ID) {
  return renderHook(() =>
    useNodeWorkflow({
      defaultProjectName: DEFAULT_PROJECT_NAME,
      clerkId,
    }),
  )
}

function readStoredStorage(clerkId: string = TEST_CLERK_ID) {
  const raw = window.localStorage.getItem(
    getNodeStudioWorkflowStorageKey(clerkId),
  )
  expect(raw).not.toBeNull()
  return NodeWorkflowStorageSchema.parse(JSON.parse(raw ?? '{}') as unknown)
}

function readStoredCurrentState() {
  const storage = readStoredStorage()
  const currentProject = storage.projects.find(
    (project) => project.id === storage.currentProjectId,
  )

  expect(currentProject).toBeDefined()
  return currentProject?.state ?? { nodes: [], edges: [] }
}

// ── Server-write test rig ────────────────────────────────────────────────
// The hook talks to the server through `fetch`, so these helpers route the
// calls by method: GET = the hydration list, PUT = the debounced state push,
// POST = create/activate. Every call is recorded (url + method + parsed body)
// so a test can assert on what did — or crucially, did NOT — go up.

interface RecordedFetchCall {
  url: string
  method: string
  body: Record<string, unknown> | undefined
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serverProjectRecord(
  overrides: Partial<{
    id: string
    name: string
    state: { nodes: unknown[]; edges: unknown[] }
  }> = {},
) {
  return {
    id: 'srv_project_1',
    userId: 'db_user_1',
    name: 'Server project',
    state: { nodes: [], edges: [] },
    lastActiveAt: '2026-08-25T00:00:00.000Z',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

const HYDRATED_NODE = {
  id: 'node-hydrated',
  type: NODE_TYPE_IDS.shotText,
  position: FIRST_POSITION,
  data: {
    prompt: 'Hydrated prompt',
    status: NODE_STATUS_IDS.idle,
  },
}

interface ServerFetchHandlers {
  list: () => Response
  put?: () => Response
  /** POST /projects — create + the one-time local→server migration. */
  post?: () => Response
  /** POST /projects/:id/activate — the `lastActiveAt` pointer bump. */
  activate?: () => Response
}

function stubServerFetch(handlers: ServerFetchHandlers) {
  const calls: RecordedFetchCall[] = []
  const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const rawBody = init?.body
    calls.push({
      url: String(input),
      method,
      body:
        typeof rawBody === 'string'
          ? (JSON.parse(rawBody) as Record<string, unknown>)
          : undefined,
    })
    if (method === 'PUT') {
      return Promise.resolve(
        handlers.put?.() ?? jsonResponse({ success: true, data: null }),
      )
    }
    if (method === 'POST') {
      const handler = String(input).endsWith('/activate')
        ? (handlers.activate ?? handlers.post)
        : handlers.post
      return Promise.resolve(
        handler?.() ?? jsonResponse({ success: true, data: null }),
      )
    }
    return Promise.resolve(handlers.list())
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    calls,
    putCalls: () => calls.filter((call) => call.method === 'PUT'),
    createCalls: () =>
      calls.filter(
        (call) => call.method === 'POST' && !call.url.endsWith('/activate'),
      ),
    listCalls: () => calls.filter((call) => call.method === 'GET'),
  }
}

/** Render the hook and wait for the whole hydrate pipeline to settle. */
async function renderHydratedHook(handlers: ServerFetchHandlers) {
  const rig = stubServerFetch(handlers)
  const { result } = renderNodeWorkflowHook()
  await waitFor(() => expect(result.current.isHydrated).toBe(true))
  return { result, ...rig }
}

/**
 * Run one canvas mutation and let its debounced server write fire.
 *
 * ⚠ Fake timers must be installed **before** the mutation: the write effect
 * schedules its `setTimeout` while re-running, so a timer registered under
 * real timers can never be advanced by `vi.advanceTimersByTime`. Hydration
 * still runs on real timers (it needs `Response.json()` to resolve), which is
 * why this is a helper and not a `beforeEach`.
 */
/**
 * Only the *server* persist failures — `loggerErrorMock` also collects the
 * localStorage alarm, and mixing the two would make the counts meaningless.
 */
function serverPersistErrorCalls() {
  return loggerErrorMock.mock.calls.filter(
    ([message]) => message === '[node-workflow] server persist failed',
  )
}

function mutateAndFlushServerWrite(mutate: () => void) {
  vi.useFakeTimers()
  act(() => {
    mutate()
  })
  act(() => {
    vi.advanceTimersByTime(SERVER_WRITE_DEBOUNCE_MS)
  })
  vi.useRealTimers()
}

beforeEach(() => {
  window.localStorage.clear()
  toastErrorMock.mockClear()
  loggerErrorMock.mockClear()
  loggerWarnMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('useNodeWorkflow', () => {
  it('exposes hydration only after the active user server hydrate completes', async () => {
    let resolveFirst: (response: Response) => void = () => undefined
    let resolveSecond: (response: Response) => void = () => undefined
    let resolveThird: (response: Response) => void = () => undefined
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve
    })
    const thirdResponse = new Promise<Response>((resolve) => {
      resolveThird = resolve
    })
    // ⚠ 这三次调用被当成「三次 list」一一对应。所以每次都必须让服务端**返回
    // 一个项目**：返回空会触发 bootstrap 迁移（POST 建行 + refetch），调用序号
    // 立刻错位，而这条测试要验的只是 `isHydrated` 的翻转时机。
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => secondResponse)
      .mockImplementationOnce(() => thirdResponse)
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ clerkId }: { clerkId: string | null }) =>
        useNodeWorkflow({
          defaultProjectName: DEFAULT_PROJECT_NAME,
          clerkId,
        }),
      {
        initialProps: {
          clerkId: TEST_CLERK_ID,
        } as { clerkId: string | null },
      },
    )

    expect(result.current.isHydrated).toBe(false)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    act(() => {
      resolveFirst(
        new Response(
          JSON.stringify({ success: true, data: [serverProjectRecord()] }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
    })
    await waitFor(() => expect(result.current.isHydrated).toBe(true))

    rerender({ clerkId: OTHER_CLERK_ID })
    expect(result.current.isHydrated).toBe(false)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    act(() => {
      resolveSecond(
        new Response(
          JSON.stringify({ success: true, data: [serverProjectRecord()] }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
    })
    await waitFor(() => expect(result.current.isHydrated).toBe(true))

    rerender({ clerkId: null })
    expect(result.current.isHydrated).toBe(false)

    rerender({ clerkId: TEST_CLERK_ID })
    expect(result.current.isHydrated).toBe(false)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    act(() => {
      resolveThird(
        new Response(
          JSON.stringify({ success: true, data: [serverProjectRecord()] }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
    })
    await waitFor(() => expect(result.current.isHydrated).toBe(true))
  })

  it('starts with an empty workflow when localStorage is empty', async () => {
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
    expect(result.current.currentProjectName).toBe(DEFAULT_PROJECT_NAME)
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.canvasAppearance).toBeUndefined()
    expect(result.current.state).not.toHaveProperty('canvasAppearance')
  })

  it('adds a composer node with default data', () => {
    const { result } = renderNodeWorkflowHook()

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0]).toMatchObject({
      id: nodeId,
      type: NODE_TYPE_IDS.composer,
      position: FIRST_POSITION,
      data: {
        prompt: '',
        status: NODE_STATUS_IDS.idle,
      },
    })
  })

  it('adds an agent node with default data', () => {
    const { result } = renderNodeWorkflowHook()

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
    })

    expect(result.current.nodes[0]).toMatchObject({
      type: NODE_TYPE_IDS.agent,
      position: SECOND_POSITION,
      data: {
        prompt: '',
        agentMode: NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown,
        status: NODE_STATUS_IDS.idle,
      },
    })
  })

  it('adds a character image node with choice-mode defaults', () => {
    const { result } = renderNodeWorkflowHook()

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.characterImage, SECOND_POSITION)
    })

    expect(result.current.nodes[0]).toMatchObject({
      type: NODE_TYPE_IDS.characterImage,
      position: SECOND_POSITION,
      data: {
        prompt: '',
        status: NODE_STATUS_IDS.idle,
        generationStatus: NODE_GENERATION_STATUS_IDS.idle,
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
        referenceAssets: [],
        loras: [],
      },
    })
  })

  it.each([
    [NODE_TYPE_IDS.shotText, NODE_MEDIA_KIND_IDS.text, undefined],
    [
      NODE_TYPE_IDS.shot,
      NODE_MEDIA_KIND_IDS.image,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
    [
      NODE_TYPE_IDS.backgroundImage,
      NODE_MEDIA_KIND_IDS.image,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
    [
      NODE_TYPE_IDS.frameImage,
      NODE_MEDIA_KIND_IDS.image,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
    [
      NODE_TYPE_IDS.voice,
      NODE_MEDIA_KIND_IDS.audio,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
    [
      NODE_TYPE_IDS.seedance,
      NODE_MEDIA_KIND_IDS.video,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
  ] satisfies Array<
    [
      NodeWorkflowNodeType,
      (typeof NODE_MEDIA_KIND_IDS)[keyof typeof NODE_MEDIA_KIND_IDS],
      typeof NODE_GENERATION_STATUS_IDS.idle | undefined,
    ]
  >)(
    'adds %s node with media defaults',
    (type, mediaKind, generationStatus) => {
      const { result } = renderNodeWorkflowHook()

      act(() => {
        result.current.addNode(type, SECOND_POSITION)
      })

      expect(result.current.nodes[0]).toMatchObject({
        type,
        position: SECOND_POSITION,
        data: {
          prompt: '',
          status: NODE_STATUS_IDS.idle,
          mediaKind,
        },
      })
      expect(result.current.nodes[0]?.data.generationStatus).toBe(
        generationStatus,
      )
    },
  )

  it('updates node data without replacing unrelated node fields', () => {
    const { result } = renderNodeWorkflowHook()

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      result.current.updateNodeData(nodeId, { prompt: 'A quiet studio' })
    })

    expect(result.current.nodes[0]?.position).toEqual(FIRST_POSITION)
    expect(result.current.nodes[0]?.data.prompt).toBe('A quiet studio')
    expect(result.current.nodes[0]?.data.status).toBe(NODE_STATUS_IDS.idle)
  })

  it('stores an existing image output on a character image node', () => {
    const { result } = renderNodeWorkflowHook()

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(
        NODE_TYPE_IDS.characterImage,
        FIRST_POSITION,
      )
      result.current.updateNodeData(nodeId, {
        generationId: 'generation-existing',
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        imageUrl: 'https://cdn.example.com/existing.png',
        sourceGenerationId: 'generation-existing',
        sourceLabel: 'Existing portrait',
        status: NODE_STATUS_IDS.done,
      })
    })

    expect(result.current.nodes[0]?.data).toMatchObject({
      generationId: 'generation-existing',
      generationStatus: NODE_GENERATION_STATUS_IDS.success,
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
      imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
      imageUrl: 'https://cdn.example.com/existing.png',
      sourceGenerationId: 'generation-existing',
      sourceLabel: 'Existing portrait',
      status: NODE_STATUS_IDS.done,
    })
  })

  it('places one derived image to the source right without replacing the source', () => {
    const { result } = renderNodeWorkflowHook()

    let sourceId = ''
    let derivedIds: string[] = []
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.image, FIRST_POSITION)
      result.current.updateNodeData(sourceId, {
        generationId: 'generation-source',
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        mediaUrl: 'https://cdn.example.com/source.png',
        mediaLabel: 'Source image',
        status: NODE_STATUS_IDS.done,
      })
    })
    const sourceBefore = result.current.nodes[0]

    act(() => {
      derivedIds = result.current.placeDerivedImages(sourceId, [
        {
          imageUrl: 'https://cdn.example.com/upscaled.png',
          width: 2048,
          height: 2048,
          generationId: 'generation-derived',
          label: 'Upscaled image',
          editCapability: 'upscale',
        },
      ])
    })

    expect(derivedIds).toHaveLength(1)
    expect(result.current.nodes.find((node) => node.id === sourceId)).toEqual(
      sourceBefore,
    )
    expect(
      result.current.nodes.find((node) => node.id === derivedIds[0]),
    ).toMatchObject({
      type: NODE_TYPE_IDS.image,
      position: {
        x: FIRST_POSITION.x + NODE_STUDIO_NODE_PLACEMENT.derivedImage.offsetX,
        y: FIRST_POSITION.y,
      },
      data: {
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        mediaUrl: 'https://cdn.example.com/upscaled.png',
        mediaWidth: 2048,
        mediaHeight: 2048,
        generationId: 'generation-derived',
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        derivedFromNodeId: sourceId,
        derivedFromGenerationId: 'generation-source',
        editCapability: 'upscale',
        status: NODE_STATUS_IDS.done,
      },
    })
  })

  it('fans out a derived image batch and removes the full batch with one undo', () => {
    const { result } = renderNodeWorkflowHook()

    let sourceId = ''
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.image, FIRST_POSITION)
      result.current.updateNodeData(sourceId, {
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        mediaUrl: 'https://cdn.example.com/source.png',
        status: NODE_STATUS_IDS.done,
      })
    })

    let derivedIds: string[] = []
    act(() => {
      derivedIds = result.current.placeDerivedImages(
        sourceId,
        Array.from({ length: 4 }, (_, index) => ({
          imageUrl: `https://cdn.example.com/layer-${index + 1}.png`,
          label: `Layer ${index + 1}`,
          editCapability: 'extract-element' as const,
        })),
      )
    })

    const placement = NODE_STUDIO_NODE_PLACEMENT.derivedImage
    expect(derivedIds).toHaveLength(4)
    expect(
      result.current.nodes
        .filter((node) => derivedIds.includes(node.id))
        .map((node) => node.position),
    ).toEqual([
      { x: FIRST_POSITION.x + placement.offsetX, y: FIRST_POSITION.y },
      {
        x: FIRST_POSITION.x + placement.offsetX + placement.columnOffsetX,
        y: FIRST_POSITION.y,
      },
      {
        x: FIRST_POSITION.x + placement.offsetX + placement.columnOffsetX * 2,
        y: FIRST_POSITION.y,
      },
      {
        x: FIRST_POSITION.x + placement.offsetX,
        y: FIRST_POSITION.y + placement.rowOffsetY,
      },
    ])

    act(() => {
      result.current.undo()
    })

    expect(result.current.nodes.map((node) => node.id)).toEqual([sourceId])
    expect(result.current.canRedo).toBe(true)
  })

  // B2.5：助手的一批 op 会挨个调 addNode（建节点要先拿到真 id 才能连线，没法像剧本
  // 投影那样「先算完再一次提交」）。实测过没有包装时的行为：应用 3 项后按撤销是
  // 3→2→1→0。这两条把「包了 = 一步」和「没包 = 一次一个」同时钉住 —— 只钉前者的话，
  // 有人把包装去掉，测试照样绿。
  it('collapses a whole batch into one undo step', async () => {
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await result.current.runAsSingleHistoryStep(() => {
        result.current.addNode(NODE_TYPE_IDS.image, FIRST_POSITION)
        result.current.addNode(NODE_TYPE_IDS.image, SECOND_POSITION)
        result.current.addNode(NODE_TYPE_IDS.image, FIRST_POSITION)
      })
    })

    expect(result.current.nodes).toHaveLength(3)

    act(() => {
      result.current.undo()
    })

    expect(result.current.nodes).toHaveLength(0)
    expect(result.current.canUndo).toBe(false)
  })

  it('still records one history entry per call outside a batch', () => {
    const { result } = renderNodeWorkflowHook()

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.image, FIRST_POSITION)
      result.current.addNode(NODE_TYPE_IDS.image, SECOND_POSITION)
      result.current.addNode(NODE_TYPE_IDS.image, FIRST_POSITION)
    })

    expect(result.current.nodes).toHaveLength(3)

    act(() => {
      result.current.undo()
    })

    expect(result.current.nodes).toHaveLength(2)
  })

  // B4：投影会**删**它拥有的节点（角色/镜头/台词从剧本里删掉后，对应节点成了孤儿）。
  // 预览存在的唯一理由就是让用户在按下之前看见这件事 —— 所以它必须一个字节都不写。
  it('previews a projection without touching the graph', () => {
    const { result } = renderNodeWorkflowHook()

    act(() => {
      result.current.setScriptDoc({
        title: '深夜便利店',
        logline: '一个店员和一个常客',
        roles: [{ id: 'role-1', name: '小林', description: '疲惫的店员' }],
        shots: [
          {
            id: 'shot-1',
            summary: '小林擦柜台',
            roleIds: ['role-1'],
            dialogue: [],
          },
        ],
      })
    })

    const before = result.current.nodes.length
    let preview: ReturnType<typeof result.current.previewScriptDocProjection>
    act(() => {
      preview = result.current.previewScriptDocProjection()
    })

    expect(preview!.refusal).toBeNull()
    expect(preview!.created).toBeGreaterThan(0)
    // 一个字节都没写：节点数不变，撤销栈也没多一格。
    expect(result.current.nodes).toHaveLength(before)
    expect(result.current.canUndo).toBe(false)
  })

  it('rejects a malformed derived image batch atomically without recording history', () => {
    const { result } = renderNodeWorkflowHook()

    let sourceId = ''
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.image, FIRST_POSITION)
      result.current.updateNodeData(sourceId, {
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        mediaUrl: 'https://cdn.example.com/source.png',
      })
    })

    const malformedOutputs = [
      {
        imageUrl: 'https://cdn.example.com/valid.png',
        editCapability: 'upscale',
      },
      {
        imageUrl: '',
        editCapability: 'object-replace',
      },
    ] as unknown as CanvasDerivedImageOutput[]
    let derivedIds: string[] = []
    act(() => {
      derivedIds = result.current.placeDerivedImages(sourceId, malformedOutputs)
    })

    expect(derivedIds).toEqual([])
    expect(result.current.nodes.map((node) => node.id)).toEqual([sourceId])

    act(() => {
      result.current.undo()
    })

    expect(result.current.nodes).toEqual([])
  })

  it('deletes a node and removes connected edges', () => {
    const { result } = renderNodeWorkflowHook()

    let sourceId = ''
    let targetId = ''
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      targetId = result.current.addNode(NODE_TYPE_IDS.composer, SECOND_POSITION)
      result.current.onConnect({
        source: sourceId,
        target: targetId,
        sourceHandle: null,
        targetHandle: null,
      })
      result.current.deleteNode(sourceId)
    })

    expect(result.current.nodes.map((node) => node.id)).toEqual([targetId])
    expect(result.current.edges).toEqual([])
  })

  it('moves nodes through React Flow node changes', () => {
    const { result } = renderNodeWorkflowHook()

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    act(() => {
      result.current.onNodesChange([
        {
          id: nodeId,
          type: 'position',
          position: MOVED_POSITION,
          dragging: false,
        },
      ])
    })

    expect(result.current.nodes[0]?.position).toEqual(MOVED_POSITION)
  })

  it('persists media-owned dimension changes', () => {
    const { result } = renderNodeWorkflowHook()

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(
        NODE_TYPE_IDS.videoReference,
        FIRST_POSITION,
      )
      result.current.onNodesChange([
        {
          id: nodeId,
          type: 'dimensions',
          dimensions: { width: 320, height: 180 },
          setAttributes: true,
        },
      ])
    })

    expect(result.current.nodes[0]?.width).toBe(320)
    expect(result.current.nodes[0]?.height).toBe(180)
  })

  it('creates an edge through React Flow connections', () => {
    const { result } = renderNodeWorkflowHook()

    let sourceId = ''
    let targetId = ''
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      targetId = result.current.addNode(NODE_TYPE_IDS.composer, SECOND_POSITION)
    })

    const connection: Connection = {
      source: sourceId,
      target: targetId,
      sourceHandle: null,
      targetHandle: null,
    }

    act(() => {
      result.current.onConnect(connection)
    })

    expect(result.current.edges).toHaveLength(1)
    expect(result.current.edges[0]).toMatchObject({
      source: sourceId,
      target: targetId,
    })
  })

  // R3-6b §3 每镜覆写
  it('updateEdgeData shallow-merges a patch into the edge data and persists it', () => {
    const { result } = renderNodeWorkflowHook()

    let sourceId = ''
    let targetId = ''
    let edgeId = ''
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      targetId = result.current.addNode(NODE_TYPE_IDS.composer, SECOND_POSITION)
      result.current.onConnect({
        source: sourceId,
        target: targetId,
        sourceHandle: null,
        targetHandle: null,
      })
    })
    act(() => {
      edgeId = result.current.edges[0]?.id ?? ''
    })

    act(() => {
      result.current.updateEdgeData(edgeId, {
        stageOverrideUrls: ['https://cdn/a.png', 'https://cdn/b.png'],
      })
    })

    expect(result.current.edges[0]?.data).toMatchObject({
      stageOverrideUrls: ['https://cdn/a.png', 'https://cdn/b.png'],
    })

    // Clearing (the panel's "恢复默认") reverts to the inherited state.
    act(() => {
      result.current.updateEdgeData(edgeId, { stageOverrideUrls: undefined })
    })
    expect(result.current.edges[0]?.data?.stageOverrideUrls).toBeUndefined()
  })

  it('updateEdgeData is a no-op for an id that does not exist', () => {
    const { result } = renderNodeWorkflowHook()

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    act(() => {
      result.current.updateEdgeData('missing-edge', {
        stageOverrideUrls: ['https://cdn/a.png'],
      })
    })

    expect(result.current.edges).toEqual([])
  })

  it('finds the first outgoing target by node type', () => {
    const { result } = renderNodeWorkflowHook()

    let sourceId = ''
    let agentId = ''
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
      result.current.onConnect({
        source: sourceId,
        target: agentId,
        sourceHandle: null,
        targetHandle: null,
      })
    })

    expect(
      result.current.getOutgoingTargetByType(sourceId, NODE_TYPE_IDS.agent)?.id,
    ).toBe(agentId)
    expect(
      result.current.getOutgoingTargetByType(agentId, NODE_TYPE_IDS.agent),
    ).toBeNull()
  })

  it('creates a new project and keeps workflow state isolated', () => {
    const { result } = renderNodeWorkflowHook()

    let firstProjectId = ''
    let secondProjectId = ''
    let firstNodeId = ''
    let secondNodeId = ''
    act(() => {
      firstProjectId = result.current.currentProjectId
      firstNodeId = result.current.addNode(
        NODE_TYPE_IDS.composer,
        FIRST_POSITION,
      )
      secondProjectId = result.current.createProject('Storyboard pass')
    })

    expect(result.current.currentProjectId).toBe(secondProjectId)
    expect(result.current.currentProjectName).toBe('Storyboard pass')
    expect(result.current.nodes).toEqual([])

    act(() => {
      secondNodeId = result.current.addNode(
        NODE_TYPE_IDS.agent,
        SECOND_POSITION,
      )
      result.current.switchProject(firstProjectId)
    })

    expect(result.current.nodes.map((node) => node.id)).toEqual([firstNodeId])

    act(() => {
      result.current.switchProject(secondProjectId)
    })

    expect(result.current.nodes.map((node) => node.id)).toEqual([secondNodeId])
  })

  it('renames the current project', () => {
    const { result } = renderNodeWorkflowHook()

    act(() => {
      result.current.renameCurrentProject('Renamed workflow')
    })

    expect(result.current.currentProjectName).toBe('Renamed workflow')
    expect(result.current.projects[0]?.name).toBe('Renamed workflow')
  })

  it('deletes the current project and switches to another project', () => {
    const { result } = renderNodeWorkflowHook()

    let firstProjectId = ''
    let secondProjectId = ''
    let deletedProjectName = ''
    act(() => {
      firstProjectId = result.current.currentProjectId
      secondProjectId = result.current.createProject('Second workflow')
      deletedProjectName =
        result.current.deleteProject(secondProjectId)?.name ?? ''
    })

    expect(deletedProjectName).toBe('Second workflow')
    expect(result.current.currentProjectId).toBe(firstProjectId)
    expect(result.current.projects).toHaveLength(1)
  })

  it('creates a blank default project when deleting the last project', () => {
    const { result } = renderNodeWorkflowHook()

    let deletedNodeCount = 0
    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      deletedNodeCount =
        result.current.deleteProject(result.current.currentProjectId)
          ?.nodeCount ?? 0
    })

    expect(deletedNodeCount).toBe(1)
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.currentProjectName).toBe(DEFAULT_PROJECT_NAME)
    expect(result.current.nodes).toEqual([])
  })

  it('persists multiple projects and the selected current project', async () => {
    vi.useFakeTimers()
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    let firstProjectId = ''
    let secondProjectId = ''
    act(() => {
      firstProjectId = result.current.currentProjectId
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      secondProjectId = result.current.createProject('Second workflow')
      result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
    })

    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
    })

    const storage = readStoredStorage()
    const firstProject = storage.projects.find(
      (project) => project.id === firstProjectId,
    )
    const secondProject = storage.projects.find(
      (project) => project.id === secondProjectId,
    )

    expect(storage.currentProjectId).toBe(secondProjectId)
    expect(storage.projects).toHaveLength(2)
    expect(firstProject?.state.nodes).toHaveLength(1)
    expect(secondProject?.state.nodes).toHaveLength(1)
  })

  it('hydrates from a valid multi-project snapshot', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: TEST_CLERK_ID,
        currentProjectId: 'project-b',
        projects: [
          {
            id: 'project-a',
            name: DEFAULT_PROJECT_NAME,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            state: {
              nodes: [],
              edges: [],
            },
          },
          {
            id: 'project-b',
            name: 'Hydrated workflow',
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            state: {
              nodes: [
                {
                  id: 'node-hydrated',
                  type: NODE_TYPE_IDS.shotText,
                  position: FIRST_POSITION,
                  data: {
                    prompt: 'Hydrated prompt',
                    status: NODE_STATUS_IDS.idle,
                  },
                },
              ],
              edges: [],
            },
          },
        ],
      }),
    )

    const { result } = renderNodeWorkflowHook()

    await waitFor(() => {
      expect(result.current.currentProjectName).toBe('Hydrated workflow')
    })
    expect(result.current.nodes[0]?.data.prompt).toBe('Hydrated prompt')
    expect(result.current.projects).toHaveLength(2)
  })

  // 「持久化项目级默认视频模型」那条测试已随 `defaultVideoModel` 整条删除
  // （cleanup §9.10）—— 它守的是一个没有写入口、恒为 undefined 的字段。

  it('persists and resets the project canvas appearance outside graph undo', async () => {
    vi.useFakeTimers()
    const { result } = renderNodeWorkflowHook()
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.setCanvasAppearance(TEST_CANVAS_APPEARANCE)
    })

    expect(result.current.canvasAppearance).toEqual(TEST_CANVAS_APPEARANCE)
    expect(result.current.canUndo).toBe(false)

    act(() => {
      result.current.setCanvasAppearance(undefined)
    })
    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
    })

    expect(result.current.canvasAppearance).toBeUndefined()
    expect(readStoredCurrentState()).not.toHaveProperty('canvasAppearance')
  })

  it('keeps project metadata when deleting a node', async () => {
    const { result } = renderNodeWorkflowHook()
    await act(async () => {
      await Promise.resolve()
    })

    let nodeId = ''
    act(() => {
      result.current.setCanvasAppearance(TEST_CANVAS_APPEARANCE)
      result.current.setScriptDoc({
        title: 'Saved outline',
        logline: 'A persistent story fact.',
        roles: [],
        shots: [],
      })
      nodeId = result.current.addNode(NODE_TYPE_IDS.shotText, FIRST_POSITION)
    })

    act(() => {
      result.current.deleteNode(nodeId)
    })

    expect(result.current.nodes).toEqual([])
    expect(result.current.canvasAppearance).toEqual(TEST_CANVAS_APPEARANCE)
    expect(result.current.scriptDoc?.title).toBe('Saved outline')
  })

  it('drops malformed canvas appearance without emptying a valid graph', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: TEST_CLERK_ID,
        currentProjectId: 'project-bad-appearance',
        projects: [
          {
            id: 'project-bad-appearance',
            name: 'Recovered canvas',
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            state: {
              nodes: [
                {
                  id: 'node-kept',
                  type: NODE_TYPE_IDS.shotText,
                  position: FIRST_POSITION,
                  data: {
                    prompt: 'Keep this node',
                    status: NODE_STATUS_IDS.idle,
                  },
                },
              ],
              edges: [],
              canvasAppearance: {
                backgroundColor: 'not-a-hex-color',
                image: {
                  url: 'file:///unsafe-wallpaper.png',
                  fit: 'stretch',
                  opacity: 2,
                },
              },
            },
          },
        ],
      }),
    )

    const { result } = renderNodeWorkflowHook()

    await waitFor(() => {
      expect(result.current.currentProjectName).toBe('Recovered canvas')
    })
    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0]?.data.prompt).toBe('Keep this node')
    expect(result.current.canvasAppearance).toBeUndefined()
  })

  it('retires composer/agent nodes and folds the breakdown into a ScriptDoc on hydration', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: TEST_CLERK_ID,
        currentProjectId: 'project-legacy',
        projects: [
          {
            id: 'project-legacy',
            name: 'Legacy planner',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            state: {
              nodes: [
                {
                  id: 'composer-1',
                  type: NODE_TYPE_IDS.composer,
                  position: FIRST_POSITION,
                  data: { prompt: 'idea', status: NODE_STATUS_IDS.idle },
                },
                {
                  id: 'agent-1',
                  type: NODE_TYPE_IDS.agent,
                  position: SECOND_POSITION,
                  data: {
                    prompt: '',
                    status: NODE_STATUS_IDS.done,
                    breakdown: FAKE_BREAKDOWN,
                  },
                },
                {
                  id: 'shot-keep',
                  type: NODE_TYPE_IDS.shotText,
                  position: MOVED_POSITION,
                  data: { prompt: 'keep me', status: NODE_STATUS_IDS.idle },
                },
              ],
              edges: [
                { id: 'edge-1', source: 'composer-1', target: 'agent-1' },
              ],
            },
          },
        ],
      }),
    )

    const { result } = renderNodeWorkflowHook()

    await waitFor(() => {
      expect(result.current.currentProjectName).toBe('Legacy planner')
    })
    // composer + agent stripped; only the surviving shotText node remains.
    expect(result.current.nodes.map((node) => node.type)).toEqual([
      NODE_TYPE_IDS.shotText,
    ])
    // the dangling composer→agent edge is removed with its nodes.
    expect(result.current.edges).toHaveLength(0)
    // the agent breakdown is folded into the ScriptDoc fact model.
    expect(result.current.scriptDoc?.title).toBe(FAKE_BREAKDOWN.title)
    expect(result.current.scriptDoc?.roles).toHaveLength(2)
  })

  it('restores legacy fused nodes in place without dropping nested reference metadata', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: TEST_CLERK_ID,
        currentProjectId: 'project-legacy-fused',
        projects: [
          {
            id: 'project-legacy-fused',
            name: 'Legacy fused nodes',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            state: {
              nodes: [
                {
                  id: 'source',
                  type: NODE_TYPE_IDS.image,
                  position: MOVED_POSITION,
                  data: {
                    prompt: '',
                    status: NODE_STATUS_IDS.done,
                    mediaUrl: 'https://cdn.example.com/legacy.png',
                    fusedIntoNodeId: 'target',
                  },
                },
                {
                  id: 'target',
                  type: NODE_TYPE_IDS.image,
                  position: SECOND_POSITION,
                  data: {
                    prompt: '',
                    status: NODE_STATUS_IDS.idle,
                    referenceAssets: [
                      {
                        id: 'ref-legacy',
                        url: 'https://cdn.example.com/legacy.png',
                        source: 'canvas',
                        sourceId: 'source',
                        role: 'identity',
                        weight: 1,
                        onStage: true,
                      },
                    ],
                  },
                },
              ],
              edges: [],
            },
          },
        ],
      }),
    )

    const { result } = renderNodeWorkflowHook()

    await waitFor(() => {
      expect(result.current.currentProjectName).toBe('Legacy fused nodes')
    })

    expect(result.current.nodes[0]?.position).toEqual(MOVED_POSITION)
    expect(result.current.nodes[0]?.data.fusedIntoNodeId).toBeUndefined()
    expect(result.current.nodes[1]?.data.referenceAssets).toEqual([
      expect.objectContaining({
        id: 'ref-legacy',
        source: 'canvas',
        sourceId: 'source',
        role: 'identity',
        weight: 1,
        onStage: true,
      }),
    ])
  })

  it('hydrates nodes, edges, and prompt data from a valid snapshot', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.legacyVersion,
        nodes: [
          {
            id: 'node-existing',
            type: NODE_TYPE_IDS.shotText,
            position: FIRST_POSITION,
            data: {
              prompt: 'Stored prompt',
              status: NODE_STATUS_IDS.idle,
            },
          },
        ],
        edges: [],
      }),
    )

    const { result } = renderNodeWorkflowHook()

    expect(result.current.nodes).toEqual([])

    await waitFor(() => {
      expect(result.current.nodes).toHaveLength(1)
    })
    expect(result.current.nodes[0]?.data.prompt).toBe('Stored prompt')
    expect(result.current.currentProjectName).toBe(DEFAULT_PROJECT_NAME)
  })

  it('falls back to an empty workflow when localStorage is invalid JSON', async () => {
    window.localStorage.setItem(TEST_STORAGE_KEY, 'not-json')

    const { result } = renderNodeWorkflowHook()

    await waitFor(() => {
      expect(result.current.nodes).toEqual([])
    })
    expect(result.current.edges).toEqual([])
  })

  it('falls back to an empty workflow when the snapshot schema is invalid', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.legacyVersion,
        nodes: [
          {
            id: 'node-invalid',
            type: NODE_TYPE_IDS.composer,
            position: FIRST_POSITION,
            data: {
              status: NODE_STATUS_IDS.idle,
            },
          },
        ],
        edges: [],
      }),
    )

    const { result } = renderNodeWorkflowHook()

    await waitFor(() => {
      expect(result.current.nodes).toEqual([])
    })
  })

  it('debounces localStorage persistence', async () => {
    vi.useFakeTimers()
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs - 1)
    })
    expect(window.localStorage.getItem(TEST_STORAGE_KEY)).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    const storage = readStoredStorage()
    const snapshot = readStoredCurrentState()
    expect(storage.version).toBe(NODE_STUDIO_WORKFLOW_STORAGE.version)
    expect(storage.ownerClerkId).toBe(TEST_CLERK_ID)
    expect(snapshot.nodes).toHaveLength(1)
    expect(snapshot.nodes[0]?.position).toEqual(FIRST_POSITION)
  })

  it('reports a full localStorage instead of swallowing the failure', async () => {
    vi.useFakeTimers()
    const setItem = stubQuotaExceededStorage()
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
    })

    expect(setItem).toHaveBeenCalled()
    expect(loggerErrorMock).toHaveBeenCalledWith(
      '[node-workflow] localStorage persist failed',
      expect.objectContaining({ quotaExceeded: true }),
    )
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).toHaveBeenCalledWith('localCacheFull')
    // The canvas keeps working — the snapshot is still in memory and the
    // server copy is authoritative.
    expect(result.current.nodes).toHaveLength(1)

    setItem.mockRestore()
  })

  it("names Firefox's legacy quota error as a quota failure too", async () => {
    vi.useFakeTimers()
    const setItem = stubQuotaExceededStorage('NS_ERROR_DOM_QUOTA_REACHED')
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
    })

    expect(toastErrorMock).toHaveBeenCalledWith('localCacheFull')

    setItem.mockRestore()
  })

  it('falls back to the generic message for a non-quota storage failure', async () => {
    vi.useFakeTimers()
    const setItem = stubQuotaExceededStorage('SecurityError')
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
    })

    expect(loggerErrorMock).toHaveBeenCalledWith(
      '[node-workflow] localStorage persist failed',
      expect.objectContaining({ quotaExceeded: false }),
    )
    expect(toastErrorMock).toHaveBeenCalledWith('localCacheUnavailable')

    setItem.mockRestore()
  })

  it('warns about a full localStorage only once per session', async () => {
    vi.useFakeTimers()
    const setItem = stubQuotaExceededStorage()
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    // Three separate debounce windows — without the one-shot guard this
    // would be three toasts (and in real use, one per keystroke).
    for (const position of [FIRST_POSITION, SECOND_POSITION, MOVED_POSITION]) {
      act(() => {
        result.current.addNode(NODE_TYPE_IDS.composer, position)
      })
      act(() => {
        vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
      })
    }

    expect(setItem.mock.calls.length).toBeGreaterThan(1)
    expect(toastErrorMock).toHaveBeenCalledTimes(1)

    setItem.mockRestore()
  })

  it('stays silent when the write is deliberately skipped (parked session)', async () => {
    vi.useFakeTimers()
    const setItem = stubQuotaExceededStorage()
    const { result } = renderNodeWorkflowHook(null)

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs + 10)
    })

    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(loggerErrorMock).not.toHaveBeenCalled()

    setItem.mockRestore()
  })

  it('parks itself and never writes localStorage while clerkId is null', async () => {
    vi.useFakeTimers()
    const { result } = renderNodeWorkflowHook(null)

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs + 10)
    })

    expect(window.localStorage.getItem(TEST_STORAGE_KEY)).toBeNull()
    expect(
      window.localStorage.getItem(
        getNodeStudioWorkflowStorageKey(OTHER_CLERK_ID),
      ),
    ).toBeNull()
  })

  it('scopes localStorage per clerkId so two accounts cannot see each other', async () => {
    vi.useFakeTimers()
    // User A writes a project into their own slot.
    const userARender = renderNodeWorkflowHook(TEST_CLERK_ID)
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      userARender.result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
    })

    expect(window.localStorage.getItem(TEST_STORAGE_KEY)).not.toBeNull()
    // User B's slot is empty — user A's edit did not leak across.
    expect(
      window.localStorage.getItem(
        getNodeStudioWorkflowStorageKey(OTHER_CLERK_ID),
      ),
    ).toBeNull()

    userARender.unmount()
    // Swap back to real timers — waitFor below polls on wall-clock time
    // and would otherwise spin forever against the frozen fake clock.
    vi.useRealTimers()

    // User B mounts on the same browser and sees an empty workflow.
    const userBRender = renderNodeWorkflowHook(OTHER_CLERK_ID)
    await act(async () => {
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(userBRender.result.current.nodes).toEqual([])
    })
    expect(userBRender.result.current.currentProjectName).toBe(
      DEFAULT_PROJECT_NAME,
    )
  })

  it('refuses to hydrate a snapshot whose ownerClerkId does not match', async () => {
    // Stash a snapshot under user A's key that *claims* to belong to user B.
    // The per-user storage key would normally make this impossible, but if
    // it ever happens (sync, manual import) we must not render the wrong
    // user's data.
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: OTHER_CLERK_ID,
        currentProjectId: 'project-foreign',
        projects: [
          {
            id: 'project-foreign',
            name: 'Foreign workflow',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            state: {
              nodes: [
                {
                  id: 'node-foreign',
                  type: NODE_TYPE_IDS.composer,
                  position: FIRST_POSITION,
                  data: {
                    prompt: 'Foreign data',
                    status: NODE_STATUS_IDS.idle,
                  },
                },
              ],
              edges: [],
            },
          },
        ],
      }),
    )

    const { result } = renderNodeWorkflowHook(TEST_CLERK_ID)

    await waitFor(() => {
      expect(result.current.currentProjectName).toBe(DEFAULT_PROJECT_NAME)
    })
    expect(result.current.nodes).toEqual([])
  })

  it('purges the pre-v3 global localStorage key on mount', async () => {
    window.localStorage.setItem(
      NODE_STUDIO_WORKFLOW_STORAGE.legacyGlobalKey,
      JSON.stringify({ version: 1, nodes: [], edges: [] }),
    )

    renderNodeWorkflowHook()
    await act(async () => {
      await Promise.resolve()
    })

    // The legacy key is wiped, regardless of whether the hydrate flow
    // would have read from it.
    if (
      NODE_STUDIO_WORKFLOW_STORAGE.legacyGlobalKey !==
      getNodeStudioWorkflowStorageKey(TEST_CLERK_ID)
    ) {
      expect(
        window.localStorage.getItem(
          NODE_STUDIO_WORKFLOW_STORAGE.legacyGlobalKey,
        ),
      ).toBeNull()
    }
  })

  // ── 服务端写入闸 ───────────────────────────────────────────────────────
  // 守的是一条数据丢失级的覆写链：list 请求失败 → 回落 localStorage →
  // `hasServerHydrated` 照样置 true → 5 秒后本地那份把服务端的好副本整体
  // PUT 覆盖掉。闸的判据是「本会话服务端亲口确认过这个项目 id」。

  it('never pushes state to a project the server did not confirm this session', async () => {
    const { result, putCalls } = await renderHydratedHook({
      // 服务端 list 挂了 —— 画布照常回落到 localStorage 继续能用……
      list: () => jsonResponse({ success: false, error: 'boom' }, 500),
    })
    expect(result.current.isHydrated).toBe(true)

    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    // ……但**一个字节都不许写回服务端**：手里这份 state 来路不明。
    expect(putCalls()).toHaveLength(0)
    expect(loggerWarnMock).toHaveBeenCalledTimes(1)
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('not confirmed by the server'),
      expect.objectContaining({ projectId: result.current.currentProjectId }),
    )

    // 每次改动写入 effect 都会重跑——警告只能响一次，否则等于把日志刷爆。
    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
    })
    expect(putCalls()).toHaveLength(0)
    expect(loggerWarnMock).toHaveBeenCalledTimes(1)
  })

  it('pushes state to a project the server list confirmed', async () => {
    const { result, putCalls } = await renderHydratedHook({
      list: () =>
        jsonResponse({ success: true, data: [serverProjectRecord()] }),
    })

    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    const writes = putCalls()
    expect(writes).toHaveLength(1)
    expect(writes[0]?.url).toContain('srv_project_1')
    expect((writes[0]?.body?.state as { nodes: unknown[] }).nodes).toHaveLength(
      1,
    )
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  it('does not carry one account’s confirmed ids into the next sign-in', async () => {
    const rig = stubServerFetch({
      list: () =>
        jsonResponse({ success: true, data: [serverProjectRecord()] }),
    })
    const { result, rerender } = renderHook(
      ({ clerkId }: { clerkId: string | null }) =>
        useNodeWorkflow({ defaultProjectName: DEFAULT_PROJECT_NAME, clerkId }),
      {
        initialProps: { clerkId: TEST_CLERK_ID } as { clerkId: string | null },
      },
    )
    await waitFor(() => expect(result.current.isHydrated).toBe(true))

    // 第二个账号的 list 挂掉。此时上一个账号确认过的 `srv_project_1` 还留在
    // 内存里——若不按 clerkId 清空，它就会给新账号的写入放行。
    rig.calls.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse({ success: false, error: 'boom' }, 500)),
      ),
    )
    rerender({ clerkId: OTHER_CLERK_ID })
    await waitFor(() => expect(result.current.isHydrated).toBe(true))

    const secondAccountFetch = vi.mocked(globalThis.fetch)
    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    const writeCalls = secondAccountFetch.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect(writeCalls).toHaveLength(0)
  })

  it('vouches for a canvas the user emptied so the server clear guard lets it through', async () => {
    const { result, putCalls } = await renderHydratedHook({
      list: () =>
        jsonResponse({
          success: true,
          data: [
            serverProjectRecord({
              state: { nodes: [HYDRATED_NODE], edges: [] },
            }),
          ],
        }),
    })
    expect(result.current.nodes).toHaveLength(1)

    // 画布没有「一键清空」按钮，清空只能一个个删节点——就是这条路。
    mutateAndFlushServerWrite(() => {
      result.current.deleteNode(HYDRATED_NODE.id)
    })

    const cleared = putCalls().at(-1)
    expect((cleared?.body?.state as { nodes: unknown[] }).nodes).toHaveLength(0)
    expect(cleared?.body?.allowEmptyState).toBe(true)

    // 重新有了节点，记号就得撤掉：之后再变空得是**新一次**用户操作说了算。
    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, SECOND_POSITION)
    })
    expect(putCalls().at(-1)?.body?.allowEmptyState).toBe(false)
  })

  it('never vouches for an empty state it did not watch the user create', async () => {
    const { result, putCalls } = await renderHydratedHook({
      list: () =>
        jsonResponse({ success: true, data: [serverProjectRecord()] }),
    })

    // 项目本来就是空的（水化下来就是零节点），用户只是碰了一下画布外观。
    mutateAndFlushServerWrite(() => {
      result.current.setCanvasAppearance(TEST_CANVAS_APPEARANCE)
    })

    const write = putCalls().at(-1)
    expect((write?.body?.state as { nodes: unknown[] }).nodes).toHaveLength(0)
    expect(write?.body?.allowEmptyState).toBe(false)
  })

  // ── 云端保存失败可见 ───────────────────────────────────────────────────
  // 这几个调用原本全是裸 `void fetch(...)`：失败零信号。对称于 localStorage
  // 那侧——日志每次都记，toast 一个会话只响一次。

  it('reports a failed cloud save, and only once per session', async () => {
    const { result } = await renderHydratedHook({
      list: () =>
        jsonResponse({ success: true, data: [serverProjectRecord()] }),
      put: () => jsonResponse({ success: false, error: 'offline' }, 500),
    })

    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    await waitFor(() => expect(serverPersistErrorCalls()).toHaveLength(1))

    expect(serverPersistErrorCalls()[0]?.[1]).toMatchObject({
      operation: SERVER_WRITE_OPERATIONS.update,
    })
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).toHaveBeenCalledWith('cloudSaveFailed')

    // 后续 debounce 窗口同样失败：日志每次都记（否则等于丢证据），
    // toast 只此一次（否则断网时每 5 秒复读一遍）。
    for (const position of [SECOND_POSITION, MOVED_POSITION]) {
      mutateAndFlushServerWrite(() => {
        result.current.addNode(NODE_TYPE_IDS.agent, position)
      })
    }
    await waitFor(() => expect(serverPersistErrorCalls()).toHaveLength(3))
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
  })

  it('does not let a failed activate swallow the next real save alarm', async () => {
    const { result } = await renderHydratedHook({
      list: () =>
        jsonResponse({
          success: true,
          data: [
            serverProjectRecord(),
            serverProjectRecord({ id: 'srv_project_2', name: 'Second' }),
          ],
        }),
      activate: () => jsonResponse({ success: false, error: 'offline' }, 500),
      put: () => jsonResponse({ success: false, error: 'offline' }, 500),
    })

    act(() => {
      result.current.switchProject('srv_project_2')
    })
    await waitFor(() => expect(serverPersistErrorCalls()).toHaveLength(1))
    expect(serverPersistErrorCalls()[0]?.[1]).toMatchObject({
      operation: SERVER_WRITE_OPERATIONS.activate,
    })
    // activate 挂掉只丢「下次默认开哪个项目」这个指针，画布内容毫发无损 ——
    // 弹「你的内容没保存」是假警报。
    expect(toastErrorMock).not.toHaveBeenCalled()

    // 而且它绝不能把一次性抑制标志用掉：紧接着真正的内容写入失败必须还能响。
    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1))
    expect(toastErrorMock).toHaveBeenCalledWith('cloudSaveFailed')
  })

  it('reports a failed one-time migration and keeps the local copy intact', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: TEST_CLERK_ID,
        currentProjectId: 'local-a',
        projects: [
          {
            id: 'local-a',
            name: 'Local A',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            state: { nodes: [HYDRATED_NODE], edges: [] },
          },
          {
            id: 'local-b',
            name: 'Local B',
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            state: { nodes: [HYDRATED_NODE], edges: [] },
          },
        ],
      }),
    )

    const { result, createCalls, listCalls } = await renderHydratedHook({
      // 服务端一个项目都没有 → 走「本地内容一次性上云」那条迁移路径……
      list: () => jsonResponse({ success: true, data: [] }),
      post: () => jsonResponse({ success: false, error: 'offline' }, 500),
    })

    // ……上传挂了。原来这个循环连返回值都不看，用户以为已经同步了。
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1))
    expect(toastErrorMock).toHaveBeenCalledWith('cloudSaveFailed')
    expect(serverPersistErrorCalls()[0]?.[1]).toMatchObject({
      operation: SERVER_WRITE_OPERATIONS.migrate,
    })

    // 第一个就失败 → 停手，不再传剩下的。
    expect(createCalls()).toHaveLength(1)
    // ⚠ 也**不做**那步 refetch + 「拿服务端结果整体替换本地快照」——只传上去
    // 一半就替换，等于把没传成功的项目从本地也一并抹掉。
    expect(listCalls()).toHaveLength(1)
    expect(result.current.projects).toHaveLength(2)
  })

  // ── 新用户的 bootstrap 项目必须上云 ───────────────────────────────────────
  // 原来迁移路径上有一条「空项目不值得迁移」的短路，而新用户手里那个 bootstrap
  // 默认项目恰恰是空的 —— 它于是从没在服务端建过行，整个第一次会话只活在
  // localStorage，而且写入闸（`serverConfirmedProjectIds`）会把这期间的每一次
  // 写入静默跳过。清一次缓存就整段没了。

  it('creates a server row for a brand-new user whose only project is the empty bootstrap default', async () => {
    // 有状态的假服务端：POST 之后 refetch 得看得见刚建出来的那一行。
    const serverRows: ReturnType<typeof serverProjectRecord>[] = []
    const { result, createCalls, listCalls, putCalls } =
      await renderHydratedHook({
        list: () => jsonResponse({ success: true, data: [...serverRows] }),
        post: () => {
          const row = serverProjectRecord({
            id: 'srv_bootstrap_1',
            name: DEFAULT_PROJECT_NAME,
          })
          serverRows.push(row)
          return jsonResponse({ success: true, data: row })
        },
      })

    // 服务端空 + 本地只有那个空的默认项目 → 照样建行。
    expect(createCalls()).toHaveLength(1)
    expect(createCalls()[0]?.body?.name).toBe(DEFAULT_PROJECT_NAME)
    expect(
      (createCalls()[0]?.body?.state as { nodes: unknown[] }).nodes,
    ).toHaveLength(0)
    // 初次 list + 建完之后那次 refetch。
    expect(listCalls()).toHaveLength(2)
    expect(result.current.currentProjectId).toBe('srv_bootstrap_1')

    // ⭐ 本次修复成立与否的判据：新 id 必须进了 `serverConfirmedProjectIds`。
    // 那个 Set 是 ref，唯一的外部可观测面就是「这个项目的写入放不放行」——
    // 没进去的话下面这次改动会被静默跳过，等于建了个寂寞。
    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    expect(putCalls()).toHaveLength(1)
    expect(putCalls()[0]?.url).toContain('srv_bootstrap_1')
    expect(
      (putCalls()[0]?.body?.state as { nodes: unknown[] }).nodes,
    ).toHaveLength(1)
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  it('reports a failed bootstrap upload and still refuses to write to the unconfirmed project', async () => {
    const { result, createCalls, listCalls, putCalls } =
      await renderHydratedHook({
        list: () => jsonResponse({ success: true, data: [] }),
        post: () => jsonResponse({ success: false, error: 'offline' }, 500),
      })

    // 建不出来就得说 —— 静默才是这次要修的病。
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1))
    expect(toastErrorMock).toHaveBeenCalledWith('cloudSaveFailed')
    expect(serverPersistErrorCalls()[0]?.[1]).toMatchObject({
      operation: SERVER_WRITE_OPERATIONS.migrate,
    })
    expect(createCalls()).toHaveLength(1)
    // 失败了就不 refetch，也不拿服务端结果替换本地。
    expect(listCalls()).toHaveLength(1)

    // 没建成 = 没确认。绝不能顺手把本地 id 登记进去「让写入先跑起来」——
    // 那等于让一份来路不明的 state 去 PUT 一个可能根本不存在的行。
    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    expect(putCalls()).toHaveLength(0)
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('not confirmed by the server'),
      expect.objectContaining({ projectId: result.current.currentProjectId }),
    )
    // 本地那份原样留着，用户继续能编辑。
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.nodes).toHaveLength(1)
  })

  it('never uploads another account’s local snapshot as this account’s project', async () => {
    // 本账号的 key 里躺着一份**声称属于别人**的快照（同步 / 手动导入 / 开发者
    // 工具都可能造成）。读取那一层就该把它顶掉。
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: OTHER_CLERK_ID,
        currentProjectId: 'project-foreign',
        projects: [
          {
            id: 'project-foreign',
            name: 'Foreign workflow',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            state: { nodes: [HYDRATED_NODE], edges: [] },
          },
        ],
      }),
    )

    const serverRows: ReturnType<typeof serverProjectRecord>[] = []
    const { result, createCalls } = await renderHydratedHook({
      list: () => jsonResponse({ success: true, data: [...serverRows] }),
      post: () => {
        const row = serverProjectRecord({ id: 'srv_bootstrap_1' })
        serverRows.push(row)
        return jsonResponse({ success: true, data: row })
      },
    })

    // 内存里是本账号自己的空默认项目，别人那份一个节点都没进来。
    expect(result.current.nodes).toEqual([])
    // 建行是对的（本账号自己的空项目也该有云端副本），但建上去的**绝不能是
    // 别人那份**：迁移循环喂的是内存快照，隔离在它之前就已经生效了。
    expect(createCalls()).toHaveLength(1)
    expect(createCalls()[0]?.body?.name).toBe(DEFAULT_PROJECT_NAME)
    expect(
      (createCalls()[0]?.body?.state as { nodes: unknown[] }).nodes,
    ).toHaveLength(0)
  })

  it('refuses to upload an in-memory snapshot that is not provably this account’s', async () => {
    const rig = stubServerFetch({
      list: () => jsonResponse({ success: true, data: [] }),
      post: () => jsonResponse({ success: true, data: serverProjectRecord() }),
    })

    // ⚠ 顺序就是这条测试的全部。`renderHook` 同步返回时，localStorage 水化那个
    // `queueMicrotask` 还没跑（栈还没空）；此刻写一笔就让 `hasPreHydrationMutation`
    // 置位，水化于是**保留内存里这份**而不是去读盘 —— 它的 owner 还是 parked
    // 哨兵，不是本账号。这正是「切账号时上一个账号的残留快照还在内存里」那条路
    // 能达到的同一个状态。
    const { result } = renderNodeWorkflowHook()
    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    await act(async () => {
      await Promise.resolve()
    })
    // 水化 microtask 在「有 pre-hydration 写入」这条路上不 setState，所以要再
    // 推一次渲染，服务端水化 effect 才会重跑。
    act(() => {
      result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
    })
    await waitFor(() => expect(result.current.isHydrated).toBe(true))

    // 迁移循环之前那条 seatbelt（`localSnapshot.ownerClerkId !== clerkId`）必须
    // 拦住它 —— 服务端是空的，删掉「本地有没有内容」那条短路之后，这里是唯一
    // 拦着「把不属于本账号的快照 POST 成本账号项目」的东西。
    expect(rig.createCalls()).toHaveLength(0)
    // 拦住不等于丢掉：本地那份还在，用户继续能编辑。
    expect(result.current.nodes).toHaveLength(2)
  })

  // ── 删掉最后一个项目后补的替代项目也必须建行 ─────────────────────────────
  // 和上面那条 bootstrap 的洞同一类：本地凭空多出一个项目，却没人给它在服务端
  // 建行。它的 id 不在 `serverConfirmedProjectIds` 里，于是写入 effect 会跳过它
  // 的每一次写入（只留一条用户看不见的 warn）、`saveNow` 直接返回 false 弹「保存
  // 失败」—— 用户删完最后一个项目后接着画的东西整个会话都不上云。

  it('creates a server row for the replacement project after deleting the last one', async () => {
    const { result, calls, createCalls, putCalls } = await renderHydratedHook({
      list: () =>
        jsonResponse({
          success: true,
          data: [
            serverProjectRecord({ id: 'srv_only_1', name: 'Only project' }),
          ],
        }),
      // 服务端发自己的 UUID —— 本地那个临时 id 必须被改写掉，否则后续写入打的
      // 是一个不存在的行。
      post: () =>
        jsonResponse({
          success: true,
          data: serverProjectRecord({
            id: 'srv_replacement_1',
            name: DEFAULT_PROJECT_NAME,
          }),
        }),
    })

    expect(result.current.currentProjectId).toBe('srv_only_1')

    act(() => {
      result.current.deleteProject('srv_only_1')
    })

    // 本地立刻补上了一个空的默认项目……
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.currentProjectName).toBe(DEFAULT_PROJECT_NAME)
    expect(result.current.nodes).toEqual([])
    // ……删除照常发出去……
    expect(
      calls.filter(
        (call) => call.method === 'DELETE' && call.url.includes('srv_only_1'),
      ),
    ).toHaveLength(1)
    // ……而这次修的就是这一条：替代项目也得有服务端的行。
    expect(createCalls()).toHaveLength(1)
    expect(createCalls()[0]?.body?.name).toBe(DEFAULT_PROJECT_NAME)
    expect(
      (createCalls()[0]?.body?.state as { nodes: unknown[] }).nodes,
    ).toHaveLength(0)

    await waitFor(() =>
      expect(result.current.currentProjectId).toBe('srv_replacement_1'),
    )

    // ⭐ 判据：接着画的东西真的 PUT 到了服务端那个新 id 上。`serverConfirmedProjectIds`
    // 是 ref，唯一的外部可观测面就是「这个项目的写入放不放行」。
    mutateAndFlushServerWrite(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    expect(putCalls()).toHaveLength(1)
    expect(putCalls()[0]?.url).toContain('srv_replacement_1')
    expect(
      (putCalls()[0]?.body?.state as { nodes: unknown[] }).nodes,
    ).toHaveLength(1)
    // ⚠ 不断言「一条 warn 都没有」：本地建出来到服务端确认之间那一小段里，写入
    // effect 会为那个临时 id 警告一次，这是 `createProject` 也有的既有行为。要紧
    // 的是**服务端那个 id 从没被挡过**。
    expect(loggerWarnMock).not.toHaveBeenCalledWith(
      expect.stringContaining('not confirmed by the server'),
      expect.objectContaining({ projectId: 'srv_replacement_1' }),
    )
  })
})
