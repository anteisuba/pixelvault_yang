/**
 * L2c 下一轮对账：服务端这一轮记下的台面，和浏览器把同一步落到**真表单**之后、
 * 下一轮带上来的台面，必须一样。
 *
 * 一条链全是真代码：真表单 reducer（`studioFormReducer`）→ 真快照（宿主同一份
 * `buildWorkbenchOperatorForm` + `buildImageOperatorSnapshot`）→ 真 `prepareOperatorTurn`
 * （真库）→ `planTool` / `apply` → 这一步按客户端 schema 解析 → 真 `applyOperatorStep` 落表单
 * → 再拍快照 → 再开一轮。
 * ⚠ 参考图槽在测试里是一个数组（宿主那边是上传 hook），模型清单是手写的两条可跑路线；
 *   `ctx` 的落法逐条抄 `use-studio-workbench-operator-host.ts`（帧槽 / 参考视频 / 音频 / 出声）。
 */
import { isDeepStrictEqual } from 'node:util'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS as T,
  ASSISTANT_OPERATOR_TOOL_VERBS,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { resolveAdapterType } from '@/constants/models'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  STUDIO_INITIAL_FORM_STATE,
  studioFormReducer,
  type StudioFormState,
} from '@/contexts/studio-context'
import { prepareOperatorTurn } from '@/features/assistant/services/assistant-operator-turn.service'
import { planTool } from '@/features/assistant/services/assistant-operator-tools.service'
import {
  applyOperatorStep,
  type StudioOperatorApplyContext,
} from '@/lib/studio-operator-apply'
import {
  buildImageOperatorSnapshot,
  buildVideoOperatorSnapshot,
  buildWorkbenchOperatorForm,
} from '@/lib/studio-operator-snapshot'
import { AssistantOperatorAppliedStepSchema } from '@/types/assistant-operator'
import type { StudioModelOption } from '@/types/model-option'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Run = Awaited<ReturnType<typeof prepareOperatorTurn>>['run']
type StateKey = keyof Run['state']

function option(modelId: string): StudioModelOption {
  return {
    optionId: `workspace:${modelId}`,
    modelId,
    adapterType: resolveAdapterType(modelId) as AI_ADAPTER_TYPES,
    providerConfig: { label: modelId, baseUrl: 'https://example.test' },
    requestCount: 0,
    isBuiltIn: true,
    sourceType: 'workspace',
    providerKeyId: 'key-test',
  }
}

const IMAGE_MODELS = [option('seedream-4.5'), option('gpt-image-2')]
// 首尾帧 2 格 + 参考图 / 视频 / 音频都收的一条，和另一家能换过去的。
const VIDEO_MODELS = [option('seedance-2.0-volcengine'), option('wan-3.0')]

// 标签台 = 图片宿主 + NAI 型号（角色构图、场景文字两格只在 NAI 上出现）。
const TAGS_MODELS = [option('nai-diffusion-4-5-full')]

type Face = 'image' | 'video' | 'tags'

const FACE_MODELS: Record<Face, StudioModelOption[]> = {
  image: IMAGE_MODELS,
  video: VIDEO_MODELS,
  tags: TAGS_MODELS,
}

const WORKSPACE_KEY: Record<Face, string> = {
  image: 'image-natural',
  video: 'video',
  tags: 'image-tags',
}

