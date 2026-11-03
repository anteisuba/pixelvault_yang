/**
 * 错误显示整链（测试标准 L2b「错误显示」那一行）：服务端真路由出错 → 真 api-client 解析 →
 * 真 hook → 真 next-intl 整份文案 → 界面上那句话。只假网络（fetch）和 Clerk 登录。
 *
 * 每例断言两件事：界面是当前语言的**那一句**；服务端 / 浏览器的英文原话**不在**界面上。
 * 以前的测试把 `next-intl` 和 `api-error-message` 都替掉了（key 原样回、原话原样回），
 * 这一类问题从来没被测过。
 */
import { act, screen } from '@testing-library/react'
import { NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { IMAGE_GENERATION, API_ENDPOINTS } from '@/constants/config'
import { useUnifiedGenerate } from '@/hooks/use-unified-generate'
import { AssistantSkillsPane } from '@/features/assistant/components/settings/AssistantSkillsPane'
import { useAssistantSkills } from '@/features/assistant/hooks/use-assistant-skills'
import { LoraStackProvider } from '@/features/lora/hooks'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import {
  ApiRequestError,
  InsufficientCreditsError,
  ProviderError,
} from '@/lib/errors'
import { buildGenerationFailureResponseFields } from '@/services/generation-failure-response.service'
import {
  fakeServer,
  message,
  renderHookWithApp,
  renderWithApp,
} from '@/test/app-harness'

// ─── 边界：Clerk 登录、浏览器导航 ──────────────────────────────────

let signedInAs: string | null = 'user_chain'
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: signedInAs }),
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: signedInAs }),
  useUser: () => ({ user: signedInAs ? { id: signedInAs } : null }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

let server: ReturnType<typeof fakeServer>

beforeEach(() => {
  signedInAs = 'user_chain'
  server = fakeServer()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** 一条真的 GET 路由（路由工厂），处理函数里抛服务层会抛的那种错。 */
function failingGet(error: unknown) {
  return createApiGetRoute({
    schema: z.object({}).passthrough(),
    routeName: 'GET chain-test',
    requireAuth: true,
    handler: async () => {
      throw error
    },
  })
}

// ─── 一般接口：技能页 ─────────────────────────────────────────────

function SkillsHost() {
  const skills = useAssistantSkills()
  return <AssistantSkillsPane skills={skills} />
}

describe('一般接口出错 → 技能页那句话', () => {
  const cases: Array<{
    name: string
    arrange: () => void
    expected: string
    raw?: string
    locale?: 'zh' | 'ja'
  }> = [
    {
      name: '服务端程序异常：说「意外错误」，不露 TypeError 原话',
      arrange: () =>
        server.on(
          'GET',
          API_ENDPOINTS.ASSISTANT_SKILLS,
          failingGet(
            new TypeError(
              "Cannot read properties of undefined (reading 'slug')",
            ),
          ),
        ),
      expected: message('Errors.common.unexpected'),
      raw: 'Cannot read properties',
    },
    {
      name: '数据库额度用完：说数据库暂时不可用',
      arrange: () =>
        server.on(
          'GET',
          API_ENDPOINTS.ASSISTANT_SKILLS,
          failingGet(
            new Error(
              'Your project has exceeded the data transfer quota. Upgrade your plan.',
            ),
          ),
        ),
      expected: message('Errors.common.databaseUnavailable'),
      raw: 'data transfer quota',
    },
    {
      name: '没登录：请登录',
      arrange: () => {
        signedInAs = null
        server.on(
          'GET',
          API_ENDPOINTS.ASSISTANT_SKILLS,
          failingGet(new Error('unreachable')),
        )
      },
      expected: message('Errors.auth.unauthorized'),
      raw: 'Unauthorized',
    },
    {
      name: '网关回一页 HTML（Vercel 504）：说服务器太久没回应',
      arrange: () =>
        server.on(
          'GET',
          API_ENDPOINTS.ASSISTANT_SKILLS,
          () =>
            new Response('<html><body>504 Gateway Timeout</body></html>', {
              status: 504,
              headers: { 'Content-Type': 'text/html' },
            }),
        ),
      expected: message('Errors.transport.timeout'),
      raw: 'HTTP 504',
    },
    {
      name: '断网：说网络连不上',
      arrange: () => server.goOffline(),
      expected: message('Errors.transport.network'),
      raw: 'Failed to fetch',
    },
    {
      name: '日文界面：同一个错说日文',
      locale: 'ja',
      arrange: () =>
        server.on(
          'GET',
          API_ENDPOINTS.ASSISTANT_SKILLS,
          failingGet(new Error('boom')),
        ),
      expected: message('Errors.common.unexpected', 'ja'),
      raw: 'boom',
    },
  ]

  it.each(cases)('$name', async ({ arrange, expected, raw, locale }) => {
    arrange()
    renderWithApp(<SkillsHost />, { locale })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(expected)
    if (raw) expect(document.body).not.toHaveTextContent(raw)
  })
})

// ─── 出图：工作台生成 ─────────────────────────────────────────────

const IMAGE_INPUT = {
  modelId: 'gemini-3.1-flash-image',
  freePrompt: 'a red circle',
  aspectRatio: '1:1' as const,
}

/** 提交成功、轮询回「失败」：失败字段用线上那个真函数从任务行拼出来。 */
function jobFailsWith(errorMessage: string, errorCode: string | null = null) {
  server
    .on('POST', API_ENDPOINTS.STUDIO_GENERATE, () =>
      NextResponse.json({
        success: true,
        data: { jobId: 'job-chain', requestId: 'req-chain' },
      }),
    )
    .on(
      'GET',
      API_ENDPOINTS.STUDIO_GENERATE_STATUS,
      createApiGetRoute({
        schema: z.object({ jobId: z.string() }),
        routeName: 'GET chain-status',
        requireAuth: true,
        handler: async ({ data }) => ({
          jobId: data.jobId,
          status: 'FAILED' as const,
          ...buildGenerationFailureResponseFields({
            errorMessage,
            errorCode,
            hasReferenceImage: false,
          }),
        }),
      }),
    )
}

function submitFailsWith(error: unknown) {
  server.on(
    'POST',
    API_ENDPOINTS.STUDIO_GENERATE,
    createApiRoute({
      schema: z.object({}).passthrough(),
      routeName: 'POST chain-generate',
      handler: async () => {
        throw error
      },
    }),
  )
}

async function generateOnce() {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  })
  const hook = renderHookWithApp(() => useUnifiedGenerate(), {
    inner: LoraStackProvider,
  })
  let done: Promise<unknown>
  await act(async () => {
    done = hook.result.current.generate({ mode: 'image', image: IMAGE_INPUT })
    await vi.advanceTimersByTimeAsync(0)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS)
  })
  await act(async () => {
    await done!
  })
  return hook.result.current.error
}

