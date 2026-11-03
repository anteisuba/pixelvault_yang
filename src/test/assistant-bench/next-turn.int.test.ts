/**
 * L2c 下一轮对账：服务端这一轮记下的台面，和浏览器把同一步落到**真表单**之后、
 * 下一轮带上来的台面，必须一样。
 *
 * 一条链全是真代码：真表单 reducer（`studioFormReducer`）→ 真快照（宿主同一份
 * `buildWorkbenchOperatorForm` + `buildImageOperatorSnapshot`）→ 真 `prepareOperatorTurn`
 * （真库）→ `planTool` / `apply` → 这一步按客户端 schema 解析 → 真 `applyOperatorStep` 落表单
 * → 再拍快照 → 再开一轮。
 * ⚠ 参考图槽在测试里是一个数组（宿主那边是上传 hook），模型清单是手写的两条可跑路线。
 */
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
import {
  planTool,
  prepareOperatorTurn,
} from '@/features/assistant/services/assistant-operator.service'
import {
  applyOperatorStep,
  type StudioOperatorApplyContext,
} from '@/lib/studio-operator-apply'
import {
  buildImageOperatorSnapshot,
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

const MODELS = [option('seedream-4.5'), option('gpt-image-2')]

/** 一张真工作台表单 + 参考图槽：快照怎么拍、步怎么落，都走宿主那几个纯函数。 */
function workbench() {
  let state: StudioFormState = {
    ...STUDIO_INITIAL_FORM_STATE,
    outputType: 'image',
    selectedOptionId: MODELS[0]!.optionId,
  }
  const references: { url: string }[] = []
  const selected = () =>
    MODELS.find((model) => model.optionId === state.selectedOptionId)

  const snapshot = () =>
    buildImageOperatorSnapshot({
      form: buildWorkbenchOperatorForm(state),
      modelOptions: MODELS,
      selectedModel: selected(),
      runModels: selected() ? [selected()!] : [],
      references: { items: references, limit: 4 },
    })

  const ctx: StudioOperatorApplyContext = {
    getState: () => state,
    dispatch: (action) => {
      state = studioFormReducer(state, action)
    },
    resolveOptionId: (modelId) =>
      MODELS.find((model) => model.modelId === modelId)?.optionId ?? null,
    addReference: (url) => {
      if (!references.some((item) => item.url === url)) references.push({ url })
    },
    removeReference: (url) => {
      const index = references.findIndex((item) => item.url === url)
      if (index >= 0) references.splice(index, 1)
    },
    addAudioReference: () => {},
    removeAudioReference: () => {},
    setSound: () => {},
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
) {
  const prepared = await prepareOperatorTurn(
    user.clerkId,
    {
      messages: [{ role: 'user', content: '帮我改一下' }],
      domain: 'image',
      workspaceKey: 'image-natural',
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

const CASES: Array<{
  tool: AssistantOperatorTool
  args: Record<string, unknown>
  fields: readonly StateKey[]
  /** 开轮之前台上已经有的。 */
  before?: (bench: ReturnType<typeof workbench>) => void
  /** 开轮之后、这一步之前这一轮已经查到的。 */
  during?: (run: Run) => void
}> = [
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

describe('图片台：这一轮记下的台面 = 浏览器落完之后下一轮带上来的台面', () => {
  it.each(CASES)(
    '$tool $args',
    async ({ tool, args, fields, before, during }) => {
      const bench = workbench()
      before?.(bench)
      const run = await openTurn(bench.snapshot())
      during?.(run)

      const plan = await planTool(run, tool, args, user.id)
      expect(plan.kind, JSON.stringify(plan).slice(0, 300)).toBe('mutate')
      if (plan.kind !== 'mutate') return
      plan.apply()

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

      const next = await openTurn(bench.snapshot())
      for (const field of fields) {
        expect(next.state[field], `${field}：下一轮和这一轮对不上`).toEqual(
          run.state[field],
        )
      }
    },
  )
})