/** 一张真工作台表单 + 参考图槽：快照怎么拍、步怎么落，都走宿主那几个纯函数。 */
function workbench(face: Face = 'image') {
  const models = FACE_MODELS[face]
  let state: StudioFormState = {
    ...STUDIO_INITIAL_FORM_STATE,
    outputType: face === 'video' ? 'video' : 'image',
    selectedOptionId: models[0]!.optionId,
  }
  const references: { url: string }[] = []
  const selected = () =>
    models.find((model) => model.optionId === state.selectedOptionId)

  const snapshot = () => {
    const form = buildWorkbenchOperatorForm(state)
    const shared = {
      form,
      modelOptions: models,
      selectedModel: selected(),
      references: { items: references, limit: 4 },
    }
    return face === 'video'
      ? buildVideoOperatorSnapshot(shared)
      : buildImageOperatorSnapshot({
          ...shared,
          runModels: selected() ? [selected()!] : [],
        })
  }

  const ctx: StudioOperatorApplyContext = {
    getState: () => state,
    dispatch: (action) => {
      state = studioFormReducer(state, action)
    },
    // 视频档给的是 optionId 本身（型号 × 渠道），图片档给 modelId。
    resolveOptionId: (id) =>
      models.find((model) => model.optionId === id || model.modelId === id)
        ?.optionId ?? null,
    addReference: (url, slot) => {
      if (slot === 'first' || slot === 'last') {
        ctx.dispatch({ type: 'SET_VIDEO_FRAME_SLOT', payload: { slot, url } })
        return
      }
      if (slot === 'video') {
        if (state.videoReferenceVideos.includes(url)) return
        ctx.dispatch({
          type: 'SET_VIDEO_REFERENCE_VIDEOS',
          payload: [...state.videoReferenceVideos, url],
        })
        return
      }
      if (!references.some((item) => item.url === url)) references.push({ url })
    },
    removeReference: (url, slot) => {
      if (slot === 'first' || slot === 'last') {
        ctx.dispatch({
          type: 'SET_VIDEO_FRAME_SLOT',
          payload: { slot, url: null },
        })
        return
      }
      if (slot === 'video') {
        ctx.dispatch({
          type: 'SET_VIDEO_REFERENCE_VIDEOS',
          payload: state.videoReferenceVideos.filter((entry) => entry !== url),
        })
        return
      }
      const index = references.findIndex((item) => item.url === url)
      if (index >= 0) references.splice(index, 1)
    },
    addAudioReference: ({ url, fileName }) => {
      if (state.videoAudioRefs.some((entry) => entry.url === url)) return
      ctx.dispatch({
        type: 'SET_VIDEO_AUDIO_REFS',
        payload: [
          ...state.videoAudioRefs,
          { id: `audio-${state.videoAudioRefs.length}`, url, fileName },
        ],
      })
    },
    removeAudioReference: (url) =>
      ctx.dispatch({
        type: 'SET_VIDEO_AUDIO_REFS',
        payload: state.videoAudioRefs.filter((entry) => entry.url !== url),
      }),
    setSound: (enabled) =>
      ctx.dispatch({ type: 'SET_VIDEO_GENERATE_AUDIO', payload: enabled }),
    mountUserUrl: () => {},
    unmountUserUrl: () => {},
    setPrimed: () => {},
  }
  return { snapshot, ctx, references }
}

let user: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  user = await createTestUser()
  await seedAssistantKey(user.id)
})

async function openTurn(
  snapshot: ReturnType<ReturnType<typeof workbench>['snapshot']>,
  face: Face = 'image',
) {
  const prepared = await prepareOperatorTurn(
    user.clerkId,
    {
      messages: [{ role: 'user', content: '帮我改一下' }],
      domain: face === 'video' ? 'video' : 'image',
      workspaceKey: WORKSPACE_KEY[face],
      snapshot,
    },
    new AbortController().signal,
  )
  prepared.run.nextKernel = true
  return prepared.run
}

const ASSET = {
  assetId: 'gen-asset-1',
  displayName: '图_001·红狐',
  url: 'https://cdn.example.test/fox.png',
  kind: 'image',
}

const AUDIO_ASSET = {
  assetId: 'gen-audio-1',
  displayName: '音_001·旁白',
  url: 'https://cdn.example.test/voice.mp3',
  kind: 'audio',
}

type Case = {
  tool: AssistantOperatorTool
  args: Record<string, unknown>
  fields: readonly StateKey[]
  /** 开轮之前台上已经有的。 */
  before?: (bench: ReturnType<typeof workbench>) => void
  /** 开轮之后、这一步之前这一轮已经查到的。 */
  during?: (run: Run) => void
}

const IMAGE_CASES: Case[] = [
  {
    tool: T.setPrompt,
    args: { value: 'a red fox in snow' },
    fields: ['prompt'],
  },
  {
    tool: T.setPrompt,
    args: { value: 'golden hour', mode: 'append', overwrite: true },
    fields: ['prompt'],
    before: (bench) =>
      bench.ctx.dispatch({ type: 'SET_PROMPT', payload: 'a red fox' }),
  },
  {
    tool: T.setNegative,
    args: { value: 'blurry' },
    fields: ['negativePrompt'],
  },
  {
    tool: T.setModel,
    args: { modelId: 'gpt-image-2' },
    fields: ['modelId', 'modelLabel'],
  },
  {
    tool: T.setSpecs,
    args: { aspectRatio: '16:9', resolution: '2K' },
    fields: ['aspectRatio', 'resolution'],
  },
  { tool: T.setCount, args: { count: 4 }, fields: ['count'] },
  {
    tool: T.mountReference,
    args: { assetId: ASSET.assetId },
    fields: ['referenceUrls', 'referenceCount'],
    during: (run) => run.searchIndex.set(ASSET.assetId, ASSET as never),
  },
  {
    tool: T.unmountReference,
    args: { slotIndex: 1 },
    fields: ['referenceUrls', 'referenceCount'],
    before: (bench) => bench.references.push({ url: ASSET.url }),
  },
]

