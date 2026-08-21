import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { AI_MODELS, getModelMessageKey } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { PromptAssistantDisplayMessage } from '@/hooks/kernel/use-prompt-assistant'
import type { AssistantWriteback } from '@/types/assistant-writeback'

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

const sendMock = vi.fn()
const applyPresetMock = vi.fn()
let mockMessages: PromptAssistantDisplayMessage[] = []

vi.mock('@/hooks/kernel/use-prompt-assistant', () => ({
  STYLE_SHORTCUTS: {
    imageStyle: 'image-style-shortcut',
    detailed: 'detailed-shortcut',
    artistic: 'artistic-shortcut',
    photorealistic: 'photo-shortcut',
    anime: 'anime-shortcut',
    lora: 'lora-shortcut',
    tags: 'tags-shortcut',
  },
  usePromptAssistant: () => ({
    messages: mockMessages,
    isLoading: false,
    error: null,
    send: sendMock,
    applyPreset: applyPresetMock,
    clear: vi.fn(),
  }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))
vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: vi.fn().mockResolvedValue({
    success: true,
    data: { generations: [] },
  }),
}))

import { PromptAssistantPanel } from './PromptAssistantPanel'

/**
 * 构造一个写回适配器。**默认是最贫瘠的那一档**（只有必填的 prompt），
 * 每个用例按需补它真要断言的字段——这样「这一档没有这一项」在测试里也是
 * 显式的，与四档宿主矩阵同构。
 */
function makeWriteback(
  overrides: Record<string, unknown> = {},
): AssistantWriteback {
  const field = (extra: Record<string, unknown> = {}) => ({
    apply: vi.fn(),
    isApplied: () => false,
    ...extra,
  })
  const { prompt, negative, aspectRatio, model, batchCount, ...rest } =
    overrides as Record<string, Record<string, unknown> | undefined>
  return {
    prompt: field(prompt) as AssistantWriteback['prompt'],
    ...(negative ? { negative: field(negative) } : {}),
    // 比例 / 张数默认可用：收窄失败的用例断言的是「行不出现」，
    // 若字段本身缺席就分不清是收窄挡的还是宿主没有。
    aspectRatio: field(aspectRatio) as AssistantWriteback['aspectRatio'],
    batchCount: field(batchCount) as AssistantWriteback['batchCount'],
    model: field(model) as AssistantWriteback['model'],
    resolveModelLabel: (id: string) => id,
    ...rest,
  } as AssistantWriteback
}

beforeEach(() => {
  mockMessages = []
  sendMock.mockClear()
  applyPresetMock.mockClear()
})

