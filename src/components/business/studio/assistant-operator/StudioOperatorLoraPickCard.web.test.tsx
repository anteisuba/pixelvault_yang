// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import { StudioOperatorLoraPickCard } from './StudioOperatorLoraPickCard'
import type { StudioOperatorLoraPickPrompt } from './StudioOperatorLoraPickCard'
import type { AssistantOperatorLoraPickCandidate } from '@/types/assistant-operator'

/**
 * **LoRA 推荐卡**的回归闸（lora-assistant §10.4 第 9 条 / 画板 `LoraPickA`）。
 *
 * 钉七件事：
 *  ① 勾选 / 取消实时改底部读数（已选 N 把 · 总权重 X / Y）；
 *  ② 超预算把读数标红并出一行提醒，**但主按钮照旧可点**（§5「只提醒不动手」）；
 *  ③ 底模未定（`budget === null`）→ 只画「已选 N 把」，⛔ 没有分母；
 *  ④ 装不上的行不可勾（`aria-disabled` + checkbox `disabled`）且理由写在行里；
 *  ⑤ 连点两下只调一次 `onSubmit`（第二下撞在 `submitting` 上）；
 *  ⑥ 关掉不点调 `onDismiss`、「换个词再搜」调 `onSearchAgain`；
 *  ⑦ 缩略图缺席时画占位块（⛔ 不留白），那颗按钮带「看详情」。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return t
  },
  useFormatter: () => ({ number: (value: number) => String(value) }),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

function candidate(
  over: Partial<AssistantOperatorLoraPickCandidate> &
    Pick<AssistantOperatorLoraPickCandidate, 'candidateId' | 'name'>,
): AssistantOperatorLoraPickCandidate {
  return {
    source: 'civitai',
    author: 'HermitST',
    family: 'anima',
    triggerWords: ['qingxiao'],
    thumbnailUrl: 'https://cdn.example.com/a.jpg',
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

const QINGXIAO = candidate({
  candidateId: 'civitai:1:2',
  name: '清宵 · Qingxiao',
  recommended: true,
})
const MORNYE = candidate({
  candidateId: 'civitai:3:4',
  name: '莫宁 · Mornye',
  author: null,
  defaultWeight: 1,
  thumbnailUrl: undefined,
})
const GAME3D = candidate({
  candidateId: 'civitai:5:6',
  name: 'Game 3D Render Style XL',
  family: 'illustrious',
  compatible: false,
  importable: false,
  notImportableReason: 'unknown_base_model',
})

function prompt(
  over: Partial<StudioOperatorLoraPickPrompt['pick']> = {},
  status: StudioOperatorLoraPickPrompt['status'] = 'idle',
): StudioOperatorLoraPickPrompt {
  return {
    id: 'confirm-1',
    kind: 'loraPick',
    status,
    pick: {
      question: '鸣潮的角色和 3D 渲染画风，各挑一把？',
      baseFamilyLabel: 'Anima Base',
      budget: { total: 0.4, limit: 1.5 },
      groups: [
        {
          candidateIds: [MORNYE.candidateId, QINGXIAO.candidateId],
        },
        { title: '3D 渲染画风', candidateIds: [GAME3D.candidateId] },
      ],
      candidates: [QINGXIAO, MORNYE, GAME3D],
      ...over,
    },
  } as StudioOperatorLoraPickPrompt
}

type SubmitSpy = Mock<
  (selected: readonly { candidateId: string; weight?: number }[]) => void
>
type VoidSpy = Mock<() => void>

function renderCard(
  prompted: StudioOperatorLoraPickPrompt,
  handlers: {
    onSubmit?: SubmitSpy
    onDismiss?: VoidSpy
    onSearchAgain?: VoidSpy
  } = {},
) {
  const onSubmit: SubmitSpy = handlers.onSubmit ?? vi.fn()
  const onDismiss: VoidSpy = handlers.onDismiss ?? vi.fn()
  const onSearchAgain: VoidSpy = handlers.onSearchAgain ?? vi.fn()
  const view = render(
    <StudioOperatorLoraPickCard
      prompt={prompted}
      assistantName="ANTI"
      onSubmit={onSubmit}
      onDismiss={onDismiss}
      onSearchAgain={onSearchAgain}
      formatTime={() => '11:24'}
    />,
  )
  return { view, onSubmit, onDismiss, onSearchAgain }
}

afterEach(cleanup)

describe('StudioOperatorLoraPickCard', () => {
  it('勾选与取消实时改底部读数', () => {
    renderCard(prompt())
    const tally = screen.getByTestId('operator-lora-pick-tally')
    // 起手：一把没勾，X 就是当前栈里那 0.4。
    expect(tally.textContent).toContain('confirm.loraPick.tally:0')
    expect(tally.textContent).toContain('0.4 / 1.5')

    const boxes = screen.getAllByTestId('operator-lora-pick-checkbox')
    fireEvent.click(boxes[0] as HTMLInputElement)
    expect(tally.textContent).toContain('confirm.loraPick.tally:1')
    expect(tally.textContent).toContain('1.2 / 1.5')

    fireEvent.click(boxes[0] as HTMLInputElement)
    expect(tally.textContent).toContain('confirm.loraPick.tally:0')
    expect(tally.textContent).toContain('0.4 / 1.5')
  })

  it('推荐项排组内第一并带「推荐」标', () => {
    renderCard(prompt())
    const rows = screen.getAllByTestId('operator-lora-pick-row')
    expect(rows[0]?.dataset.candidateId).toBe(QINGXIAO.candidateId)
    expect(
      screen.getAllByTestId('operator-lora-pick-recommended'),
    ).toHaveLength(1)
  })

  it('超预算标红并出提醒，但「挂载所选」不禁用', () => {
    renderCard(prompt({ budget: { total: 1.2, limit: 1.5 } }))
    const boxes = screen.getAllByTestId('operator-lora-pick-checkbox')
    fireEvent.click(boxes[0] as HTMLInputElement)

    const tally = screen.getByTestId('operator-lora-pick-tally')
    expect(tally.dataset.overBudget).toBe('true')
    expect(tally.className).toContain('text-destructive')
    expect(screen.getByTestId('operator-lora-pick-over-budget')).toBeTruthy()
    expect(
      (screen.getByTestId('operator-lora-pick-submit') as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('底模未定时不画分母', () => {
    renderCard(prompt({ budget: null, baseFamilyLabel: null }))
    const tally = screen.getByTestId('operator-lora-pick-tally')
    expect(tally.textContent).toContain('confirm.loraPick.tallyNoBudget:0')
    expect(tally.textContent).not.toContain('/')
    expect(screen.queryByTestId('operator-lora-pick-base')).toBeNull()
  })

  it('装不上的行不可勾且理由写在行里', () => {
    renderCard(prompt())
    const row = screen
      .getAllByTestId('operator-lora-pick-row')
      .find((one) => one.dataset.candidateId === GAME3D.candidateId)
    expect(row?.getAttribute('aria-disabled')).toBe('true')
    expect(row?.dataset.mountable).toBe('false')

    const box = row?.querySelector(
      '[data-testid="operator-lora-pick-checkbox"]',
    ) as HTMLInputElement
    expect(box.disabled).toBe(true)
    fireEvent.click(box)
    expect(
      screen.getByTestId('operator-lora-pick-tally').textContent,
    ).toContain('confirm.loraPick.tally:0')

    expect(
      row?.querySelector('[data-testid="operator-lora-pick-reason"]')
        ?.textContent,
    ).toBe('confirm.loraPick.notImportable.unknownBaseModel')
  })

  it('一把没勾时「挂载所选」禁用；连点两下只调一次 onSubmit', () => {
    const onSubmit: SubmitSpy = vi.fn()
    const { view } = renderCard(prompt(), { onSubmit })
    const submit = screen.getByTestId(
      'operator-lora-pick-submit',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fireEvent.click(screen.getAllByTestId('operator-lora-pick-checkbox')[0]!)
    fireEvent.click(submit)
    /**
     * ⚠ 第二下撞在**宿主翻过来的 `submitting`** 上（`submitLoraPicks` 一进门就
     * 把卡翻成提交中）—— 卡自己不记这一格，重演的正是面板那条路。
     */
    view.rerender(
      <StudioOperatorLoraPickCard
        prompt={prompt({}, 'submitting')}
        assistantName="ANTI"
        onSubmit={onSubmit}
        onDismiss={vi.fn()}
        onSearchAgain={vi.fn()}
        formatTime={() => '11:24'}
      />,
    )
    fireEvent.click(screen.getByTestId('operator-lora-pick-submit'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith([
      { candidateId: QINGXIAO.candidateId },
    ])
  })

  it('关掉不点调 onDismiss，「换个词再搜」调 onSearchAgain', () => {
    const onDismiss: VoidSpy = vi.fn()
    const onSearchAgain: VoidSpy = vi.fn()
    renderCard(prompt(), { onDismiss, onSearchAgain })
    fireEvent.click(screen.getByTestId('operator-lora-pick-dismiss'))
    fireEvent.click(screen.getByTestId('operator-lora-pick-search-again'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onSearchAgain).toHaveBeenCalledTimes(1)
  })

  it('缩略图缺席时画占位块，按钮带「看详情」', () => {
    renderCard(prompt())
    const row = screen
      .getAllByTestId('operator-lora-pick-row')
      .find((one) => one.dataset.candidateId === MORNYE.candidateId)
    expect(
      row?.querySelector('[data-testid="operator-lora-pick-thumb-fallback"]'),
    ).toBeTruthy()
    expect(
      row
        ?.querySelector('[data-testid="operator-lora-pick-thumb"]')
        ?.getAttribute('aria-label'),
    ).toBe('confirm.loraPick.viewDetail')
    // 作者缺席时退回下载量（⛔ 不留白、⛔ 不写「作者未知」占一格）。
    expect(row?.textContent).toContain('confirm.loraPick.downloads:13200')
  })

  it('已挂那一态整卡收成一行「已挂 N 把 · 时刻」', () => {
    renderCard({
      ...prompt({}, 'confirmed'),
      decidedAt: '2026-09-12T02:24:00.000Z',
    } as StudioOperatorLoraPickPrompt)
    expect(
      screen.getByTestId('operator-lora-pick-state').textContent,
    ).toContain('confirm.loraPick.mounted:0,11:24')
    expect(screen.queryByTestId('operator-lora-pick-submit')).toBeNull()
  })
})
