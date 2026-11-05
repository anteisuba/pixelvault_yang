import { act, fireEvent, screen } from '@testing-library/react'
import { NextResponse } from 'next/server'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS, IMAGE_GENERATION } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import {
  clearOperatorMentions,
  getOperatorState,
} from '@/hooks/use-studio-operator-store'
import { buildGenerationFailureResponseFields } from '@/services/generation-failure-response.service'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { generationFixture } from '@/test/generation-fixture'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import { GenerationPreview } from './GenerationPreview'

/**
 * 出图舞台，全程真的：真工作台、真 `useUnifiedGenerate`（提交 → 轮询 → 失败分类）、
 * 真进度层、真「问助手」管线、真播放器；只假网络、屏宽和时钟。
 * 生成态 / 失败态都是真去生成一次走出来的。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-preview' }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const T = (key: string) => text(`StudioV3.${key}`)
const ok = (data: unknown) => Response.json({ success: true, data })
const IMAGE = generationFixture({
  id: 'gen-1',
  url: 'https://cdn.example.com/gen-1.png',
  prompt: 'a cat',
})
const VIDEO = generationFixture({
  id: 'gen-v',
  outputType: 'VIDEO',
  url: 'https://cdn.example.com/gen-1.mp4',
  mimeType: 'video/mp4',
})

let server: ReturnType<typeof fakeStudioServer>
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  })
  stubBrowserLayout()
  setViewportWidth(DESKTOP_WIDTH)
  // 助手的引用登记住在模块级 store，跨用例会留着上一例那张图。
  clearOperatorMentions()
  server = fakeStudioServer()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

/** 提交成功、轮询回「失败」：失败字段用线上那个真函数从任务行拼出来。 */
function jobFailsWith(errorMessage: string, errorCode: string | null = null) {
  server
    .on('POST', API_ENDPOINTS.STUDIO_GENERATE, () =>
      NextResponse.json({
        success: true,
        data: { jobId: 'job-1', requestId: 'req-1' },
      }),
    )
    .on('GET', API_ENDPOINTS.STUDIO_GENERATE_STATUS, () =>
      ok({
        jobId: 'job-1',
        status: 'FAILED',
        ...buildGenerationFailureResponseFields({
          errorMessage,
          errorCode,
          hasReferenceImage: false,
        }),
      }),
    )
}

/** 提交一直挂着 —— 生成中。 */
function jobHangs() {
  server.on(
    'POST',
    API_ENDPOINTS.STUDIO_GENERATE,
    () => new Promise<Response>(() => {}),
  )
}

function generateImage(
  studio: { current: StudioHandle },
  modelId: string = AI_MODELS.GEMINI_FLASH_IMAGE,
) {
  return act(async () => {
    void studio.current.generation.generate({
      mode: 'image',
      image: { modelId, freePrompt: 'a cat', aspectRatio: '1:1' },
    })
    await vi.advanceTimersByTimeAsync(0)
  })
}

/** 生成一次并等轮询把失败带回来。 */
async function generateAndFail(studio: { current: StudioHandle }) {
  await generateImage(studio)
  await tick(IMAGE_GENERATION.POLL_INTERVAL_MS)
  await tick()
}

describe('GenerationPreview — 问助手入口', () => {
  it('图片结果上有「问助手」：按下去这张图进了助手输入框、助手面板打开', async () => {
    const { studio } = renderWithStudio(
      <GenerationPreview generation={IMAGE} isLatestResult />,
    )
    await tick()
    fireEvent.click(screen.getByRole('button', { name: T('toolAskAssistant') }))

    expect(JSON.stringify(getOperatorState().mentions)).toContain(IMAGE.url)
    expect(studio.current.state.panels.enhance).toBe(true)
  })

  // ⚠ vision 借路只吃图。视频/音频上放一个按下去必失败的按钮比没有更糟，
  // 所以这一档是**结构性缺席**而不是禁用态。
  it('非图片结果上没有这个入口', async () => {
    renderWithStudio(<GenerationPreview generation={VIDEO} isLatestResult />)
    await tick()
    expect(
      screen.queryByRole('button', { name: T('toolAskAssistant') }),
    ).not.toBeInTheDocument()
  })

  it('手机：入口在工具抽屉里照样够得着', async () => {
    setViewportWidth(MOBILE_WIDTH)
    const { studio } = renderWithStudio(
      <GenerationPreview generation={IMAGE} isLatestResult />,
    )
    await tick()
    // 手机：「更多」打开工具抽屉，「问助手」在里面。
    fireEvent.click(
      screen.getByRole('button', { name: text('StudioMobile.actionMore') }),
    )
    await tick()
    fireEvent.click(screen.getByRole('button', { name: T('toolAskAssistant') }))
    expect(JSON.stringify(getOperatorState().mentions)).toContain(IMAGE.url)
    expect(studio.current.state.panels.enhance).toBe(true)
  })
})

describe('GenerationPreview — 视频尺寸', () => {
  it('视频结果整段装进舞台（contain，⛔ 裁）', async () => {
    renderWithStudio(<GenerationPreview generation={VIDEO} isLatestResult />)
    await tick()
    const video = document.querySelector('video')
    expect(video).toHaveClass('video-player-media--contain')
  })
})

/**
 * 加载态 A（owner 2026-09-27「画布与工作台都就地说」）：失败在舞台上就地说一句原因
 * +「重试」—— ⛔ 错误对话框、⛔ 红框。
 */
