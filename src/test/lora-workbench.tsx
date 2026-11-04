/**
 * LoRA 工作台（`LoraWorkbench`）组件测试的底座：真挂载栈 / 真 key 名单 / 真标签台 /
 * 真来源图配方 / 真出图链，只假网络。
 *
 * 被测文件自己声明这几条 `vi.mock`（工厂会被提升，放不进这里）：
 * `next-intl`（同一命名空间回同一个 `t`）、`@clerk/nextjs`（`useAuth` + `useUser`）、
 * `next/navigation` / `@/i18n/navigation`、`sonner`，以及在 `@/lib/api-client` 上替掉
 * `studioGenerateAPI / checkImageGenerationStatusAPI / cancelGenerationsAPI`、在
 * `@/lib/api-client/generation` 上替掉 `uploadImageFileAPI`。
 *
 * 模块级缓存（来源图配方 / 作者描述 / 公开库）由被测文件在 `beforeEach` 里清
 * （`__reset…ForTests` 只在 lora 域里可见）。
 *
 * 其余请求都走 `loraWorkbenchServer()` 登记的假服务端：挂载时那一串（key 名单、库、
 * 标签台、人设、Runner 额度…）默认空答，用例按需改 `bench` 上的几格。
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { expect, type Mock } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import type {
  LoraAssetRecord,
  RunnerUsageResult,
  StudioGenerateRequest,
} from '@/types'
import type { PromptTagSelection } from '@/types/prompt-tags'

import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { LoraStackProvider } from '@/features/lora/hooks'
import { PromptTagProvider } from '@/hooks/use-prompt-tag-stack'
import { fakeServer } from '@/test/app-harness'
import { stubBrowserObservers } from '@/test/fake-routes'
import { loraAsset } from '@/test/lora-stack'

export const json = (data: unknown) => Response.json({ success: true, data })

/** 一张来源图配方（Civitai 挖出来的那份）。 */
export interface MinedRecipeFixture {
  imageUrl: string
  source: string
  prompt: string
  [key: string]: unknown
}

/** 这一例服务端怎么答；每例 `loraWorkbenchServer()` 都重置。 */
export interface BenchState {
  minedRecipes: MinedRecipeFixture[]
  showcase: { images: string[]; prompts: string[] }
  runnerUsage: RunnerUsageResult | null
  traySelections: PromptTagSelection[]
  /** 补挂配方里的额外 LoRA：按 modelVersionId 答；`null` = 本地库和 Civitai 都没有。 */
  resolve: (modelVersionId: number) => Promise<LoraAssetRecord | null>
  /** `?template=` 取模板：`null` = 已删（可以晚一点才回）。 */
  recipe: (id: string) => unknown
  /** 「存成模板」发给服务端的那几份请求体。 */
  savedTemplates: unknown[]
  /** 来源图配方请求带了哪个 modelId（HF 挂载不该发）。 */
  minedRequests: string[]
}

/** jsdom 没有的那几样（权重条 / 弹层要用）：补成空转。 */
function stubBrowserGaps() {
  stubBrowserObservers()
  const element = HTMLElement.prototype as Partial<HTMLElement>
  element.hasPointerCapture ??= () => false
  element.setPointerCapture ??= () => {}
  element.releasePointerCapture ??= () => {}
}

