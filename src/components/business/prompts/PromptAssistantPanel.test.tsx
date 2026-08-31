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

// ⚠ 这个 mock 是**逐字段手拼**的：hook 新导出一个东西、组件用上，这里不补就
// 整文件崩（渲染时抛 "not a function"）。2026-08-22 加 `#n` 编号时又踩了一次。
// ⭐ `collectStudioConversationMediaReferences` 刻意走**真实实现**：它是纯函数，
//    而编号正确与否恰恰取决于它算出来的顺序 —— mock 掉就等于把这条测没了。
vi.mock('@/hooks/kernel/use-prompt-assistant', async (importOriginal) => ({
  collectStudioConversationMediaReferences: (
    await importOriginal<typeof import('@/hooks/kernel/use-prompt-assistant')>()
  ).collectStudioConversationMediaReferences,
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

// 推荐卡里的「去 LoRA 工作台挂载」用的是本地化 Link。`next-intl/navigation`
// 在 jsdom 里会去解析 `next/navigation` 的裸路径并炸掉 —— 换成一个直白的 <a>。
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
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
  // 2026-08-22 owner：「[image #1] 和 [image #6] 我根本不知道是哪张」。
  // 编号一直只画在**编辑器**里的待发送缩略图上，一发出去就消失 —— 而助手的回答
  // 是之后才到的，等编号有用时它已经没了。
  describe('参考素材编号（#n）', () => {
    const attachment = (url: string, label: string) => ({
      id: `ref-${url}`,
      source: 'gallery' as const,
      kind: 'image' as const,
      url,
      label,
    })

    it('⭐ 已发出的消息上也画编号，且与助手口中的 [image #n] 同一套', () => {
      mockMessages = [
        {
          role: 'user',
          content: '第一轮',
          mediaReferences: [attachment('https://cdn.test/a.png', 'A')],
        },
        { role: 'assistant', content: '好的' },
        {
          role: 'user',
          content: '第二轮',
          mediaReferences: [attachment('https://cdn.test/b.png', 'B')],
        },
      ]

      render(
        <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
      )

      // 按对话顺序：先出现的是 #1。⛔ 旧行为是「当前 + 历史倒序」，最新的才是 #1，
      // 与用户从上往下读的顺序正好相反。
      expect(screen.getByTitle('#1 · A')).toBeInTheDocument()
      expect(screen.getByTitle('#2 · B')).toBeInTheDocument()
    })

    it('⚠ 防空转：没有附件时不凭空画编号', () => {
      mockMessages = [{ role: 'user', content: '光说话' }]

      render(
        <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
      )

      expect(screen.queryByTitle(/^#\d/)).not.toBeInTheDocument()
    })
  })

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

// ─── 切片 3：LoRA 推荐卡在面板里的接线 ──────────────────────────────
//
// ⚠ 这一组守的是**宿主差异**，也是这一批最容易漏的一处：同一个面板挂在
// LoRA 装配台 / 图片工作台 / 移动端抽屉三处，只有装配台拿得到挂载栈
// （`LoraStackProvider` 只包 /studio/lora）。验一个宿主 ≠ 验全部。

function loraPickMessage(): PromptAssistantDisplayMessage {
  return {
    role: 'assistant',
    content: '这把比较贴。',
    loraPicks: [
      { candidateId: 'civitai:1:1', reason: '画风一致' },
      // 命不中本轮候选的 pick（模型编的 id）—— 不该出卡
      { candidateId: 'civitai:9:9', reason: '编的' },
    ],
    loraCandidates: [
      {
        candidateId: 'civitai:1:1',
        source: 'civitai',
        name: '长离 · 角色 LoRA',
        author: 'creator',
        license: {
          label: null,
          commercialUse: ['Image'],
          allowDerivatives: true,
          allowNoCredit: false,
          known: true,
        },
        baseModelFamily: 'Illustrious',
        type: 'subject',
        triggerWords: ['changli'],
        sampleImageUrls: [],
        fileSizeBytes: 1024,
        pageUrl: 'https://civitai.com/models/1',
        downloads: 10,
        metadataCompleteness: 'complete',
        importable: true,
        alreadyMounted: false,
        alreadyImported: false,
        importPayload: {
          name: '长离 · 角色 LoRA',
          triggerWord: 'changli',
          loraUrl: 'https://civitai.com/api/download/models/1',
          type: 'subject',
          baseModelFamily: 'Illustrious',
          provider: 'civitai',
          coverImageUrl: null,
          recommendedPrompt: null,
          fileHashAutoV3: null,
          sourceSnapshot: {
            source: 'civitai',
            author: 'creator',
            license: {
              label: null,
              commercialUse: ['Image'],
              allowDerivatives: true,
              allowNoCredit: false,
              known: true,
            },
            pageUrl: 'https://civitai.com/models/1',
            revision: null,
            retrievedAt: '2026-08-21T09:12:33.123Z',
            fileSizeBytes: 1024,
            metadataCompleteness: 'complete',
          },
        },
      },
    ],
  }
}

describe('PromptAssistantPanel · LoRA 推荐卡', () => {
  it('把 picks 兑换成候选后出卡，编出来的 id 不出卡', () => {
    mockMessages = [loraPickMessage()]
    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        loraConfirm={{
          canMount: true,
          confirm: vi.fn(),
          confirmPayload: vi.fn(),
        }}
      />,
    )

    expect(screen.getByText('长离 · 角色 LoRA')).toBeInTheDocument()
    expect(screen.getByText('画风一致')).toBeInTheDocument()
    // 模型编的那条查不到底 —— 渲染一张查不到底的卡等于把「编的」和「真有的」混在一起
    expect(screen.queryByText('编的')).not.toBeInTheDocument()
  })

  it('LoRA 装配台宿主：出的是「导入并挂载」', () => {
    mockMessages = [loraPickMessage()]
    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        loraConfirm={{
          canMount: true,
          confirm: vi.fn(),
          confirmPayload: vi.fn(),
        }}
      />,
    )

    expect(screen.getByText('loraCandidate.confirm')).toBeInTheDocument()
    expect(
      screen.queryByText('loraCandidate.confirmImportOnly'),
    ).not.toBeInTheDocument()
  })

  it('非 LoRA 宿主：**没有挂载按钮**，改成「导入并填入触发词」', () => {
    mockMessages = [loraPickMessage()]
    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        loraConfirm={{
          canMount: false,
          confirm: vi.fn(),
          confirmPayload: vi.fn(),
        }}
      />,
    )

    expect(
      screen.getByText('loraCandidate.confirmImportOnly'),
    ).toBeInTheDocument()
    // ⛔ 图片/视频工作台没有挂载栈，出「导入并挂载」就是一个点了没反应的按钮
    expect(screen.queryByText('loraCandidate.confirm')).not.toBeInTheDocument()
  })

  it('宿主漏传 loraConfirm：卡仍如实展示，但一个按钮都不出', () => {
    mockMessages = [loraPickMessage()]
    render(
      <PromptAssistantPanel currentPrompt="" writeback={makeWriteback()} />,
    )

    expect(screen.getByText('长离 · 角色 LoRA')).toBeInTheDocument()
    expect(screen.queryByText('loraCandidate.confirm')).not.toBeInTheDocument()
    expect(
      screen.queryByText('loraCandidate.confirmImportOnly'),
    ).not.toBeInTheDocument()
  })

  it('这一轮没有推荐时不留任何残留', () => {
    mockMessages = [{ role: 'assistant', content: '就聊聊天。' }]
    render(
      <PromptAssistantPanel
        currentPrompt=""
        writeback={makeWriteback()}
        loraConfirm={{
          canMount: true,
          confirm: vi.fn(),
          confirmPayload: vi.fn(),
        }}
      />,
    )

    expect(screen.queryByText('loraCandidate.confirm')).not.toBeInTheDocument()
  })
})