describe('GenerationPreview — 加载态 A', () => {
  it('生成中：舞台上是那一条进度（⛔ 虚线外框、⛔ shimmer）', async () => {
    jobHangs()
    const { studio, container } = renderWithStudio(
      <GenerationPreview generation={null} />,
    )
    await tick()
    await generateImage(studio)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(container.querySelector('.border-dashed')).toBeNull()
    expect(container.querySelector('.studio-reveal-shimmer')).toBeNull()
  })

  it('别的台（标签台）在跑：自然语言台不显示它的进度，切回标签台才显示', async () => {
    jobHangs()
    const { studio } = renderWithStudio(
      <GenerationPreview generation={null} fillStage />,
    )
    await tick()
    await generateImage(studio, AI_MODELS.NOVELAI_V5_FULL)
    expect(screen.queryByRole('progressbar')).toBeNull()

    act(() =>
      studio.current.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' }),
    )
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('新生成失败：舞台上就地说原因 +「重试」', async () => {
    jobFailsWith('blocked by safety system', 'content_filtered')
    const onRetry = vi.fn()
    const { studio } = renderWithStudio(
      <GenerationPreview generation={null} onRetry={onRetry} />,
    )
    await tick()
    await generateAndFail(studio)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(text('Errors.generation.content_filtered'))
    expect(alert).not.toHaveTextContent('blocked by safety system')
    fireEvent.click(screen.getByRole('button', { name: T('retry') }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    // 取消键只在生成中给。
    expect(screen.queryByTestId('generation-preview-cancel')).toBeNull()
  })

  it('余额不足这类重试也没用的失败：只说原因，不给「重试」', async () => {
    jobFailsWith('Insufficient Anlas', 'provider_insufficient_balance')
    const { studio } = renderWithStudio(
      <GenerationPreview generation={null} onRetry={vi.fn()} />,
    )
    await tick()
    await generateAndFail(studio)

    expect(screen.getByRole('alert')).toHaveTextContent(
      text('Errors.provider.insufficientBalance'),
    )
    expect(screen.queryByRole('button', { name: T('retry') })).toBeNull()
  })

  it('重画失败：旧图留着，原因 +「重试」在图上那一层（只有一处报错）', async () => {
    jobFailsWith('429 Too Many Requests', 'provider_rate_limit')
    const onRetry = vi.fn()
    const { studio } = renderWithStudio(
      <GenerationPreview generation={IMAGE} isLatestResult onRetry={onRetry} />,
    )
    await tick()
    await generateAndFail(studio)

    expect(screen.getByRole('img', { name: 'a cat' })).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent(
      text('Errors.generation.provider_rate_limit'),
    )
    fireEvent.click(screen.getByRole('button', { name: T('retry') }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('另一台跑的失败：自然语言台 ⛔ 显示它', async () => {
    jobFailsWith('429 Too Many Requests', 'provider_rate_limit')
    const { studio } = renderWithStudio(<GenerationPreview generation={null} />)
    await tick()
    act(() =>
      studio.current.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' }),
    )
    await act(async () => {
      void studio.current.generation.generate({
        mode: 'image',
        image: {
          modelId: AI_MODELS.NOVELAI_V5_FULL,
          freePrompt: '1girl',
          aspectRatio: '1:1',
        },
      })
      await vi.advanceTimersByTimeAsync(0)
    })
    await tick(IMAGE_GENERATION.POLL_INTERVAL_MS)
    await tick()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    act(() =>
      studio.current.dispatch({
        type: 'SET_PROMPT_DIALECT',
        payload: 'natural',
      }),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('视频的失败由队列那一行说：舞台 ⛔ 再压一层（上一条视频照常看）', async () => {
    // 提交先挂着：舞台得先看到「在跑」，再看到失败（同一批里落地就测不出收尾那一支）
    let reject!: () => void
    server.on(
      'POST',
      API_ENDPOINTS.GENERATE_VIDEO,
      () =>
        new Promise<Response>((resolve) => {
          reject = () =>
            resolve(
              Response.json(
                {
                  success: false,
                  error: 'Quota exceeded',
                  errorCode: 'provider_rate_limit',
                },
                { status: 429 },
              ),
            )
        }),
    )
    const { studio } = renderWithStudio(
      <GenerationPreview generation={VIDEO} isLatestResult />,
    )
    await tick()
    act(() =>
      studio.current.dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' }),
    )
    let run!: Promise<unknown>
    act(() => {
      run = studio.current.generation.generate({
        mode: 'video',
        video: {
          modelId: AI_MODELS.SEEDANCE_20,
          prompt: 'a cat walks',
          aspectRatio: '16:9',
          duration: 5,
        },
      })
    })
    await tick()
    expect(studio.current.generation.isGenerating).toBe(true)
    await act(async () => {
      reject()
      await run
    })
    expect(studio.current.generation.error).not.toBeNull()

    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.querySelector('video')).toBeInTheDocument()
    // 旧视频上 ⛔ 放「出完了」的收尾（11-04 修：收尾只给这一轮新出来的那条）
    // 出图进度条带 aria-label（播放器自己的进度条不带）
    expect(
      screen
        .queryAllByRole('progressbar')
        .filter((bar) => bar.hasAttribute('aria-label')),
    ).toEqual([])
  })
})
