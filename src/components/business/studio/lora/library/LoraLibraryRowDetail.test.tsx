import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AssistantOperatorLoraPickCandidate } from '@/types/assistant-operator'

import { LoraLibraryRowDetail } from './LoraLibraryRowDetail'

/**
 * **候选支**（`source: 'candidate'`，lora-assistant §10.3.2）的回归闸。
 *
 * 钉四件事：
 *  ① 候选没有的字段**整块不画**（点赞 / 安全 / 样例带 / 授权位 / 版本名）——
 *     ⛔ 不画空壳、⛔ 不填 0；
 *  ② 许可只在 `licenseKnown` 为真时才画；
 *  ③ 动作条是「勾上这把 / 取消勾选」+「打开来源」，⛔ 没有「使用此 LoRA」、
 *     ⛔ 没有「收藏」；主按钮回调带 candidateId；
 *  ④ 装不上的那把：理由写在明面上，主按钮不给勾。
 */

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values
        ? `${namespace}:${key}:${Object.values(values).join(',')}`
        : `${namespace}:${key}`
    return t
  },
}))

function candidate(
  over: Partial<AssistantOperatorLoraPickCandidate> = {},
): AssistantOperatorLoraPickCandidate {
  return {
    candidateId: 'civitai:1:2',
    source: 'civitai',
    name: 'Qingxiao',
    author: 'HermitST',
    family: 'anima',
    triggerWords: ['qingxiao', 'ink'],
    thumbnailUrl: 'https://image.civitai.com/cover.jpeg',
    pageUrl: 'https://civitai.com/models/1',
    downloads: 13200,
    licenseLabel: null,
    licenseKnown: false,
    commercialUse: null,
    importable: true,
    compatible: true,
    alreadyMounted: false,
    alreadyImported: false,
    defaultWeight: 0.8,
    recommended: false,
    importPayload: null,
    ...over,
  } as AssistantOperatorLoraPickCandidate
}

afterEach(cleanup)

describe('LoraLibraryRowDetail — candidate branch', () => {
  it('draws only what the candidate actually has and skips the rest whole', () => {
    render(
      <LoraLibraryRowDetail
        source="candidate"
        candidate={candidate()}
        checked={false}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByText('Qingxiao')).toBeTruthy()
    expect(screen.getByTestId('lora-candidate-detail-cover')).toBeTruthy()
    expect(screen.getByTestId('lora-candidate-detail-triggers')).toBeTruthy()
    expect(screen.getByTestId('lora-candidate-detail-source')).toBeTruthy()
    expect(screen.getByTestId('lora-candidate-detail-author')).toBeTruthy()
    // 下载数画了，点赞那一格根本没有（⛔ 不填 0）。
    expect(screen.getByText('13,200')).toBeTruthy()
    // 许可未知 → 整块不画。
    expect(screen.queryByTestId('lora-candidate-detail-license')).toBeNull()
    // 装得上 → 没有那条理由框。
    expect(screen.queryByTestId('lora-candidate-detail-blocked')).toBeNull()
    // ⛔ 库里那套动作（使用此 LoRA / 收藏）一个都不在。
    expect(screen.queryByText('LoraWorkbench:useThisLora')).toBeNull()
    expect(screen.queryByText('LoraWorkbench:favorite')).toBeNull()
  })

  it('drops the fields the candidate does not carry', () => {
    render(
      <LoraLibraryRowDetail
        source="candidate"
        candidate={candidate({
          author: null,
          family: null,
          downloads: null,
          triggerWords: [],
          pageUrl: undefined,
        })}
        checked={false}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('lora-candidate-detail-author')).toBeNull()
    expect(
      screen.queryByTestId('lora-candidate-detail-family-badge'),
    ).toBeNull()
    expect(screen.queryByTestId('lora-candidate-detail-triggers')).toBeNull()
    expect(screen.queryByTestId('lora-candidate-detail-source')).toBeNull()
    // 来源链接缺席 → 次动作也不画（⛔ 不给一个空 href）。
    expect(screen.queryByText('LoraWorkbench:communityOpenSource')).toBeNull()
  })

  it('draws the licence only when the source actually told us one', () => {
    render(
      <LoraLibraryRowDetail
        source="candidate"
        candidate={candidate({
          licenseKnown: true,
          licenseLabel: 'apache-2.0',
          commercialUse: ['Sell'],
        })}
        checked={false}
        onToggle={vi.fn()}
      />,
    )

    const license = screen.getByTestId('lora-candidate-detail-license')
    expect(license.textContent).toContain('apache-2.0')
    expect(license.textContent).toContain('Sell')
  })

  it('picks and unpicks through the card instead of mounting directly', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <LoraLibraryRowDetail
        source="candidate"
        candidate={candidate()}
        checked={false}
        onToggle={onToggle}
      />,
    )

    const pick = screen.getByText('StudioOperator:confirm.loraPick.detailPick')
    fireEvent.click(pick)
    expect(onToggle).toHaveBeenCalledWith('civitai:1:2')

    rerender(
      <LoraLibraryRowDetail
        source="candidate"
        candidate={candidate()}
        checked
        onToggle={onToggle}
      />,
    )
    expect(
      screen.getByText('StudioOperator:confirm.loraPick.detailUnpick'),
    ).toBeTruthy()
  })

  it('says why an unmountable candidate cannot be picked and refuses the pick', () => {
    const onToggle = vi.fn()
    render(
      <LoraLibraryRowDetail
        source="candidate"
        candidate={candidate({
          importable: false,
          notImportableReason: 'gated_repo',
          source: 'huggingface',
        })}
        checked={false}
        onToggle={onToggle}
      />,
    )

    expect(
      screen.getByTestId('lora-candidate-detail-blocked').textContent,
    ).toContain('StudioOperator:confirm.loraPick.notImportable.gatedRepo')

    const pick = screen
      .getByText('StudioOperator:confirm.loraPick.detailPick')
      .closest('button')
    expect(pick?.hasAttribute('disabled')).toBe(true)
    fireEvent.click(pick as HTMLButtonElement)
    expect(onToggle).not.toHaveBeenCalled()
  })
})