export function loraWorkbenchServer() {
  stubBrowserGaps()
  const bench: BenchState = {
    minedRecipes: [],
    showcase: { images: [], prompts: [] },
    runnerUsage: null,
    traySelections: [],
    resolve: async () => null,
    recipe: () => null,
    savedTemplates: [],
    minedRequests: [],
  }

  const server = fakeServer()
    .on('GET', API_ENDPOINTS.API_KEYS, () => json([]))
    .on('GET', API_ENDPOINTS.LORA_ASSETS, () => json([]))
    .on('GET', `${API_ENDPOINTS.LORA_ASSETS}/discover`, () => json([]))
    .on('GET', API_ENDPOINTS.CHARACTER_LORAS, () => json([]))
    .on('GET', API_ENDPOINTS.PROMPT_TAG_STACK, () =>
      json({
        stack: { positive: bench.traySelections, negative: [] },
      }),
    )
    .on('PUT', API_ENDPOINTS.PROMPT_TAG_STACK, () => json({}))
    // 人设这一跳失败：工作台照常用默认那套。
    .on('GET', '/api/assistant/persona', () =>
      Response.json({ success: false, error: 'offline' }, { status: 500 }),
    )
    // 助手面板：没有过对话。
    .on('GET', API_ENDPOINTS.ASSISTANT_CONVERSATION, (request) =>
      json(request.nextUrl.searchParams.get('list') ? [] : null),
    )
    .on('GET', API_ENDPOINTS.RUNNER_USAGE, () =>
      bench.runnerUsage
        ? json(bench.runnerUsage)
        : Response.json({ success: false, error: 'off' }, { status: 500 }),
    )
    .on('GET', API_ENDPOINTS.LORA_ASSETS_CIVITAI_MINED_PROMPTS, (request) => {
      bench.minedRequests.push(
        request.nextUrl.searchParams.get('modelId') ?? '',
      )
      return json({
        recipes: bench.minedRecipes,
        previewImages: [],
        totalSampled: bench.minedRecipes.length,
      })
    })
    .on('GET', API_ENDPOINTS.LORA_ASSETS_CIVITAI_DESCRIPTION, () =>
      json({ descriptionText: null, versions: [] }),
    )
    .on('GET', API_ENDPOINTS.LORA_ASSETS_CIVITAI_DOWNLOAD_POLICY, () =>
      json({ downloadDisabled: false }),
    )
    // 「挑 LoRA」框里的公开库：空的。
    .on('GET', API_ENDPOINTS.LORA_ASSETS_CIVITAI, () =>
      json({
        items: [],
        page: 1,
        pageSize: 12,
        total: 0,
        totalCapped: false,
        hasNextPage: false,
        literalTotal: 0,
        fallback: null,
      }),
    )
    .on('GET', API_ENDPOINTS.LORA_ASSETS_HUGGINGFACE, () =>
      json({
        items: [],
        total: 0,
        page: 1,
        limit: 24,
        hasNextPage: false,
        nextCursor: null,
      }),
    )
    .on('GET', API_ENDPOINTS.LORA_ASSETS_HUGGINGFACE_SHOWCASE, () =>
      json(bench.showcase),
    )
    .on('GET', API_ENDPOINTS.LORA_ASSETS_CIVITAI_RESOLVE, async (request) => {
      const id = Number(request.nextUrl.searchParams.get('modelVersionId'))
      const asset = await bench.resolve(id)
      return asset
        ? json(asset)
        : Response.json({ success: false, error: 'not found' }, { status: 404 })
    })
    .on('GET', `${API_ENDPOINTS.RECIPES}/:id`, (_request, { params }) =>
      params.then(async ({ id }) => {
        const recipe = await bench.recipe(id)
        return recipe
          ? json(recipe)
          : Response.json(
              { success: false, error: 'Not found' },
              { status: 404 },
            )
      }),
    )
    .on('POST', `${API_ENDPOINTS.RECIPES}/from-generation`, async (request) => {
      bench.savedTemplates.push(await request.json())
      return json({ id: 'recipe-new' })
    })

  return { server, bench }
}

export function LoraWorkbenchProviders({ children }: { children: ReactNode }) {
  return (
    <ApiKeysProvider>
      <LoraStackProvider>
        <PromptTagProvider>{children}</PromptTagProvider>
      </LoraStackProvider>
    </ApiKeysProvider>
  )
}

export function renderInProviders(ui: ReactElement) {
  return render(ui, { wrapper: LoraWorkbenchProviders })
}

export const promptBox = () =>
  screen.getByPlaceholderText('LoraWorkbench:generate.promptPlaceholder')
