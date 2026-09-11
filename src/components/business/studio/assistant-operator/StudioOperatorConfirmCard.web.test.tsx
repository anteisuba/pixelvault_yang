// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorConfirmCard } from './StudioOperatorConfirmCard'
import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import type { StudioOperatorGenerateKnob } from '@/constants/studio-assistant-operator'
import type {
  StudioOperatorConfirmPrompt,
  StudioOperatorGenerationControls,
} from '@/types/studio-assistant-operator'

/**
 * **确认卡**的回归闸（v2 §3.3 / 画板 BCards「确认」那一节的五态）。
 *
 * 钉五件事：
 *  ① 多步：一行动作串 + 「开始 / 一步一步来」两颗，各自走各自的回调；
 *  ② 生成 · 默认态：四颗旋钮读数在场；
 *  ②' #9 起：给了 `controls` 就是**可换的下拉**，改一下立刻经 `onAdjust` 写回，
 *     换模型回落时就地写一行「已按 X 调整」；⛔ 卡上不留任何一份自攒的参数；
 *  ③ 确认中：两颗按钮都不可点（同一帧里连点 = 两枪）；
 *  ④ 已确认 · 时间：整卡收成一行，⛔ 两颗按钮整个不画；
 *  ⑤ 已取消 · 时间：写「没有执行」，且只有这一格长「再来一次」。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return t
  },
}))

/** 弹层原语换成直通：本测试问的是旋钮的选项与回写，不是 Radix 的锚定。 */
vi.mock('@/components/ui/responsive-popover', async () => {
  const React = await import('react')
  const Ctx = React.createContext<{
    open: boolean
    setOpen(next: boolean): void
  }>({ open: false, setOpen: () => {} })
  return {
    ResponsivePopover: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean
      onOpenChange(next: boolean): void
      children: React.ReactNode
    }) => (
      <Ctx.Provider value={{ open, setOpen: onOpenChange }}>
        {children}
      </Ctx.Provider>
    ),
    ResponsivePopoverTrigger: ({
      children,
    }: {
      children: React.ReactElement<{ onClick?: () => void }>
    }) => {
      const { open, setOpen } = React.useContext(Ctx)
      return React.cloneElement(children, { onClick: () => setOpen(!open) })
    },
    ResponsivePopoverContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = React.useContext(Ctx)
      return open ? <div>{children}</div> : null
    },
  }
})

const MULTISTEP: StudioOperatorConfirmPrompt = {
  id: 'c1',
  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep,
  steps: [
    { id: 's1', label: '查来源' },
    { id: 's2', label: '改提示词' },
    { id: 's3', label: '换模型' },
  ],
  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
}

