/**
 * 助手外壳（`StudioOperatorDock`）的草稿与附件那一半（L2b）：草稿跟着对话走、📎 上传、
 * 新结果自动带进下一句、挂参考位的宿主（画布）的一套 chip。
 *
 * 真 Dock + 真面板 + 真宿主 Provider（`src/test/operator-dock.tsx`），只假上传那两条
 * api-client 与挂载时的两条 GET。
 */
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addOperatorMention,
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import { installFakeVideoDecoding } from '@/test/fake-video-element'
import { text } from '@/test/i18n-text'
import {
  DOCK_HOST,
  dockAttachmentLabels,
  dockBench,
  dockDraft,
  fakeDockServer,
  renderDock,
  resetDockHost,
  settleDock,
  typeDockDraft,
} from '@/test/operator-dock'
import { DOCK_USER } from '@/test/operator-dock-user'
import { DESKTOP_WIDTH, setViewportWidth } from '@/test/viewport'

vi.mock('@clerk/nextjs', async () =>
  (await import('@/test/operator-dock-user')).clerkDockMock(),
)
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

/** 上传落库回来的那一条（只假 api-client：R2 直传那几跳不是这里要钉的）。 */
function uploaded(file: File, outputType: 'IMAGE' | 'AUDIO') {
  return {
    success: true as const,
    data: {
      generation: {
        id: `gen-${file.name}`,
        url: `https://cdn.test/${file.name}`,
        outputType,
      },
    },
  }
}
const uploadImageFileAPI = vi.hoisted(() => vi.fn())
const uploadAudioFileAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/generation')>()),
  uploadImageFileAPI,
  uploadAudioFileAPI,
}))

beforeEach(() => {
  resetDockHost()
  resetOperatorThread()
  setViewportWidth(DESKTOP_WIDTH)
  fakeDockServer()
  // 读音频时长：jsdom 不解码，替的是 `<audio>` 那一层。
  installFakeVideoDecoding({ 'blob:x': { duration: 3 } })
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    }),
  )
  uploadImageFileAPI.mockImplementation(async (file: File) =>
    uploaded(file, 'IMAGE'),
  )
  uploadAudioFileAPI.mockImplementation(async (file: File) =>
    uploaded(file, 'AUDIO'),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** 从 📎 那条隐藏的 file input 传一个文件，等上传跑完。 */
async function attachFile(name: string, type: string) {
  const input = screen.getByTestId('operator-attach-file-input')
  const file = new File(['x'], name, { type })
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } })
  })
  await settleDock()
  await settleDock()
}

/** 点掉所有 chip 的 ✕。 */
function removeAllChips() {
  for (const button of screen.queryAllByRole('button', {
    name: text('StudioOperator.attach.remove'),
  })) {
    fireEvent.click(button)
  }
}

const references = () => dockBench.references.referenceImages

describe('StudioOperatorDock · 草稿跟着对话走', () => {
  it('草稿和非图片附件：换台留着，新对话 / 换账号清空（9d）', async () => {
    const view = renderDock()
    await settleDock()
    typeDockDraft('natural assistant draft')
    await attachFile('a.mp3', 'audio/mpeg')
    expect(dockAttachmentLabels()).toEqual([expect.stringContaining('a.mp3')])

    DOCK_HOST.workspace = 'image-tags'
    view.rerender()
    expect(dockDraft()).toBe('natural assistant draft')
    expect(dockAttachmentLabels()).toHaveLength(1)

    act(() => resetOperatorThread())
    expect(dockDraft()).toBe('')
    expect(dockAttachmentLabels()).toEqual([])

    typeDockDraft('private')
    DOCK_USER.id = 'user-b'
    view.rerender()
    await settleDock()
    expect(dockDraft()).toBe('')
    expect(dockAttachmentLabels()).toEqual([])
  })
})

