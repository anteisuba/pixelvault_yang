import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getBaseOnlyGenerationBases,
  getCompatibleBases,
} from '@/constants/lora-base-models'

import { LoraBaseModelModal } from './LoraBaseModelModal'

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}:${key}`,
}))

vi.mock('@/constants/feature-flags', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/constants/feature-flags')>()
  return {
    ...actual,
    FEATURE_FLAGS: { ...actual.FEATURE_FLAGS, comfyRunner: true },
  }
})

let mockIsMobile = false
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}))

// jsdom 没有 ResizeObserver；弹层用它量高度做补间，测试里给个空壳。
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

function card(name: RegExp) {
  return screen.getByRole('button', { name })
}

function renderModal(
  props: Partial<Parameters<typeof LoraBaseModelModal>[0]> = {},
) {
  render(
    <LoraBaseModelModal
      open
      onOpenChange={vi.fn()}
      compatibleBases={getBaseOnlyGenerationBases()}
      selectedBaseId="anima-dit-turbo-v11-runner"
      onSelect={vi.fn()}
      hasMountedLora={false}
      {...props}
    />,
  )
}

describe('LoraBaseModelModal（45 Runner 底模 · ④ 画板）', () => {
  beforeEach(() => {
    mockIsMobile = false
  })

  it('M1 纯底模：两组八张、没有「自动」、没有开关，Turbo 推荐 + 快出', () => {
    renderModal()

    expect(screen.queryByText('LoraWorkbench:spine.sourceCheckpointAuto')).toBe(
      null,
    )
    expect(
      screen.queryByLabelText('LoraWorkbench:baseModal.onlyCompatible'),
    ).toBe(null)
    // 09-17 退役的云端组与页脚「忠实 / 快」说法都不在了。
    expect(screen.queryByText(/NoobAI|FLUX\.1|SD 1\.5/)).toBe(null)

    const turbo = card(/Anima Turbo v1\.1/)
    expect(turbo).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(turbo).getByText('LoraWorkbench:baseModal.recommended'),
    ).toBeInTheDocument()
    expect(
      within(turbo).getByText('LoraWorkbench:baseModal.fast'),
    ).toBeInTheDocument()
    // Base 不蒸馏：没有「快出」，纯底模时也不推荐。
    const base = card(/Anima Base v1\.0/)
    expect(within(base).queryByText('LoraWorkbench:baseModal.fast')).toBe(null)
    expect(
      within(base).queryByText('LoraWorkbench:baseModal.recommended'),
    ).toBe(null)
    // 第二行写家族：SDXL 的 anima 写 Anima Pencil，DiT 的写 Anima。
    expect(
      within(card(/Anima Pencil-XL/)).getByText(
        'LoraWorkbench:familyLabel.animaPencil',
      ),
    ).toBeInTheDocument()
    expect(
      within(turbo).getByText('LoraWorkbench:familyLabel.anima'),
    ).toBeInTheDocument()
    // SDXL 系 4 张 + DiT 系 4 张（Base · Turbo · Z-Image Turbo · Krea 2 Turbo）。
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(7)
    const zImage = card(/Z-Image Turbo/)
    expect(
      within(zImage).getByText('LoraWorkbench:familyLabel.zImage'),
    ).toBeInTheDocument()
    expect(
      within(zImage).getByText('LoraWorkbench:baseModal.recommended'),
    ).toBeInTheDocument()
    expect(
      within(zImage).getByText('LoraWorkbench:baseModal.fast'),
    ).toBeInTheDocument()
  })

  it('M3 挂了 Z-Image 的 LoRA：只有 Z-Image Turbo 一张', () => {
    renderModal({
      compatibleBases: getCompatibleBases('ZImageTurbo'),
      selectedBaseId: 'z-image-turbo-runner',
      hasMountedLora: true,
    })

    expect(card(/Z-Image Turbo/)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryAllByRole('button', { pressed: false })).toHaveLength(0)
    expect(screen.queryByText('LoraWorkbench:spine.baseGroupSdxl')).toBe(null)
  })

  it('M2 挂了 Anima 的 LoRA：只剩 DiT 三张，「自动」推荐、Turbo 不推荐', () => {
    renderModal({
      compatibleBases: getCompatibleBases('Anima'),
      selectedBaseId: 'anima-dit-runner',
      hasMountedLora: true,
    })

    // 选中的「自动」之外只剩 Base · Turbo 两张。
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(2)
    const auto = card(/LoraWorkbench:spine\.sourceCheckpointAuto/)
    expect(auto).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(auto).getByText('LoraWorkbench:baseModal.recommended'),
    ).toBeInTheDocument()
    expect(
      within(card(/Anima Turbo v1\.1/)).queryByText(
        'LoraWorkbench:baseModal.recommended',
      ),
    ).toBe(null)
    expect(screen.queryByText('LoraWorkbench:spine.baseGroupSdxl')).toBe(null)
  })

  it('M4 关掉「只看兼容的」：全部列出，装不上的写明', () => {
    renderModal({
      compatibleBases: getCompatibleBases('Anima'),
      selectedBaseId: 'anima-dit-runner',
      hasMountedLora: true,
    })
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'LoraWorkbench:baseModal.onlyCompatible',
      }),
    )

    expect(
      within(card(/Pony Diffusion V6/)).getByText(
        'LoraWorkbench:baseModal.incompatible',
      ),
    ).toBeInTheDocument()
    expect(
      within(card(/Anima Turbo v1\.1/)).queryByText(
        'LoraWorkbench:baseModal.incompatible',
      ),
    ).toBe(null)
  })

  it('手机：一列，当前选中那组排在前面', () => {
    mockIsMobile = true
    renderModal()

    const headings = screen
      .getAllByText(/LoraWorkbench:spine\.baseGroup(Dit|Sdxl)/)
      .map((node) => node.textContent)
    expect(headings).toEqual([
      'LoraWorkbench:spine.baseGroupDit',
      'LoraWorkbench:spine.baseGroupSdxl',
    ])
  })
})