const GENERATE: StudioOperatorConfirmPrompt = {
  id: 'c2',
  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
  request: {
    model: { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
    count: 3,
    specs: {
      aspectRatio: '3:2',
      resolution: '1536',
      durationSeconds: null,
    },
    label: '胶片质感',
  },
}

/**
 * 工作台那份真值视图（§5.2）—— ⚠ 与 `GENERATE.request` **故意不同**：
 * 卡有 `controls` 时必须读它而不是读载荷，不同才验得出来。
 */
const CONTROLS: StudioOperatorGenerationControls = {
  model: { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
  models: [
    { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
    { id: 'seedream-4', label: 'Seedream 4' },
  ],
  aspectRatio: '3:2',
  resolution: '1536',
  count: 3,
  choicesByModel: {
    'flux-2-flash': {
      aspectRatios: ['3:2', '1:1'],
      resolutions: ['1536', '2048'],
      counts: [1, 2, 4],
    },
    'seedream-4': { aspectRatios: ['1:1'], resolutions: [], counts: [] },
  },
}

function renderCard(
  confirm: StudioOperatorConfirmPrompt,
  extra: {
    controls?: StudioOperatorGenerationControls
    onAdjust?: (
      knob: StudioOperatorGenerateKnob,
      value: string,
    ) => readonly StudioOperatorGenerateKnob[]
  } = {},
) {
  const handlers = {
    onApprove: vi.fn(),
    onDecline: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
  }
  render(
    <StudioOperatorConfirmCard
      confirm={confirm}
      {...handlers}
      {...extra}
      formatTime={() => '11:24'}
    />,
  )
  return handlers
}

/** 打开某一颗旋钮的下拉，返回它列出来的那几项。 */
function openKnob(knob: StudioOperatorGenerateKnob): HTMLElement[] {
  const trigger = screen
    .getAllByTestId('operator-confirm-knob')
    .find((node) => node.dataset.knob === knob)
  fireEvent.click(trigger!)
  return screen.getAllByTestId('operator-confirm-knob-option')
}

describe('StudioOperatorConfirmCard', () => {
  it('多步：一行动作串 + 开始 / 一步一步来', () => {
    const handlers = renderCard(MULTISTEP)
    expect(screen.getByTestId('operator-confirm-card').dataset.kind).toBe(
      'multistep',
    )
    expect(screen.getByTestId('operator-confirm-title')).toHaveTextContent(
      'confirm.multistep.title:3',
    )
    expect(screen.getByTestId('operator-confirm-steps')).toHaveTextContent(
      '查来源 · 改提示词 · 换模型',
    )
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(handlers.onApprove).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-confirm-secondary'))
    expect(handlers.onDecline).toHaveBeenCalledTimes(1)
    // ⛔ 多步那一支永远不走生成那两颗回调。
    expect(handlers.onConfirm).not.toHaveBeenCalled()
    expect(handlers.onCancel).not.toHaveBeenCalled()
  })

  it('生成 · 默认态：四颗旋钮读数在场，两颗按钮各自走各自的回调', () => {
    const handlers = renderCard(GENERATE)
    const knobs = screen.getAllByTestId('operator-confirm-knob')
    expect(knobs.map((node) => node.dataset.knob)).toEqual([
      'model',
      'aspect',
      'count',
      'resolution',
    ])
    expect(knobs[0]).toHaveTextContent('FLUX 2 Flash')
    expect(knobs[1]).toHaveTextContent('3:2')
    expect(knobs[3]).toHaveTextContent('1536')
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(handlers.onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-confirm-secondary'))
    expect(handlers.onCancel).toHaveBeenCalledTimes(1)
  })

  it('确认中：两颗按钮都不可点', () => {
    const handlers = renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting,
    })
    const primary = screen.getByTestId('operator-confirm-primary')
    expect(primary).toBeDisabled()
    expect(primary).toHaveTextContent('confirm.state.submitting')
    expect(screen.getByTestId('operator-confirm-secondary')).toBeDisabled()
    fireEvent.click(primary)
    expect(handlers.onConfirm).not.toHaveBeenCalled()
  })

  it('已确认 · 时间：整卡收成一行，⛔ 两颗按钮整个不画', () => {
    renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed,
      decidedAt: '2026-09-11T03:24:00.000Z',
    })
    expect(screen.getByTestId('operator-confirm-state')).toHaveTextContent(
      'confirm.state.confirmed:11:24',
    )
    expect(screen.queryByTestId('operator-confirm-primary')).toBeNull()
    expect(screen.queryByTestId('operator-confirm-secondary')).toBeNull()
    expect(screen.queryByTestId('operator-confirm-retry')).toBeNull()
  })

  it('已取消 · 时间：写「没有执行」，并长一颗「再来一次」', () => {
    const handlers = renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled,
      decidedAt: '2026-09-11T03:22:00.000Z',
    })
    expect(screen.getByTestId('operator-confirm-state')).toHaveTextContent(
      'confirm.state.cancelled:11:24',
    )
    expect(screen.getByTestId('operator-confirm-card')).toHaveTextContent(
      'confirm.generate.notRun',
    )
    fireEvent.click(screen.getByTestId('operator-confirm-retry'))
    expect(handlers.onRetry).toHaveBeenCalledTimes(1)
  })

  /** ── #9：就地改参数（§5.1 / §5.2）──────────────────────────────── */

  it('⭐ 给了 controls：四颗读的是**工作台**那一份，⛔ 不是载荷里的快照', () => {
    renderCard(
      {
        ...GENERATE,
        request: {
          ...GENERATE.request,
          model: { id: 'stale', label: '旧模型' },
          count: 1,
          specs: {
            aspectRatio: '9:16',
            resolution: '2048',
            durationSeconds: null,
          },
        },
      } as StudioOperatorConfirmPrompt,
      { controls: CONTROLS },
    )
    const knobs = screen.getAllByTestId('operator-confirm-knob')
    expect(knobs[0]).toHaveTextContent('FLUX 2 Flash')
    expect(knobs[1]).toHaveTextContent('3:2')
    expect(knobs[2]).toHaveTextContent('confirm.generate.count:3')
    expect(knobs[3]).toHaveTextContent('1536')
  })

  it('四颗各自是下拉，当前项打勾；点一项就走 onAdjust（比例 / 张数 / 分辨率）', () => {
    const onAdjust = vi.fn(() => [])
    renderCard(GENERATE, { controls: CONTROLS, onAdjust })

    const aspects = openKnob('aspect')
    expect(aspects.map((node) => node.dataset.value)).toEqual(['3:2', '1:1'])
    expect(aspects[0]).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(aspects[1]!)
    expect(onAdjust).toHaveBeenLastCalledWith('aspect', '1:1')

    const counts = openKnob('count')
    expect(counts.map((node) => node.dataset.value)).toEqual(['1', '2', '4'])
    fireEvent.click(counts[2]!)
    expect(onAdjust).toHaveBeenLastCalledWith('count', '4')

    const resolutions = openKnob('resolution')
    fireEvent.click(resolutions[1]!)
    expect(onAdjust).toHaveBeenLastCalledWith('resolution', '2048')
  })

  it('⭐ 换模型：下拉列当前域全部模型，点中就写回，并就地写一行「已按 X 调整」', () => {
    const onAdjust = vi.fn(() => ['aspect', 'resolution'] as const)
    renderCard(GENERATE, { controls: CONTROLS, onAdjust })
    expect(screen.queryByTestId('operator-confirm-adjusted')).toBeNull()

    const models = openKnob('model')
    expect(models.map((node) => node.dataset.value)).toEqual([
      'flux-2-flash',
      'seedream-4',
    ])
    expect(models[0]).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(models[1]!)
    expect(onAdjust).toHaveBeenCalledWith('model', 'seedream-4')
    expect(screen.getByTestId('operator-confirm-adjusted')).toHaveTextContent(
      'confirm.generate.adjusted:confirm.generate.aspect · confirm.generate.resolution',
    )
    // ⛔ 卡上不自攒参数：读数仍是 controls 那一份（宿主还没回灌）。
    const knobs = screen.getAllByTestId('operator-confirm-knob')
    expect(knobs[0]).toHaveTextContent('FLUX 2 Flash')
  })

  it('⚠ 候选表为空的那一颗**不画**（这个模型没有它）', () => {
    renderCard(GENERATE, {
      controls: {
        ...CONTROLS,
        model: { id: 'seedream-4', label: 'Seedream 4' },
      },
    })
    // seedream-4 的清晰度与张数候选都空 —— 只剩模型与比例两颗。
    expect(
      screen
        .getAllByTestId('operator-confirm-knob')
        .map((node) => node.dataset.knob),
    ).toEqual(['model', 'aspect'])
  })

  it('⚠ 没有 controls（LoRA 装配台）：退回只读读数，⛔ 没有下拉可点', () => {
    const onAdjust = vi.fn(() => [])
    renderCard(GENERATE, { onAdjust })
    fireEvent.click(
      screen
        .getAllByTestId('operator-confirm-knob')
        .find((node) => node.dataset.knob === 'model')!,
    )
    expect(screen.queryByTestId('operator-confirm-knob-option')).toBeNull()
    expect(onAdjust).not.toHaveBeenCalled()
  })

  it('⚠ 「确认中」时旋钮也点不动（同一帧里改参数 = 与那一枪赛跑）', () => {
    const onAdjust = vi.fn(() => [])
    renderCard(
      { ...GENERATE, status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting },
      { controls: CONTROLS, onAdjust },
    )
    const trigger = screen
      .getAllByTestId('operator-confirm-knob')
      .find((node) => node.dataset.knob === 'model')!
    expect(trigger).toBeDisabled()
  })
})
