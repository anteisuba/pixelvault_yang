// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImageUpload } from '@/hooks/use-image-upload'
import {
  addOperatorMention,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'
import type { StudioOperatorPanel } from './StudioOperatorPanel'
type StudioOperatorPanelProps = Parameters<typeof StudioOperatorPanel>[0]

import {
  STUDIO_OPERATOR_PANEL_RESIZE,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'

/**
 * 面板外壳的几何闸（§11.1）+ 「胶囊已删」的回归闸（拍板 7 改口）。
 *
 * ⭐ 本来该由 `verify-real` 在真机上读这几个数（面板宽 560 · inset 24 · 轨宽 48），
 * 2026-09-06 本次施工时 claude-in-chrome 扩展未连接，所以把同样的断言钉在这里 ——
 * ⛔ 静态检查不冒称视觉验证，但这几个**数**必须有机器守着。
 *
 * 钉四件事：
 *  ① 展开态宽 = `defaultWidthPx`（560），fixed 四边 inset 24（`top-6/right-6/bottom-6`）；
 *  ② 收起态是**同一个 `<aside>` 收到 48px**，⛔ 不再有另一颗 fixed 在别处的胶囊
 *     （胶囊连同它的 testid 已于切片 3a 全仓删净，所以这里不再断言它不存在 ——
 *      一条永远不会失败的断言只是噪音）；
 *  ③ 收起态渲染图标轨，展开态不渲染；
 *  ④ 点轨展开（收放法则的「点图标轨 → 展开」那一半）；
 *  ⑤ **手机档**（本片）：全屏 Sheet + 右下浮标，⛔ 没有图标轨、没有那颗
 *     `<aside>`；LoRA 域在手机上整颗不渲染（那条路由仍走 `LoraAssistantDock`，
 *     两颗面板永不同屏）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const setOpen = vi.hoisted(() => vi.fn())
let hostOpen = true
let hostDomain = 'image'
let mobile = false
let references: ReturnType<typeof useImageUpload>
let panelProps: StudioOperatorPanelProps
let onUploaded: (attachment: StudioOperatorAttachment) => void

vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => {
    references = useImageUpload()
    return {
      open: hostOpen,
      setOpen,
      domain: hostDomain,
      referenceLimit: 4,
      referenceImages: references.referenceEntries,
      apply: {
        addReference: references.addReferenceImage,
        removeReference: (url: string) => {
          const index = references.referenceEntries.findIndex(
            (entry) => entry.url === url,
          )
          if (index >= 0) references.removeReferenceImage(index)
        },
      },
      results: [],
    }
  },
}))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }))
vi.mock('@/hooks/use-assistant-operator', () => ({
  useAssistantOperator: () => ({
    domain: 'image',
    send: vi.fn(),
    stop: vi.fn(),
    newThread: vi.fn(),
    critique: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-studio-operator-critique', () => ({
  useStudioOperatorCritique: () => undefined,
}))
// 助手设置 persona（§8）—— 外壳拉一次往下传，这里给一份不发请求的默认值。
vi.mock('@/hooks/use-assistant-persona', () => ({
  useAssistantPersona: () => ({
    persona: {
      name: null,
      avatarPreset: 'mark',
      avatarUrl: null,
      tone: 'professional',
      toneCustom: null,
      verbosity: 'standard',
      planMode: 'auto',
      language: 'ui',
    },
    isLoading: false,
    isSaving: false,
    error: null,
    save: vi.fn(),
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn(),
    reload: vi.fn(),
  }),
}))
vi.mock(
  '@/components/business/studio/assistant-operator/AssistantSettingsDialog',
  () => ({
    ASSISTANT_SETTINGS_SECTIONS: { persona: 'persona', rules: 'rules' },
    AssistantSettingsDialog: () => null,
  }),
)
vi.mock('@/hooks/use-studio-operator-history', () => ({
  useStudioOperatorHistory: () => ({
    sessions: [],
    currentSessionId: null,
    isHydrating: false,
    error: null,
    selectSession: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-studio-operator-upload', () => ({
  useStudioOperatorUpload: (options: { onUploaded: typeof onUploaded }) => {
    onUploaded = options.onUploaded
    return {
      uploads: [],
      uploadFiles: vi.fn(),
      retryUpload: vi.fn(),
      dismissUpload: vi.fn(),
    }
  },
}))
vi.mock('@/hooks/use-studio-operator-web-import', () => ({
  useStudioOperatorWebImport: () => ({
    states: {},
    limit: 4,
    toggleCandidate: vi.fn(),
  }),
}))
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorPanel',
  () => ({
    StudioOperatorPanel: (props: StudioOperatorPanelProps) => {
      panelProps = props
      return <div data-testid="operator-panel-content" />
    },
  }),
)
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorLightbox',
  () => ({ StudioOperatorLightbox: () => null, openOperatorLightbox: vi.fn() }),
)

import { StudioOperatorDock } from './StudioOperatorDock'

beforeEach(() => {
  hostOpen = true
  hostDomain = 'image'
  mobile = false
  setOpen.mockClear()
  resetOperatorThread()
})

describe('StudioOperatorDock', () => {
  it('uploads and workspace reference changes share one list, including removals and draft renumbering', () => {
    render(<StudioOperatorDock />)
    const first: StudioOperatorAttachment = {
      id: 'uploaded',
      kind: 'image',
      url: 'https://cdn.test/first.png',
      label: 'uploaded',
    }
    act(() => onUploaded(first))
    expect(references.referenceImages).toEqual([first.url])
    expect(panelProps.attachments.map((item) => item.url)).toEqual([first.url])
    act(() => references.addReferenceImage('https://cdn.test/second.png'))
    expect(panelProps.attachments).toHaveLength(2)
    act(() => panelProps.onDraftChange('参考@Image2'))
    act(() => panelProps.onAttachmentsChange(panelProps.attachments.slice(1)))
    expect(references.referenceImages).toEqual(['https://cdn.test/second.png'])
    expect(panelProps.draft).toBe('参考@Image1')
    act(() => references.clearAllImages())
    expect(panelProps.attachments).toEqual([])
    expect(panelProps.draft).toBe('参考')
  })

  it('library selections and dragged mention images enter the shared references without duplicates', () => {
    render(<StudioOperatorDock />)
    const image: StudioOperatorAttachment = {
      id: 'library',
      kind: 'image',
      url: 'https://cdn.test/library.png',
      label: 'library',
    }
    act(() => panelProps.onAttachmentsChange([image]))
    act(() => addOperatorMention({ ...image, id: 'dragged' }))
    expect(references.referenceImages).toEqual([image.url])
    expect(panelProps.attachments).toHaveLength(1)
  })

  it('展开态：宽 560、fixed 四边 inset 24', () => {
    render(<StudioOperatorDock />)
    const panel = screen.getByTestId('operator-panel')
    expect(panel.style.width).toBe(
      `${STUDIO_OPERATOR_PANEL_RESIZE.defaultWidthPx}px`,
    )
    // Tailwind 的 6 档 = 1.5rem = 24px = `STUDIO_OPERATOR_SHELL.insetPx`。
    expect(STUDIO_OPERATOR_SHELL.insetPx).toBe(24)
    expect(panel.className).toContain('fixed bottom-6 right-6 top-6')
    expect(screen.getByTestId('operator-panel-content')).toBeTruthy()
    expect(screen.queryByTestId('operator-rail')).toBeNull()
  })

  it('展开态皮肤走脊柱：bg-card + border + shadow-lg + rounded-xl', () => {
    render(<StudioOperatorDock />)
    const panel = screen.getByTestId('operator-panel')
    expect(panel.className).toContain('rounded-xl')
    expect(panel.className).toContain('border border-border')
    expect(panel.className).toContain('bg-card')
    expect(panel.className).toContain('shadow-lg')
  })

  it('收起态：同一个 aside 收到 48px 并渲染图标轨，⛔ 没有胶囊', () => {
    hostOpen = false
    render(<StudioOperatorDock />)
    const panel = screen.getByTestId('operator-panel')
    expect(panel.dataset.open).toBe('false')
    expect(panel.style.width).toBe(`${STUDIO_OPERATOR_SHELL.railWidthPx}px`)
    expect(screen.getByTestId('operator-rail')).toBeTruthy()
    expect(screen.queryByTestId('operator-panel-content')).toBeNull()
  })

  it('点图标轨展开', () => {
    hostOpen = false
    render(<StudioOperatorDock />)
    fireEvent.click(screen.getByTestId('operator-rail'))
    expect(setOpen).toHaveBeenCalledWith(true)
  })
})

describe('StudioOperatorDock · 手机档', () => {
  it('渲染全屏 Sheet + 浮标，⛔ 没有图标轨、没有桌面 aside', () => {
    mobile = true
    render(<StudioOperatorDock />)
    expect(screen.getByTestId('operator-mobile-sheet')).toBeTruthy()
    expect(screen.getByTestId('operator-mobile-fab')).toBeTruthy()
    expect(screen.queryByTestId('operator-rail')).toBeNull()
    expect(screen.queryByTestId('operator-panel')).toBeNull()
  })

  it('Sheet 装的是同一个面板（open 时挂上、关闭时卸载）', () => {
    mobile = true
    const { unmount } = render(<StudioOperatorDock />)
    expect(screen.getByTestId('operator-panel-content')).toBeTruthy()
    unmount()

    hostOpen = false
    render(<StudioOperatorDock />)
    expect(screen.queryByTestId('operator-mobile-sheet')).toBeNull()
    expect(screen.queryByTestId('operator-panel-content')).toBeNull()
    // 面板收起时浮标仍在 —— 它是手机上唯一的入口。
    expect(screen.getByTestId('operator-mobile-fab')).toBeTruthy()
  })

  it('点浮标打开', () => {
    mobile = true
    hostOpen = false
    render(<StudioOperatorDock />)
    fireEvent.click(screen.getByTestId('operator-mobile-fab'))
    expect(setOpen).toHaveBeenCalledWith(true)
  })

  it('LoRA 域在手机上整颗不渲染（装配台仍走 LoraAssistantDock）', () => {
    mobile = true
    hostDomain = 'lora'
    const { container } = render(<StudioOperatorDock />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('operator-mobile-sheet')).toBeNull()
    expect(screen.queryByTestId('operator-mobile-fab')).toBeNull()
  })
})
