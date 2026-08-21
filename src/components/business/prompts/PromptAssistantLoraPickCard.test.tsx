import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LORA_CANDIDATE_CONFIRM_STEPS } from '@/constants/lora-candidate'
import type { LoraCandidateConfirmAdapter } from '@/hooks/use-lora-candidate-confirm'
import type { AssistantLoraPick } from '@/types/assistant-protocol'
import type { LoraCandidate } from '@/types/lora-candidate'

/**
 * LoRA 推荐卡（切片 3 · C）。这套断言守的是**「宁可说不知道，也不留白」**：
 *
 *  1. `license.known === false` 是显示「许可未知」的唯一判据 —— 留白会被读成
 *     「没有限制」。
 *  2. `author` / `fileSizeBytes` 为 null 时写「未知」，不是空字符串。
 *  3. 四态各自的动作不同：已挂载 = 按钮禁用改口、已收藏 = 仍可挂载、
 *     不可导入 = 禁用并说明原因、正常 = 一次点击做三件事。
 *  4. 宿主没有挂载栈时**没有挂载按钮**，只有「导入并填入触发词」+ 去哪儿挂的引导。
 */

// 翻译 mock 把插值一并吐出来 —— 否则「下载量传错了」这类 bug 在测试里看不见。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('|')}` : key,
  useLocale: () => 'en',
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import { PromptAssistantLoraPickCard } from './PromptAssistantLoraPickCard'

const PICK: AssistantLoraPick = {
  candidateId: 'civitai:1023456:2034567',
  reason: '这把的画风与你正在做的冷调插画一致。',
  suggestedWeight: 0.7,
}

function candidate(over: Partial<LoraCandidate> = {}): LoraCandidate {
  return {
    candidateId: PICK.candidateId,
    source: 'civitai',
    name: '长离 · 角色 LoRA',
    author: 'creator_name',
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
    sampleImageUrls: ['https://image.civitai.com/a/1.jpeg'],
    fileSizeBytes: 223_344_556,
    pageUrl: 'https://civitai.com/models/1023456',
    downloads: 12_345,
    metadataCompleteness: 'complete',
    importable: true,
    alreadyMounted: false,
    alreadyImported: false,
    importPayload: {
      name: '长离 · 角色 LoRA',
      triggerWord: 'changli',
      loraUrl: 'https://civitai.com/api/download/models/2034567',
      type: 'subject',
      baseModelFamily: 'Illustrious',
      provider: 'civitai',
      coverImageUrl: null,
      recommendedPrompt: null,
      modelId: 1_023_456,
      modelVersionId: 2_034_567,
      fileHashAutoV3: null,
      sourceSnapshot: {
        source: 'civitai',
        author: 'creator_name',
        license: {
          label: null,
          commercialUse: ['Image'],
          allowDerivatives: true,
          allowNoCredit: false,
          known: true,
        },
        pageUrl: 'https://civitai.com/models/1023456',
        revision: null,
        retrievedAt: '2026-08-21T09:12:33.123Z',
        fileSizeBytes: 223_344_556,
        metadataCompleteness: 'complete',
      },
    },
    ...over,
  }
}