describe('StudioOperatorDock · 默认宿主的附件', () => {
  it('⭐ 📎 上传与 @ 的图只跟这条消息走，⛔ 不挂出图参考位', async () => {
    renderDock()
    await settleDock()
    await attachFile('first.png', 'image/png')
    act(() =>
      addOperatorMention({
        id: 'mentioned',
        kind: 'image',
        url: 'https://cdn.test/mentioned.png',
        label: 'mentioned',
      }),
    )
    expect(references()).toEqual([])
    expect(dockAttachmentLabels()).toEqual([
      expect.stringContaining('first.png'),
    ])
    removeAllChips()
    expect(dockAttachmentLabels()).toEqual([])
  })

  it('⭐ 新出的结果自动带进下一句（可删），挂载时已有的不算；下一批换掉上一批', async () => {
    DOCK_HOST.results = [
      { id: 'old', url: 'https://cdn.test/old.png', label: '图_010' },
    ]
    const view = renderDock()
    await settleDock()
    expect(dockAttachmentLabels()).toEqual([])

    DOCK_HOST.results = [
      { id: 'new-1', url: 'https://cdn.test/new-1.png', label: '图_011' },
      ...DOCK_HOST.results,
    ]
    view.rerender()
    expect(dockAttachmentLabels()).toEqual([
      expect.stringContaining(
        text('StudioOperator.attach.latestResult', { label: '图_011' }),
      ),
    ])

    DOCK_HOST.results = [
      { id: 'new-2', url: 'https://cdn.test/new-2.png', label: '图_012' },
      ...DOCK_HOST.results,
    ]
    view.rerender()
    expect(dockAttachmentLabels()).toEqual([expect.stringContaining('图_012')])
    removeAllChips()
    expect(dockAttachmentLabels()).toEqual([])
  })

  it('参考位换了一张（数量不变）也⛔ 不改写正文', async () => {
    renderDock()
    await settleDock()
    act(() =>
      dockBench.references.addReferenceImage('https://cdn.test/old.png'),
    )
    typeDockDraft('参考一下')
    act(() => {
      dockBench.references.removeReferenceImage(0)
      dockBench.references.addReferenceImage('https://cdn.test/new.png')
    })
    expect(references()).toEqual(['https://cdn.test/new.png'])
    expect(dockDraft()).toBe('参考一下')
  })
})

describe('StudioOperatorDock · 挂参考位的宿主（画布）', () => {
  beforeEach(() => {
    DOCK_HOST.attachmentsMountReferences = true
  })

  it('不自动带结果', async () => {
    const view = renderDock()
    await settleDock()
    DOCK_HOST.results = [{ id: 'new', url: 'https://cdn.test/new.png' }]
    view.rerender()
    expect(dockAttachmentLabels()).toEqual([])
  })

  it('📎 上传与参考位共用一张清单，摘 chip = 摘参考位，草稿不动', async () => {
    renderDock()
    await settleDock()
    await attachFile('first.png', 'image/png')
    expect(references()).toEqual(['https://cdn.test/first.png'])
    expect(dockAttachmentLabels()).toHaveLength(1)

    act(() =>
      dockBench.references.addReferenceImage('https://cdn.test/second.png'),
    )
    expect(dockAttachmentLabels()).toHaveLength(2)

    typeDockDraft('参考这两张')
    fireEvent.click(
      screen.getAllByRole('button', {
        name: text('StudioOperator.attach.remove'),
      })[0],
    )
    expect(references()).toEqual(['https://cdn.test/second.png'])
    expect(dockDraft()).toBe('参考这两张')

    act(() => dockBench.references.clearAllImages())
    expect(dockAttachmentLabels()).toEqual([])
    expect(dockDraft()).toBe('参考这两张')
  })

  // owner 2026-09-29：画布上十几张图全摆成 chip，「节点太多这边显得很冗余」。
  it('宿主自己带出来的参考图（implicit）不摆成 chip；移走别的 chip 时也不碰它们', async () => {
    DOCK_HOST.implicitReferences = [
      { url: 'https://cdn.test/canvas.png', name: '生成图', implicit: true },
    ]
    renderDock()
    await settleDock()
    act(() =>
      dockBench.references.addReferenceImage('https://cdn.test/pinned.png'),
    )
    expect(dockAttachmentLabels()).toHaveLength(1)
    removeAllChips()
    expect(DOCK_HOST.removedUrls).toEqual(['https://cdn.test/pinned.png'])
  })

  it('@ 进来的图⛔ 不偷换成参考位 / 📎（§10b 一套 chip）', async () => {
    renderDock()
    await settleDock()
    await attachFile('library.png', 'image/png')
    act(() =>
      addOperatorMention({
        id: 'dragged',
        kind: 'image',
        url: 'https://cdn.test/dragged.png',
        label: 'dragged',
      }),
    )
    expect(references()).toEqual(['https://cdn.test/library.png'])
    expect(dockAttachmentLabels()).toHaveLength(1)
    expect(getOperatorState().mentions.map((item) => item.id)).toContain(
      'dragged',
    )
  })
})