const VIDEO_CASES: Case[] = [
  {
    tool: T.setPrompt,
    args: { value: 'a cat leaps over a fence' },
    fields: ['prompt'],
  },
  {
    tool: T.setModel,
    args: { modelId: VIDEO_MODELS[1]!.optionId },
    fields: ['modelId', 'modelLabel'],
  },
  {
    tool: T.setVideoSpecs,
    args: { durationSeconds: 10, aspectRatio: '9:16' },
    fields: ['videoDurationSeconds', 'videoAspectRatio', 'videoResolution'],
  },
  {
    tool: T.setSound,
    args: { enabled: false },
    fields: ['soundValue', 'soundEffective'],
  },
  {
    tool: T.mountReference,
    args: { assetId: ASSET.assetId, slot: 'first' },
    fields: ['frameFirstUrl', 'frameLastUrl', 'referenceUrls'],
    during: (run) => run.searchIndex.set(ASSET.assetId, ASSET as never),
  },
  {
    tool: T.mountReference,
    args: { assetId: ASSET.assetId },
    fields: ['referenceUrls', 'referenceCount', 'frameFirstUrl'],
    during: (run) => run.searchIndex.set(ASSET.assetId, ASSET as never),
  },
  {
    tool: T.mountAudioReference,
    args: { assetId: AUDIO_ASSET.assetId },
    fields: ['audioReferenceCount'],
    during: (run) =>
      run.searchIndex.set(AUDIO_ASSET.assetId, AUDIO_ASSET as never),
  },
]

const TAGS_CASES: Case[] = [
  {
    tool: T.setPrompt,
    args: { value: '1girl, solo, red hair' },
    fields: ['prompt'],
  },
  {
    tool: T.setTagCharacters,
    args: {
      positioning: 'auto',
      characters: [{ prompt: 'girl, red hair' }, { prompt: 'boy, black hair' }],
    },
    fields: ['novelAiCharacters'],
  },
  {
    tool: T.setSceneTexts,
    args: { items: [{ kind: 'sign', text: 'OPEN' }] },
    fields: ['novelAiSceneTexts'],
  },
]

async function roundTrip(
  face: Face,
  { tool, args, fields, before, during }: Case,
) {
  const bench = workbench(face)
  before?.(bench)
  const run = await openTurn(bench.snapshot(), face)
  during?.(run)

  const plan = await planTool(run, tool, args, user.id)
  expect(plan.kind, JSON.stringify(plan).slice(0, 300)).toBe('mutate')
  if (plan.kind !== 'mutate') return
  const beforeApply = structuredClone(run.state)
  plan.apply()
  // 这一步真改了台面（不然下面「对得上」是空话）。
  expect(
    fields.some(
      (field) => !isDeepStrictEqual(run.state[field], beforeApply[field]),
    ),
    `${tool} 没改到 ${fields.join('/')}`,
  ).toBe(true)

  // 浏览器收到的就是这一份：先过客户端 schema，再落进真表单。
  const step = AssistantOperatorAppliedStepSchema.parse({
    id: 'step-1',
    verb: ASSISTANT_OPERATOR_TOOL_VERBS[tool],
    title: tool,
    tool,
    status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    payload: plan.payload,
    inverse: plan.inverse,
  })
  applyOperatorStep(step, bench.ctx)

  const next = await openTurn(bench.snapshot(), face)
  for (const field of fields) {
    expect(next.state[field], `${field}：下一轮和这一轮对不上`).toEqual(
      run.state[field],
    )
  }
}

describe('图片台：这一轮记下的台面 = 浏览器落完之后下一轮带上来的台面', () => {
  it.each(IMAGE_CASES)('$tool $args', (item) => roundTrip('image', item))
})

describe('视频台：同上', () => {
  it.each(VIDEO_CASES)('$tool $args', (item) => roundTrip('video', item))
})

describe('标签台：同上', () => {
  it.each(TAGS_CASES)('$tool $args', (item) => roundTrip('tags', item))
})
