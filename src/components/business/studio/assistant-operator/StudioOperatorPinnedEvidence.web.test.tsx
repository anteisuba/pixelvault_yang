// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  StudioOperatorPinnedEvidence,
  type StudioOperatorPinnedEvidenceItem,
} from './StudioOperatorPinnedEvidence'

/**
 * 面板顶部「钉住的证据」常驻条的回归闸（v2 §3.2 / 画板 BCards「已钉住 ·
 * 留在面板顶部」，commit #21）。
 *
 * 钉四件事：
 *  ① **一条都没钉住 = 整条不渲染**（⛔ 不画「还没有钉住的证据」那种占位）；
 *  ② 钉住的那一条把结论与来源计数留在眼前 —— 它就是常驻条存在的全部理由；
 *  ③ 点得回原卡（`onJump` 带 `runKey`），常驻条只说结论，⛔ 不复制来源列表；
 *  ④ × 取消钉住（`onUnpin`），⛔ 不是「关掉这条提示」。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const ITEM: StudioOperatorPinnedEvidenceItem = {
  runKey: 'run-7',
  conclusion: '逆光散射，不是暖色滤镜。',
  sourceCount: 3,
  corroborated: 2,
}

function renderBar(items: readonly StudioOperatorPinnedEvidenceItem[]) {
  const onJump = vi.fn()
  const onUnpin = vi.fn()
  render(
    <StudioOperatorPinnedEvidence
      items={items}
      onJump={onJump}
      onUnpin={onUnpin}
    />,
  )
  return { onJump, onUnpin }
}

describe('StudioOperatorPinnedEvidence', () => {
  it('⛔ 一条都没钉住就整条不渲染', () => {
    renderBar([])
    expect(screen.queryByTestId('operator-pinned-evidence')).toBeNull()
  })

  it('⭐ 钉住的结论留在面板顶部（§3.2：钉住后在顶部留一份）', () => {
    renderBar([ITEM])
    const bar = screen.getByTestId('operator-pinned-evidence')
    expect(bar).toBeTruthy()
    const row = screen.getByTestId('operator-pinned-evidence-item')
    expect(row.dataset.runKey).toBe('run-7')
    expect(row.textContent).toContain('逆光散射')
  })

  it('⭐ 点得回原卡：回调带的是那张卡的 `runKey`', () => {
    const { onJump } = renderBar([ITEM])
    fireEvent.click(screen.getByTestId('operator-pinned-evidence-jump'))
    expect(onJump).toHaveBeenCalledTimes(1)
    expect(onJump).toHaveBeenCalledWith('run-7')
  })

  it('⭐ × 是**取消钉住**，不是关掉一条提示', () => {
    const { onUnpin } = renderBar([ITEM])
    fireEvent.click(screen.getByTestId('operator-pinned-evidence-unpin'))
    expect(onUnpin).toHaveBeenCalledTimes(1)
    expect(onUnpin).toHaveBeenCalledWith('run-7')
  })

  it('钉住多条就排多行 —— ⛔ 不合并成一句「N 条已钉住」', () => {
    renderBar([ITEM, { ...ITEM, runKey: 'run-8', corroborated: 0 }])
    expect(screen.getAllByTestId('operator-pinned-evidence-item')).toHaveLength(
      2,
    )
  })

  it('皮肤走信号位（§12.2：近黑描边），⛔ 不引入新色相', () => {
    renderBar([ITEM])
    const row = screen.getByTestId('operator-pinned-evidence-item')
    expect(row.className).toContain('border-foreground')
    expect(row.className).not.toContain('border-primary')
  })
})
