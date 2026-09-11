// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`
//   （加包之前先翻已有依赖）。这几下都是单纯的点击，两者等价。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StudioOperatorAttachMenu } from './StudioOperatorAttachMenu'

/**
 * v2 §4.4 的回归闸：输入区「+」菜单**三项，不多不少**。
 *
 * ⚠ 最容易以「三绿而功能没了」的方式回退的是「提及素材」——它不弹自己的选择器，
 * 而是插一个 `@` 把 `MentionInput` 现有那颗唤出来。断言钉的是**回调真的被调到**，
 * 不是「这块 DOM 还在」。
 * ⚠ 「指定来源」本轮**必须是停用**的：白 / 黑名单是 commit #17。可点但什么都不
 * 发生就是本仓明令不许的死按钮。
 */

/**
 * ⚠ 挡在 **hook** 这一层而不是 `@/lib/api-client` 的桶文件：桶文件一 mock 就要
 * 把整份导出补齐，而这颗组件只认 `useContextCards()` 给的那三格。
 */
const mockUseContextCards = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-context-cards', () => ({
  useContextCards: mockUseContextCards,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span data-testid="spinner" />,
}))

vi.mock(
  '@/components/business/studio/assistant-operator/ContextCardDialog',
  () => ({
    ContextCardDialog: ({ open }: { open: boolean }) =>
      open ? (
        <div data-testid="context-card-dialog" data-slot="dialog-content" />
      ) : null,
  }),
)

const defaultProps = {
  onDismiss: vi.fn(),
  onPickMention: vi.fn(),
  onPickCard: vi.fn(),
  triggerRef: { current: null },
}

const CARD = {
  id: 'card-1',
  name: '阿岚',
  kind: 'character',
  summary: '',
  body: '',
  negative: '',
  images: [],
  pinnedScopes: [],
}

/** `useContextCards({ enabled })` 的最小替身 —— 记下它被怎么调的。 */
function stubContextCards(cards: readonly unknown[]) {
  return (options: { enabled?: boolean } = {}) => ({
    cards: options.enabled === false ? [] : cards,
    isLoading: false,
    error: null,
  })
}

