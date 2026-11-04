/**
 * 助手外壳（`StudioOperatorDock`）的 L2b 底座：真 Dock + 真面板 + 真 `StudioOperatorHostProvider`
 * + 真 `ApiKeysProvider`，只假网络（`fakeServer`）。
 *
 * 宿主是测试自己摆的一份（`DOCK_HOST`，可变盒子）：参考图轨用真的 `useImageUpload`，
 * 开合是一份真 state（Dock 叫 `setOpen` 就真开 / 真关）。用例改宿主的某一格后 `rerender`。
 * ⚠ 调用方用 `./operator-dock-user` 的 `clerkDockMock` 去 `vi.mock('@clerk/nextjs')`；
 *   换账号 = 改 `DOCK_USER.id` 再 `rerender`。
 */
import {
  useLayoutEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { act, fireEvent, screen } from '@testing-library/react'

import { API_ENDPOINTS } from '@/constants/config'
import type { StudioOperatorShellAnchor } from '@/constants/studio-assistant-operator'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import {
  StudioOperatorHostProvider,
  type StudioOperatorHost,
} from '@/contexts/studio-operator-host'
import { StudioOperatorDock } from '@/features/assistant'
import { useImageUpload } from '@/hooks/use-image-upload'
import { serializeEditor } from '@/components/ui/mention-input'
import { fakeServer, renderWithApp } from '@/test/app-harness'
import { DOCK_USER } from '@/test/operator-dock-user'

const ok = (data: unknown) => Response.json({ success: true, data })

export interface DockHostState {
  open: boolean
  domain: string
  workspace: string
  collapseOnOutsidePointer?: boolean
  attachmentsMountReferences?: boolean
  results: { id: string; url: string; label?: string; outputType?: string }[]
  anchor?: StudioOperatorShellAnchor
  /** 宿主自己带出来的参考图（画布上的图，`implicit`）。 */
  implicitReferences: { url: string; name: string; implicit: true }[]
  /** 宿主被叫去摘掉的参考图（`apply.removeReference`）。 */
  removedUrls: string[]
}

export const DOCK_HOST: DockHostState = freshHost()

function freshHost(): DockHostState {
  return {
    open: true,
    domain: 'image',
    workspace: 'image-natural',
    // ⚠ 可选的几格也要写出来：`resetDockHost` 用 `Object.assign`，缺的键不会被清掉。
    collapseOnOutsidePointer: undefined,
    attachmentsMountReferences: undefined,
    anchor: undefined,
    results: [],
    implicitReferences: [],
    removedUrls: [],
  }
}

export function resetDockHost() {
  Object.assign(DOCK_HOST, freshHost())
  DOCK_USER.id = 'user-a'
}

/** 宿主这一侧的真参考图轨 + 开合（用例直接读 / 拨）。 */
export const dockBench = {
  references: null as unknown as ReturnType<typeof useImageUpload>,
  setOpen: null as unknown as (open: boolean) => void,
}

/** 输入框占位词 = 输入框的无障碍名（面板用它当 aria-label）。 */
export const DOCK_INPUT_LABEL = '描述画面…'

const FACE = {
  domainIcon: () => null,
  contextLine: () => 'GPT Image 2 · 1:1 · 1 张',
  emptyLine: '说你想要的画面。',
  starterPills: [],
  inputPlaceholder: DOCK_INPUT_LABEL,
}

function Bench() {
  const references = useImageUpload()
  const [open, setOpenState] = useState(DOCK_HOST.open)
  // 用例改了 `DOCK_HOST.open` 再 rerender = 宿主那一侧被拨了一下。
  const [seen, setSeen] = useState(DOCK_HOST.open)
  if (seen !== DOCK_HOST.open) {
    setSeen(DOCK_HOST.open)
    setOpenState(DOCK_HOST.open)
  }
  useLayoutEffect(() => {
    dockBench.references = references
    dockBench.setOpen = (next) => {
      DOCK_HOST.open = next
      setSeen(next)
      setOpenState(next)
    }
  })
  const implicit = DOCK_HOST.implicitReferences
  // ⚠ 真宿主给的是 memo 过的同一份数组：每次渲染都拼一份新的，外壳那条「参考图变了
  //   就重排草稿」的渲染期比对会停不下来。
  const referenceImages = useMemo(
    () =>
      implicit.length
        ? [...references.referenceEntries, ...implicit]
        : references.referenceEntries,
    [references.referenceEntries, implicit],
  )
  const { domain, workspace, results, anchor } = DOCK_HOST
  const collapse = DOCK_HOST.collapseOnOutsidePointer
  const mounts = DOCK_HOST.attachmentsMountReferences
  const { addReferenceImage, removeReferenceImage, referenceEntries } =
    references
  // ⚠ 真宿主给的也是 memo 过的一份：每次渲染换新对象，消费方的 effect 会跟着空转。
  const host = useMemo(
    () =>
      ({
        open,
        setOpen: (next: boolean) => {
          DOCK_HOST.open = next
          setSeen(next)
          setOpenState(next)
        },
        domain,
        projectId: domain === 'canvas' ? 'canvas-test' : undefined,
        workspace: domain === 'image' ? workspace : domain,
        face: FACE,
        buildSnapshot: () => ({ prompt: '', availableModels: [] }),
        referenceImages,
        apply: {
          getState: () => ({}),
          dispatch: () => {},
          addReference: addReferenceImage,
          removeReference: (url: string) => {
            DOCK_HOST.removedUrls.push(url)
            const index = referenceEntries.findIndex(
              (entry) => entry.url === url,
            )
            if (index >= 0) removeReferenceImage(index)
          },
        },
        results,
        collapseOnOutsidePointer: collapse,
        attachmentsMountReferences: mounts,
        ...(anchor ? { anchor } : {}),
      }) as unknown as StudioOperatorHost,
    [
      open,
      domain,
      workspace,
      referenceImages,
      addReferenceImage,
      removeReferenceImage,
      referenceEntries,
      results,
      collapse,
      mounts,
      anchor,
    ],
  )
  return (
    <StudioOperatorHostProvider host={host}>
      <StudioOperatorDock />
    </StudioOperatorHostProvider>
  )
}

function Providers({ children }: { children: ReactNode }) {
  return <ApiKeysProvider autoLoad={false}>{children}</ApiKeysProvider>
}

/** 假网络：Dock 挂上就去拉的那两条（人设、上一段对话）回空。 */
export function fakeDockServer() {
  return fakeServer()
    .on('GET', API_ENDPOINTS.ASSISTANT_PERSONA, () => ok(null))
    .on('GET', API_ENDPOINTS.ASSISTANT_CONVERSATION, () => ok(null))
}

export function renderDock() {
  const view = renderWithApp(<Bench />, { inner: Providers })
  return {
    ...view,
    rerender: () => view.rerender((<Bench />) as ReactElement),
  }
}

/** 让挂载时那几条请求跑完（微任务 + 0 拍）。 */
export async function settleDock() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** 面板输入框（MentionInput：带 @ 菜单，所以是 combobox）。 */
export function dockInput(): HTMLElement {
  return screen.getByRole('combobox', { name: DOCK_INPUT_LABEL })
}

/** 输入框里此刻的草稿（与发出去的那一份同一个序列化）。 */
export function dockDraft(): string {
  return serializeEditor(dockInput())
}

/** 在输入框里打一段字（光标落在末尾）。 */
export function typeDockDraft(value: string) {
  const editor = dockInput()
  act(() => {
    editor.focus()
    editor.textContent = value
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    fireEvent.input(editor)
  })
}

/** 输入框上方那一排附件 chip 的文字。 */
export function dockAttachmentLabels(): string[] {
  return screen
    .queryAllByTestId('operator-attachment-chip')
    .map((chip) => chip.textContent ?? '')
}