export const negativeBox = () =>
  screen.getByPlaceholderText(
    'LoraWorkbench:generate.negativePromptPlaceholder',
  )
export const generateButton = () =>
  screen.getByRole('button', { name: /LoraWorkbench:generate\.run/ })
export const triggerAddButton = () =>
  screen.getByRole('button', { name: 'LoraWorkbench:generate.triggerAdd' })
/** 输入框里挂着的那几颗 LoRA 胶囊。 */
export const mountedPills = () =>
  screen.queryAllByRole('button', { name: 'LoraWorkbench:pill.openLabel' })

/**
 * 渲染工作台，等挂载栈从 localStorage 读回来（`pills` = 种了几把；空栈给 0，
 * 等的是「＋ 添加 LoRA」那颗）。手机上胶囊收在装配 sheet 里：等装配摘要那颗。
 */
export async function renderBench(ui: ReactElement, pills = 1) {
  const view = renderInProviders(ui)
  if (window.innerWidth < 768)
    await screen.findByRole('button', {
      name: 'LoraWorkbench:spine.openAssembly',
    })
  else if (pills > 0)
    await waitFor(() => expect(mountedPills()).toHaveLength(pills))
  else
    await screen.findByRole('button', { name: 'LoraWorkbench:pill.addLabel' })
  return view
}

/** 按一下出图，等这一单发到服务端、键回到可按；回这一单的请求体。 */
export async function submitGeneration(
  studioGenerateAPI: Mock,
): Promise<StudioGenerateRequest> {
  const sent = studioGenerateAPI.mock.calls.length
  fireEvent.click(generateButton())
  await waitFor(() => expect(studioGenerateAPI).toHaveBeenCalledTimes(sent + 1))
  await waitFor(() => expect(generateButton()).toBeEnabled())
  return studioGenerateAPI.mock.calls[sent]![0] as StudioGenerateRequest
}

/** 挂载胶囊里的开关：暂停 / 接着用（第 `index` 颗）。 */
export function toggleMountedLora(index = 0) {
  fireEvent.click(mountedPills()[index]!)
  fireEvent.click(screen.getByRole('switch'))
  fireEvent.click(mountedPills()[index]!)
}

/** 卸掉第 `index` 颗。 */
export function removeMountedLora(index = 0) {
  fireEvent.click(mountedPills()[index]!)
  const removes = screen.getAllByRole('button', {
    name: 'LoraWorkbench:pill.remove',
  })
  // 刚关上的那几层还在退场：点最后开的那一层。
  fireEvent.click(removes.at(-1)!)
}

/** 台面顶上那一行「出过的图 ›」：点它长出浮层（ui-spec ㊲），样例 / 配方都在浮层里。 */
export function openSourceBand() {
  fireEvent.click(
    within(screen.getByTestId('lora-source-band')).getAllByRole('button')[0]!,
  )
}

/** 来源图缩略 → 共享配方框 → 做同款（只挖到一张配方时）。 */
export async function applyFirstRecipe() {
  fireEvent.click(
    await screen.findByLabelText(
      /LoraPromptControl\.generate:sourceImagePreviewLabel/,
    ),
  )
  fireEvent.click(screen.getByText('LoraWorkbench:sourceRecipeRemake'))
}

/** 挂着的那把（作者认过触发词，Civitai 来的）。 */
export function mountedLora(patch: Partial<LoraAssetRecord> = {}) {
  return loraAsset('lora-1', {
    name: 'Test LoRA',
    triggerWord: 'testlora',
    triggerSource: 'official',
    modelId: 1,
    modelVersionId: 11,
    defaultScale: 1,
    ...patch,
  })
}

/** 一张来源图配方（做同款用）。 */
export function minedRecipe(
  patch: Partial<MinedRecipeFixture> = {},
): MinedRecipeFixture {
  return {
    imageUrl: 'https://example.com/source.png',
    source: 'model_version_image',
    prompt: 'best quality, 1girl',
    ...patch,
  }
}