function KeyboardDismissHarness({ onDismiss }: { onDismiss(): void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div>
      {open ? (
        <StudioOperatorAttachMenu
          {...defaultProps}
          triggerRef={triggerRef}
          onDismiss={() => {
            onDismiss()
            setOpen(false)
          }}
        />
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        data-operator-plus-trigger
        onClick={() => setOpen(true)}
      >
        trigger
      </button>
    </div>
  )
}

describe('StudioOperatorAttachMenu · v2 §4.4「+」菜单三项', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseContextCards.mockImplementation(stubContextCards([CARD]))
  })

  it('只有三项：提及素材 / 上下文卡 / 指定来源，⛔ 没有「附件」', () => {
    render(<StudioOperatorAttachMenu {...defaultProps} />)

    expect(screen.getByTestId('operator-plus-item-mention')).toBeTruthy()
    expect(screen.getByTestId('operator-plus-item-contextCard')).toBeTruthy()
    expect(screen.getByTestId('operator-plus-item-source')).toBeTruthy()
    // 上传有自己那颗回形针按钮，⛔ 不在菜单里
    expect(screen.queryByTestId('operator-attach-upload')).toBeNull()
    expect(screen.queryByTestId('operator-attach-file-input')).toBeNull()
    expect(
      screen.getByTestId('operator-plus-menu').querySelectorAll('button'),
    ).toHaveLength(3)
  })

  it('「提及素材」唤出 @ 选择器并收起菜单（⛔ 不在这里再画一份选择器）', () => {
    const onPickMention = vi.fn()
    const onDismiss = vi.fn()
    render(
      <StudioOperatorAttachMenu
        {...defaultProps}
        onPickMention={onPickMention}
        onDismiss={onDismiss}
      />,
    )

    fireEvent.click(screen.getByTestId('operator-plus-item-mention'))
    expect(onPickMention).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('「指定来源」本轮停用（commit #17 才接白 / 黑名单）—— ⛔ 不是死按钮', () => {
    render(<StudioOperatorAttachMenu {...defaultProps} />)

    const item = screen.getByTestId(
      'operator-plus-item-source',
    ) as HTMLButtonElement
    expect(item.disabled).toBe(true)
  })

  it('「上下文卡」列出卡表，点一张 = 挂上并收起', async () => {
    const onPickCard = vi.fn()
    const onDismiss = vi.fn()
    render(
      <StudioOperatorAttachMenu
        {...defaultProps}
        onPickCard={onPickCard}
        onDismiss={onDismiss}
      />,
    )

    // ⚠ 进了卡片档才拉卡表：一打开就拉等于每点一次「+」都打一发请求。
    expect(mockUseContextCards.mock.calls[0]?.[0]).toEqual({ enabled: false })
    fireEvent.click(screen.getByTestId('operator-plus-item-contextCard'))
    await waitFor(() =>
      expect(
        mockUseContextCards.mock.calls.some(
          (call: unknown[]) =>
            (call[0] as { enabled?: boolean } | undefined)?.enabled === true,
        ),
      ).toBe(true),
    )

    const chip = await screen.findByText('阿岚')
    fireEvent.click(chip)

    expect(onPickCard).toHaveBeenCalledTimes(1)
    expect(onPickCard.mock.calls[0]?.[0]).toEqual({
      cardId: 'card-1',
      name: '阿岚',
      kind: 'character',
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('一张卡都没有时给的是「新建一张」这条下一步，⛔ 不摆白板', async () => {
    mockUseContextCards.mockImplementation(stubContextCards([]))
    render(<StudioOperatorAttachMenu {...defaultProps} />)

    fireEvent.click(screen.getByTestId('operator-plus-item-contextCard'))
    const create = await screen.findByTestId('operator-plus-card-create')

    fireEvent.click(create)
    expect(screen.getByTestId('context-card-dialog')).toBeTruthy()
  })

  it('点击菜单外会收起，菜单内与卡片弹层内不会误关', async () => {
    const onDismiss = vi.fn()
    render(
      <div>
        <button type="button" data-testid="trigger" data-operator-plus-trigger>
          trigger
        </button>
        <button type="button" data-testid="outside">
          outside
        </button>
        <StudioOperatorAttachMenu {...defaultProps} onDismiss={onDismiss} />
      </div>,
    )

    fireEvent.pointerDown(screen.getByTestId('operator-plus-menu'))
    expect(onDismiss).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByTestId('trigger'))
    expect(onDismiss).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('operator-plus-item-contextCard'))
    fireEvent.click(await screen.findByTestId('operator-plus-card-create'))
    fireEvent.pointerDown(screen.getByTestId('context-card-dialog'))
    expect(onDismiss).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('打开后聚焦首个操作，Escape 关闭并把焦点还给触发器', async () => {
    const onDismiss = vi.fn()
    render(<KeyboardDismissHarness onDismiss={onDismiss} />)

    fireEvent.click(screen.getByText('trigger'))

    expect(document.activeElement).toBe(
      screen.getByTestId('operator-plus-item-mention'),
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('operator-plus-menu')).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByText('trigger')),
    )
  })

  it('消费 Escape 后不再冒泡到 Studio 的全局收起快捷键', () => {
    const studioEscapeLadder = vi.fn()
    window.addEventListener('keydown', studioEscapeLadder)

    try {
      render(<KeyboardDismissHarness onDismiss={vi.fn()} />)
      fireEvent.click(screen.getByText('trigger'))
      fireEvent.keyDown(document, { key: 'Escape' })

      expect(studioEscapeLadder).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', studioEscapeLadder)
    }
  })
})