describe('出图出错 → 舞台上那句话', () => {
  it('点数不够（提交就被拒）', async () => {
    submitFailsWith(new InsufficientCreditsError())
    const shown = await generateOnce()
    expect(shown).toBe(message('Errors.credits.exceeded'))
  })

  it('服务商超时（提交时）', async () => {
    submitFailsWith(
      new ProviderError('gemini', 'Request timed out after 60000ms', {
        timeout: true,
      }),
    )
    const shown = await generateOnce()
    expect(shown).toBe(message('Errors.provider.timeout'))
    expect(shown).not.toContain('timed out')
  })

  it('服务端程序异常（提交时）：意外错误，不露原话', async () => {
    submitFailsWith(
      new TypeError("Cannot read properties of null (reading 'id')"),
    )
    const shown = await generateOnce()
    expect(shown).toBe(message('Errors.common.unexpected'))
  })

  it('带专门文案的业务错（ApiRequestError）', async () => {
    submitFailsWith(
      new ApiRequestError(
        'INVALID_QUERY',
        400,
        'errors.gallery.invalidQuery',
        'Invalid query parameters',
      ),
    )
    const shown = await generateOnce()
    expect(shown).toBe(message('Errors.gallery.invalidQuery'))
  })

  it('断网（提交时）', async () => {
    server.goOffline()
    const shown = await generateOnce()
    expect(shown).toBe(message('Errors.transport.network'))
  })

  it('Worker 回「fetch failed」：说连不上服务商，不说参考图', async () => {
    jobFailsWith('fetch failed')
    const shown = await generateOnce()
    expect(shown).toBe(message('Errors.generation.provider_unreachable'))
  })

  it('LoRA 文件取不到（fal 422 原话）：说 LoRA 下载不到', async () => {
    jobFailsWith(
      'fal.ai API error (422): {"detail":[{"loc":["body","loras"],"msg":"Failed to download the file. Please check if the URL is accessible and try again.","type":"file_download_error"}]}',
    )
    const shown = await generateOnce()
    expect(shown).toBe(message('Errors.generation.lora_unreachable'))
  })

  it('认不出的服务商原话：中文开头 + 原话（owner：未知错误照旧给原话）', async () => {
    const raw = 'Step poll-runner-image-80-1 output is too large.'
    jobFailsWith(raw)
    const shown = await generateOnce()
    const prefix = message('Errors.generation.unknownWithDetail').split('{')[0]!
    expect(shown?.startsWith(prefix)).toBe(true)
    expect(shown).toContain(raw)
  })
})