describe('PromptAssistantPanel', () => {
  it('uses the model route controlled by the shared assistant header', () => {
    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        assistantRoute={{
          optionId: 'gemini-key',
          apiKeyId: 'key-1',
          adapterType: AI_ADAPTER_TYPES.GEMINI,
        }}
      />,
    )

    fireEvent.click(screen.getByText('starterA'))
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(sendMock.mock.calls[0][1]).toMatchObject({ apiKeyId: 'key-1' })
  })

  it('keeps action presets and drops the style presets (decision 5②)', () => {
    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )

    for (const key of [
      'presetImageStyle',
      'presetDetailed',
      'presetLora',
      'presetTags',
    ]) {
      expect(screen.getByText(key)).toBeInTheDocument()
    }
    for (const key of ['presetArtistic', 'presetPhoto', 'presetAnime']) {
      expect(screen.queryByText(key)).not.toBeInTheDocument()
    }
  })

  it('renders starter examples and prefills before sending', () => {
    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )

    expect(screen.getByText('starterA')).toBeInTheDocument()
    expect(screen.getByText('starterB')).toBeInTheDocument()
    expect(screen.getByText('starterC')).toBeInTheDocument()

    fireEvent.click(screen.getByText('starterA'))
    expect(sendMock).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('placeholder')).toHaveValue('starterA')
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(sendMock).toHaveBeenCalledWith('starterA', expect.any(Object))
  })

  it('shows translated target model label instead of raw model id', () => {
    render(
      <PromptAssistantPanel
        currentPrompt=""
        modelId={AI_MODELS.OPENAI_GPT_IMAGE_2}
        writeback={makeWriteback()}
      />,
    )

    expect(
      screen.getByText(
        `${getModelMessageKey(AI_MODELS.OPENAI_GPT_IMAGE_2)}.label`,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(AI_MODELS.OPENAI_GPT_IMAGE_2),
    ).not.toBeInTheDocument()
  })
  // ── 动作条（方向 A · owner 2026-08-20 拍板七条）─────────────────────

  it('fills the prompt block, not the whole message', async () => {
    // 正文里**故意**混进散文和一行「负面提示词：」——这正是 bug 当时灌进
    // 正面框的东西。断言 apply 收到的是 positive 而不是 content。
    mockMessages = [
      {
        role: 'assistant',
        content:
          '这版走冷调。负面提示词：blurry, watermark。建议参数：steps 30。',
        promptDraft: { positive: 'a moody ivory hallway' },
      },
    ]
    const apply = vi.fn()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

    render(
      <PromptAssistantPanel
        currentPrompt="base prompt"
        writeback={makeWriteback({ prompt: { apply } })}
      />,
    )

    fireEvent.click(screen.getByText('usePrompt'))
    expect(apply).toHaveBeenCalledWith('a moody ivory hallway')

    // 复制照旧给全文——复制一段对话文本没有歧义。
    fireEvent.click(screen.getByText('copyPrompt'))
    expect(writeText).toHaveBeenCalledWith(mockMessages[0].content)
    expect(await screen.findByText('copied')).toBeInTheDocument()

    vi.unstubAllGlobals()
  })

  it('offers no fill action when the reply carries no prompt block', () => {
    // 档 1/档 2 的回复（反问、讨论方向）没有成品提示词。没有块 = 没有按钮，
    // 比给一个会把散文灌进提示词框的按钮诚实。
    mockMessages = [{ role: 'assistant', content: '你想要写实还是动画风？' }]
    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )

    expect(screen.queryByText('usePrompt')).not.toBeInTheDocument()
    expect(screen.getByText('copyPrompt')).toBeInTheDocument()
  })

  // ── 切片 S3：「已应用」是算出来的，不是存下来的 ──────────────────

  it('shows applied when the form already equals the suggestion — no state kept', () => {
    // ⚠ 没有任何人「点过」——面板只是发现当前提示词恰好等于这条建议。
    // 这正是刷新后应该看到的画面：值还匹配 → 已应用；没有快照 → 不给撤销。
    mockMessages = [
      {
        role: 'assistant',
        content: 'done',
        promptDraft: { positive: 'a moody ivory hallway' },
      },
    ]

    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback({
          prompt: { isApplied: (v: string) => v === 'a moody ivory hallway' },
        })}
      />,
    )

    // ⚠ 两个节点：可见的那枚 + aria-live 播报用的 sr-only（切片 S6 要求的，
    // 否则「就地变已应用」对读屏用户等于什么都没发生）。所以用 getAllByText。
    expect(screen.getAllByText('applied').length).toBeGreaterThan(0)
    expect(screen.queryByText('usePrompt')).not.toBeInTheDocument()
    // 没传 undo → 不显示撤销。
    expect(screen.queryByText('undoApply')).not.toBeInTheDocument()
  })

  it('offers undo only while a snapshot exists', () => {
    mockMessages = [
      { role: 'assistant', content: 'done', promptDraft: { positive: 'p' } },
    ]
    const undo = vi.fn()

    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback({
          prompt: { isApplied: () => true, undo },
        })}
      />,
    )

    fireEvent.click(screen.getByText('undoApply'))
    expect(undo).toHaveBeenCalled()
  })

  it('brings back append as the alternative to being overwritten', () => {
    // owner 2026-08-20 第 4 条翻案。它 08-18 被砍过，今天带新语义回来：
    // 撤销的前提是「值没被人动过」，手改之后就只剩追加这条路。
    mockMessages = [
      { role: 'assistant', content: 'done', promptDraft: { positive: 'p' } },
    ]
    const appendPrompt = vi.fn()

    render(
      <PromptAssistantPanel
        currentPrompt="用户自己写的一段"
        writeback={makeWriteback({ appendPrompt })}
      />,
    )

    fireEvent.click(screen.getByText('appendPrompt'))
    expect(appendPrompt).toHaveBeenCalledWith('p')
  })

  // ── 配置盒 ────────────────────────────────────────────────────────

  it('routes the negative field to its own row, never to the prompt', () => {
    mockMessages = [
      {
        role: 'assistant',
        content: 'done',
        promptDraft: { positive: 'p', negative: 'blurry, watermark' },
      },
    ]
    const applyPrompt = vi.fn()
    const applyNegative = vi.fn()

    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback({
          prompt: { apply: applyPrompt },
          negative: { apply: applyNegative },
        })}
      />,
    )

    expect(screen.getByText('rowNegative')).toBeInTheDocument()
    fireEvent.click(screen.getByText('apply'))
    expect(applyNegative).toHaveBeenCalledWith('blurry, watermark')
    expect(applyPrompt).not.toHaveBeenCalled()
  })

  it('says why a field is unavailable in this host instead of hiding it', () => {
    // 缺席原因第 ① 类（宿主没这个能力）。图片工作台没有负面框——
    // 静默消失让用户分不清是助手没给还是产品不支持。
    mockMessages = [
      {
        role: 'assistant',
        content: 'done',
        promptDraft: { positive: 'p', negative: 'blurry' },
      },
    ]

    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback({
          negative: { unavailableReason: 'unavailableHere' },
        })}
      />,
    )

    expect(screen.getByText('unavailableHere')).toBeInTheDocument()
    // 不可用的那一行不给「应用」。
    expect(screen.queryByText('apply')).not.toBeInTheDocument()
  })

  it('drops an aspect ratio this product does not support', () => {
    // 模型可以自由吐字符串。`21:9` 不在 IMAGE_SIZES 里 —— 不出这一行，
    // 而不是把一个生成时会炸的值塞进规格表单。
    mockMessages = [
      {
        role: 'assistant',
        content: 'done',
        promptDraft: { positive: 'p', aspectRatio: '21:9' },
      },
    ]

    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )

    expect(screen.queryByText('rowRatio')).not.toBeInTheDocument()
  })

  it('drops a batch count that is not a supported tier', () => {
    // 3 不在 IMAGE_BATCH_COUNTS([1,2,4])。那三个数还连着 MAX_ACTIVE_JOBS_PER_USER，
    // 塞一个不存在的档位进表单只会在生成时炸。
    mockMessages = [
      { role: 'assistant', content: 'done', setup: { batchCount: 3 } },
    ]

    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )

    expect(screen.queryByText('rowBatch')).not.toBeInTheDocument()
  })

  it('drops a model id that is not in the workbench catalog', () => {
    mockMessages = [
      { role: 'assistant', content: 'done', setup: { model: 'midjourney-v9' } },
    ]

    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback({ resolveModelLabel: () => null })}
      />,
    )

    expect(screen.queryByText('rowModel')).not.toBeInTheDocument()
  })

  it('keeps the setup rows independent — a bad model id does not kill the batch row', () => {
    mockMessages = [
      {
        role: 'assistant',
        content: 'done',
        setup: { model: 'not-a-real-model', batchCount: 2 },
      },
    ]
    const applyBatch = vi.fn()

    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback({
          resolveModelLabel: () => null,
          batchCount: { apply: applyBatch },
        })}
      />,
    )

    expect(screen.queryByText('rowModel')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('apply'))
    expect(applyBatch).toHaveBeenCalledWith(2)
  })

  it('warns before switching to a model that is already in the compare list', () => {
    // owner 第 3 条：撞上对比名单会让这一轮静默少跑一个模型。
    mockMessages = [
      {
        role: 'assistant',
        content: 'done',
        setup: { model: 'illustrious-xl' },
      },
    ]

    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback({
          model: { noteFor: () => 'modelAlreadyCompared' },
        })}
      />,
    )

    expect(screen.getByText('modelAlreadyCompared')).toBeInTheDocument()
  })

  it('promotes the only config row when there is no prompt to deliver', () => {
    // 档 2 常规形态：只提配置、没有成品提示词。三档层级靠「有且只有一个实心」
    // 建立，主动作缺席时锚点转移到配置行，而不是整条动作条失去层级。
    mockMessages = [
      { role: 'assistant', content: '该换个模型', setup: { batchCount: 4 } },
    ]

    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )

    expect(screen.queryByText('usePrompt')).not.toBeInTheDocument()
    expect(screen.getByText('rowBatch')).toBeInTheDocument()
    expect(screen.getByText('apply')).toBeInTheDocument()
  })
  // ── D5/D4 composer 收敛（2026-07-07 dock 重设计）────────────────

  it('keeps research in the shared header instead of duplicating it in the composer', () => {
    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )

    expect(
      screen.queryByRole('button', { name: 'research' }),
    ).not.toBeInTheDocument()
  })

  // ── 检索三态（AI 导演内核 · 切片 1）─────────────────────────────────
  //
  // ⚠ 旧的 `research: boolean` 已删，不留兼容层：服务端把 `false` 映射成
  // `auto`（那个布尔表达的是「没主动开」），所以布尔**表达不出「明确关闭」**
  // —— 只发布尔等于用户没有关闭手段。这三条断言的就是「三个位置各自送对」。
  it.each([['auto' as const], ['forced' as const], ['off' as const]])(
    'sends researchMode=%s verbatim with the message',
    (mode) => {
      render(
        <PromptAssistantPanel
          currentPrompt=""
          writeback={makeWriteback()}
          researchMode={mode}
        />,
      )
      fireEvent.click(screen.getByText('starterA'))
      fireEvent.click(screen.getByRole('button', { name: 'send' }))

      expect(sendMock).toHaveBeenCalledTimes(1)
      expect(sendMock.mock.calls[0][1]).toMatchObject({ researchMode: mode })
    },
  )

  it('defaults to auto and never sends the retired boolean', () => {
    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )
    fireEvent.click(screen.getByText('starterA'))
    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    const options = sendMock.mock.calls[0][1] as Record<string, unknown>
    expect(options.researchMode).toBe('auto')
    expect(options).not.toHaveProperty('research')
  })

  it('merges the two image buttons into a single popover trigger', () => {
    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )

    expect(
      screen.getByRole('button', { name: 'addReference' }),
    ).toBeInTheDocument()
    // 旧的独立「选素材」按钮不再存在（selectAsset 只剩 Dialog 标题用途）
    expect(
      screen.queryByRole('button', { name: 'selectAsset' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'addImage' }),
    ).not.toBeInTheDocument()
  })

  it('fills the reference slot from an injected dock drop', () => {
    const { rerender } = render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        injectedReference={undefined}
      />,
    )
    expect(screen.queryByAltText('referenceImageAlt')).not.toBeInTheDocument()

    rerender(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        injectedReference={{ url: 'https://cdn.example.com/ref.png', token: 1 }}
      />,
    )

    expect(screen.getByAltText('referenceImageAlt')).toBeInTheDocument()
  })

  // §3.0b 第 4 条「引用对象扩展到生成图」的最后一米：注入只是**挂上附件**，
  // 真正把它送出去的仍是用户自己按发送那一下（不自动喂图 —— vision token 是
  // 真钱）。这条断言注入的图确实进了 `references`，也就是请求体里那个键。
  it('sends an injected reference as an attachment on the next user turn', () => {
    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        injectedReference={{
          url: 'https://cdn.example.com/run-1.png',
          token: 7,
        }}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('placeholder'), {
      target: { value: '这张脸为什么崩了' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    expect(sendMock).toHaveBeenCalledWith(
      '这张脸为什么崩了',
      expect.objectContaining({
        references: [
          expect.objectContaining({
            kind: 'image',
            url: 'https://cdn.example.com/run-1.png',
            thumbnailUrl: 'https://cdn.example.com/run-1.png',
          }),
        ],
      }),
    )
  })

  // 能力矩阵三值化的消费者回归（切片 2 §4.3）：这个面板读的是
  // `assistantAdapterAcceptsReferenceKind(…, VIDEO_ANALYSIS_TASK_TIERS.conversational)`。
  // ⚠ 前端判一套、服务端判另一套的下场是「界面让挂、发出去 400」，所以两边同源。
  it('看不了图的路由挂着图片附件时不许发送（服务端也会用同一张表拒）', () => {
    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        assistantRoute={{
          optionId: 'deepseek-key',
          apiKeyId: 'key-ds',
          adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        }}
        injectedReference={{ url: 'https://cdn.example.com/ref.png', token: 3 }}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('placeholder'), {
      target: { value: '看看这张' },
    })
    expect(screen.getByRole('button', { name: 'send' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('能吃图的路由（OpenAI，frames 档）照常发得出去', () => {
    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        assistantRoute={{
          optionId: 'openai-key',
          apiKeyId: 'key-oa',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
        }}
        injectedReference={{ url: 'https://cdn.example.com/ref.png', token: 4 }}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('placeholder'), {
      target: { value: '看看这张' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(sendMock).toHaveBeenCalled()
  })
})
