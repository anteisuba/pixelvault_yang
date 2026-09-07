// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CONTEXT_CARD_IMAGE_ROLE_IDS,
  CONTEXT_CARD_KIND_IDS,
} from '@/constants/context-cards'
import type { ContextCard } from '@/types/context-cards'

/**
 * 上下文卡编辑器（K1）的回归闸，四条：
 *  ① **每一格都真的落进那一次保存** —— 这颗最容易以「界面画出来了、存的却是旧值」
 *    的方式坏掉（与 persona 那颗同一条论据）。
 *  ② **保存失败就地说话**（`role="alert"`）—— 失败时什么都不发生的话，用户只看到
 *    弹层不关。
 *  ③ **参考图要先有卡** —— 图的 R2 key 里带着卡 id，新卡上不该能点上传。
 *  ④ **常挂走服务端那一跳**，⛔ 不在本地拼一份 `pinnedScopes`。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...(props as { src: string; alt: string })} />
  ),
}))

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockAddImage = vi.fn()
const mockRemoveImage = vi.fn()
const mockSetPinned = vi.fn()
let hookError: string | null = null

vi.mock('@/hooks/use-context-cards', () => ({
  useContextCards: () => ({
    cards: [],
    isLoading: false,
    error: hookError,
    create: mockCreate,
    update: mockUpdate,
    remove: vi.fn(),
    setPinned: mockSetPinned,
    addImage: mockAddImage,
    removeImage: mockRemoveImage,
    reload: vi.fn(),
  }),
}))

import { ContextCardDialog } from './ContextCardDialog'

const CARD: ContextCard = {
  id: 'card-1',
  kind: CONTEXT_CARD_KIND_IDS.character,
  name: 'Sigrika',
  summary: 'Silver hair.',
  body: 'Silver hair down to the shoulder.',
  images: [
    {
      url: 'https://cdn.test/sheet.png',
      role: CONTEXT_CARD_IMAGE_ROLE_IDS.sheet,
      sourceRef: null,
    },
  ],
  negative: 'air ripples',
  pinnedScopes: [],
  createdAt: '2026-09-07T10:00:00.000Z',
  updatedAt: '2026-09-07T10:00:00.000Z',
}

describe('ContextCardDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hookError = null
    mockCreate.mockResolvedValue(CARD)
    mockUpdate.mockResolvedValue(CARD)
  })

  it('新建：名字 / 摘要 / 正文 / 硬否定都落进那一次 create', async () => {
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    render(
      <ContextCardDialog open onOpenChange={onOpenChange} onSaved={onSaved} />,
    )

    fireEvent.change(screen.getByLabelText('nameLabel'), {
      target: { value: '  Sigrika  ' },
    })
    fireEvent.change(screen.getByLabelText('summaryLabel'), {
      target: { value: 'Silver hair.' },
    })
    fireEvent.change(screen.getByLabelText('bodyLabel'), {
      target: { value: 'Silver hair down to the shoulder.' },
    })
    fireEvent.change(screen.getByLabelText('negativeLabel'), {
      target: { value: 'air ripples' },
    })
    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    expect(mockCreate).toHaveBeenCalledWith({
      kind: CONTEXT_CARD_KIND_IDS.character,
      // 名字两头的空格在这一跳就 trim 掉，⛔ 不留给服务端。
      name: 'Sigrika',
      summary: 'Silver hair.',
      body: 'Silver hair down to the shoulder.',
      negative: 'air ripples',
      pinnedScopes: [],
    })
    expect(onSaved).toHaveBeenCalledWith(CARD)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('三档页签换的是同一张卡的 kind', async () => {
    render(<ContextCardDialog open onOpenChange={vi.fn()} />)

    // ⚠ radix 的页签在 jsdom 里靠 mousedown 切档，`click` 一下不够。
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'kind.style' }))
    fireEvent.click(screen.getByRole('tab', { name: 'kind.style' }))
    fireEvent.change(screen.getByLabelText('nameLabel'), {
      target: { value: 'Ink wash' },
    })
    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    expect(mockCreate.mock.calls[0][0].kind).toBe(CONTEXT_CARD_KIND_IDS.style)
  })

  it('名字空着时就地报错，⛔ 一次请求都不发', async () => {
    render(<ContextCardDialog open onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('save'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'errorNameRequired',
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('保存失败时弹层不关，错误就地说出来', async () => {
    hookError = 'Failed to save context card'
    mockCreate.mockResolvedValue(null)
    const onOpenChange = vi.fn()
    render(<ContextCardDialog open onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('nameLabel'), {
      target: { value: 'Sigrika' },
    })
    fireEvent.click(screen.getByText('save'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to save context card',
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  /** ⚠ 图的 R2 key 里带着卡 id —— 新卡上不该能点上传。 */
  it('没保存过的卡上传不了图，且说明了原因', () => {
    render(<ContextCardDialog open onOpenChange={vi.fn()} />)

    expect(screen.getByText('uploadImage').closest('button')).toBeDisabled()
    expect(screen.getByText('saveBeforeUpload')).toBeInTheDocument()
  })

  it('编辑已有卡时能传图，role 跟着分档走', async () => {
    render(<ContextCardDialog open onOpenChange={vi.fn()} card={CARD} />)

    // ⚠ `role.sheet` 在这颗弹层里出现两次（图上的角标 + 分档控件）——
    //   按 role 取那颗控件，⛔ 别按文本抓。
    fireEvent.click(screen.getByRole('radio', { name: 'role.sheet' }))
    const input = screen.getByTestId('context-card-file')
    const file = new File(['x'], 'sheet.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockAddImage).toHaveBeenCalled())
    expect(mockAddImage.mock.calls[0][0]).toBe('card-1')
    expect(mockAddImage.mock.calls[0][1].role).toBe(
      CONTEXT_CARD_IMAGE_ROLE_IDS.sheet,
    )
  })

  it('摘掉一张图按 URL 走服务端', async () => {
    mockRemoveImage.mockResolvedValue({ ...CARD, images: [] })
    render(<ContextCardDialog open onOpenChange={vi.fn()} card={CARD} />)

    fireEvent.click(screen.getByLabelText('removeImage'))

    await waitFor(() => expect(mockRemoveImage).toHaveBeenCalled())
    expect(mockRemoveImage).toHaveBeenCalledWith(
      'card-1',
      'https://cdn.test/sheet.png',
    )
  })

  /** ⭐ 常挂是服务端读改写的一格开关，⛔ 不在本地拼一份整份数组。 */
  it('常挂开关走服务端那一跳，只切当前工作台那一格', async () => {
    mockSetPinned.mockResolvedValue({ ...CARD, pinnedScopes: ['image'] })
    render(
      <ContextCardDialog
        open
        onOpenChange={vi.fn()}
        card={CARD}
        scope="image"
      />,
    )

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => expect(mockSetPinned).toHaveBeenCalled())
    expect(mockSetPinned).toHaveBeenCalledWith('card-1', 'image', true)
  })

  it('没有当前工作台时不画常挂开关', () => {
    render(<ContextCardDialog open onOpenChange={vi.fn()} card={CARD} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