function adapter(
  over: Partial<LoraCandidateConfirmAdapter> = {},
): LoraCandidateConfirmAdapter {
  return {
    canMount: true,
    confirm: vi.fn().mockResolvedValue({
      status: 'ok',
      imported: true,
      mounted: true,
      triggerWordsApplied: true,
    }),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PromptAssistantLoraPickCard · 事实一律来自候选', () => {
  it('正常态：卡面事实齐全，理由来自模型，一次点击调确认链', async () => {
    const confirm = adapter()
    render(
      <PromptAssistantLoraPickCard
        pick={PICK}
        candidate={candidate()}
        confirm={confirm}
      />,
    )

    expect(screen.getByText('长离 · 角色 LoRA')).toBeInTheDocument()
    expect(screen.getByText('creator_name')).toBeInTheDocument()
    expect(screen.getByText('Illustrious')).toBeInTheDocument()
    expect(screen.getByText('changli')).toBeInTheDocument()
    expect(screen.getByText('213.0 MB')).toBeInTheDocument()
    expect(
      screen.getByText('loraCandidate.downloads:12345'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('loraCandidate.metadataCompleteness.complete'),
    ).toBeInTheDocument()
    // 模型唯一贡献的东西。
    expect(screen.getByText(PICK.reason)).toBeInTheDocument()
    // 样图懒加载，⛔ 不阻塞对话流。
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy')

    fireEvent.click(screen.getByText('loraCandidate.confirm'))
    await waitFor(() => {
      expect(confirm.confirm).toHaveBeenCalledExactlyOnceWith({
        candidate: candidate(),
        suggestedWeight: 0.7,
      })
    })
    expect(
      await screen.findByText('loraCandidate.confirmedMounted'),
    ).toBeInTheDocument()
  })

  it('许可未知：`known:false` 是唯一判据，⛔ 不留白', () => {
    render(
      <PromptAssistantLoraPickCard
        pick={PICK}
        candidate={candidate({
          license: {
            label: null,
            commercialUse: null,
            allowDerivatives: null,
            allowNoCredit: null,
            known: false,
          },
          author: null,
          fileSizeBytes: null,
        })}
        confirm={adapter()}
      />,
    )

    expect(screen.getByText('loraCandidate.licenseUnknown')).toBeInTheDocument()
    expect(screen.getByText('loraCandidate.authorUnknown')).toBeInTheDocument()
    expect(screen.getByText('loraCandidate.sizeUnknown')).toBeInTheDocument()
    // 三个权限位只在 known 时出现。
    expect(
      screen.queryByText('loraCandidate.licenseCommercial'),
    ).not.toBeInTheDocument()
  })

  it('已挂载：标出来，确认按钮改口成「已在栈中」并禁用', () => {
    const confirm = adapter()
    render(
      <PromptAssistantLoraPickCard
        pick={PICK}
        candidate={candidate({ alreadyMounted: true })}
        confirm={confirm}
      />,
    )

    expect(screen.getByText('loraCandidate.alreadyMounted')).toBeInTheDocument()
    const button = screen.getByRole('button', {
      name: 'loraCandidate.alreadyInStack',
    })
    expect(button).toBeDisabled()
    expect(screen.queryByText('loraCandidate.confirm')).not.toBeInTheDocument()
  })

  it('已收藏：标出来，但**仍可挂载** —— 库里有它不代表工作台上有', () => {
    render(
      <PromptAssistantLoraPickCard
        pick={PICK}
        candidate={candidate({ alreadyImported: true })}
        confirm={adapter()}
      />,
    )

    expect(
      screen.getByText('loraCandidate.alreadyImported'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /loraCandidate\.confirm/ }),
    ).toBeEnabled()
  })

  it('不可导入：照样展示这条候选，确认禁用并说清原因（策略 C）', () => {
    render(
      <PromptAssistantLoraPickCard
        pick={PICK}
        candidate={candidate({
          importable: false,
          notImportableReason: 'unknown_base_model',
          importPayload: null,
          baseModelFamily: null,
        })}
        confirm={adapter()}
      />,
    )

    // 候选本身照旧可见（不阻断，如实说明）。
    expect(screen.getByText('长离 · 角色 LoRA')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /loraCandidate\.confirm/ }),
    ).toBeDisabled()
    expect(
      screen.getByText('loraCandidate.notImportable.unknown_base_model'),
    ).toBeInTheDocument()
  })

  it('下发掉到最低档（可导入但没载荷）：禁用 + 说清是详情被裁了，不谎称不可导入', () => {
    render(
      <PromptAssistantLoraPickCard
        pick={PICK}
        candidate={candidate({ importPayload: null })}
        confirm={adapter()}
      />,
    )

    expect(
      screen.getByRole('button', { name: /loraCandidate\.confirm/ }),
    ).toBeDisabled()
    expect(screen.getByText('loraCandidate.detailsTrimmed')).toBeInTheDocument()
  })
})

describe('PromptAssistantLoraPickCard · 宿主差异', () => {
  it('没有挂载栈的宿主：按钮改成「导入并填入触发词」，成功后给去哪儿挂的引导', async () => {
    const confirm = adapter({
      canMount: false,
      confirm: vi.fn().mockResolvedValue({
        status: 'ok',
        imported: true,
        mounted: false,
        triggerWordsApplied: true,
      }),
    })
    render(
      <PromptAssistantLoraPickCard
        pick={PICK}
        candidate={candidate()}
        confirm={confirm}
      />,
    )

    // ⛔ 这里绝不能出现「导入并挂载」——点了没反应正是要防的那件事。
    expect(screen.queryByText('loraCandidate.confirm')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('loraCandidate.confirmImportOnly'))

    expect(
      await screen.findByText('loraCandidate.confirmedImported'),
    ).toBeInTheDocument()
    expect(screen.getByText('loraCandidate.mountElsewhere')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'loraCandidate.goToLoraWorkbench' }),
    ).toHaveAttribute('href', '/studio/lora')
  })

  it('宿主接不了这条链：退化成只读事实卡，不留一个点了没反应的按钮', () => {
    render(<PromptAssistantLoraPickCard pick={PICK} candidate={candidate()} />)

    expect(screen.getByText('长离 · 角色 LoRA')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // 来源页仍然给 —— 用户至少能自己去看。
    expect(
      screen.getByRole('link', { name: /loraCandidate\.openSource/ }),
    ).toHaveAttribute('href', 'https://civitai.com/models/1023456')
  })

  it('三种失败各说各的话，⛔ 不是笼统一句「操作失败」', async () => {
    const confirm = adapter({
      confirm: vi.fn().mockResolvedValue({
        status: 'failed',
        failedStep: LORA_CANDIDATE_CONFIRM_STEPS.mount,
        imported: true,
        mounted: false,
        triggerWordsApplied: false,
      }),
    })
    render(
      <PromptAssistantLoraPickCard
        pick={PICK}
        candidate={candidate()}
        confirm={confirm}
      />,
    )

    fireEvent.click(screen.getByText('loraCandidate.confirm'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('loraCandidate.failed.mount')
    expect(alert).not.toHaveTextContent('loraCandidate.failed.import')
  })
})
