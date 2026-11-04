import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LoraAssetRecord } from '@/types'
import {
  LoraStackProvider,
  useActiveLoraStack,
} from '@/features/lora/hooks/use-active-lora-stack'
import { LORA_STACK_CLERK_ID, seedLoraStack } from '@/test/lora-stack'

import { LoraAssetCard } from './LoraAssetCard'

// B8 / P2-3: the my-page asset card now shares the LoraCoverTile base with
// the public library card (cover-first tile, black-nacre type badge), while
// keeping its own chrome — the "去生成" main button, the overflow actions
// menu, and the private-lock indicator. These tests lock in both the shared
// base and the preserved my-page behaviours.

const mockPush = vi.hoisted(() => vi.fn())
const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockMinePrompts = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/lora-assets', () => ({
  mineCivitaiLoraPromptsAPI: mockMinePrompts,
}))

vi.mock('next-intl', () => {
  const translators = new Map<string, (key: string) => string>()
  return {
    useTranslations: (namespace: string) => {
      if (!translators.has(namespace)) {
        translators.set(namespace, (key: string) => `${namespace}:${key}`)
      }
      return translators.get(namespace)
    },
  }
})

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
}))

function makeAsset(
  overrides: Partial<LoraAssetRecord> & { id: string; name: string },
): LoraAssetRecord {
  return {
    styleCode: overrides.id,
    source: 'imported',
    type: 'subject',
    baseModelFamily: 'Illustrious',
    provider: 'civitai',
    triggerWord: 'trigger',
    loraUrl: `https://civitai.com/api/download/models/${overrides.id}`,
    coverImageUrl: 'https://example.com/cover.png',
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: false,
    isOwn: false,
    createdAt: new Date('2020-01-01').toISOString(),
    ...overrides,
  }
}

/** 台上现在挂着哪几把（真挂载栈）。 */
function StackProbe() {
  const { items } = useActiveLoraStack()
  return (
    <output aria-label="stack">
      {items.map((item) => item.asset.id).join(',')}
    </output>
  )
}

function renderCard(ui: ReactElement) {
  return render(
    <LoraStackProvider>
      {ui}
      <StackProbe />
    </LoraStackProvider>,
  )
}

// 详情弹窗开着时外面整页 aria-hidden：照样读。
const stackIds = () =>
  screen.getByRole('status', { name: 'stack', hidden: true }).textContent

/** Radix 下拉菜单：键盘打开（jsdom 里点一下不触发）。 */
function openActions() {
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'LoraWorkbench:assetActionsLabel' }),
    { key: 'Enter' },
  )
}

describe('LoraAssetCard — B8 shared base + preserved my-page chrome', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockToastSuccess.mockReset()
    mockMinePrompts.mockReset()
    window.localStorage.clear()
  })

  it('renders the type badge on the shared black-nacre cover tile', () => {
    renderCard(
      <LoraAssetCard
        asset={makeAsset({ id: '1', name: 'My Char', type: 'subject' })}
      />,
    )

    const badge = screen.getByText('LoraWorkbench:typeSubject')
    expect(badge.className).toContain('bg-black/55')
    expect(screen.getByRole('img', { name: 'My Char' })).toBeInTheDocument()
  })

  it('opens saved details from the cover without mounting the LoRA', () => {
    renderCard(
      <LoraAssetCard
        asset={makeAsset({ id: 'detail', name: 'Saved style' })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Saved style' }))
    const detail = screen.getByRole('dialog', { name: 'Saved style' })
    expect(within(detail).getByText('Illustrious')).toBeInTheDocument()
    expect(within(detail).getByText('trigger')).toBeInTheDocument()
    expect(stackIds()).toBe('')
    expect(mockPush).not.toHaveBeenCalled()
    fireEvent.click(
      within(detail).getByRole('button', { name: 'LoraWorkbench:use' }),
    )
    expect(stackIds()).toBe('detail')
  })

  it('loads library samples only when saved details open and lets users preview them', async () => {
    mockMinePrompts.mockResolvedValue({
      success: true,
      data: {
        outfits: [],
        totalSampled: 1,
        previewImages: [{ imageUrl: 'https://example.com/sample.png' }],
      },
    })
    renderCard(
      <LoraAssetCard
        asset={makeAsset({
          id: 'samples',
          name: 'Saved samples',
          modelId: 2848936,
          modelVersionId: 3216916,
        })}
      />,
    )
    expect(mockMinePrompts).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Saved samples' }))
    const detail = screen.getByRole('dialog', { name: 'Saved samples' })
    await waitFor(() =>
      expect(
        within(detail).getAllByRole('button', {
          name: 'LoraWorkbench:sampleImageAlt',
        }),
      ).toHaveLength(2),
    )
    expect(mockMinePrompts).toHaveBeenCalledWith({
      modelId: 2848936,
      modelVersionId: 3216916,
      fileHash: undefined,
    })
    fireEvent.click(
      within(detail).getAllByRole('button', {
        name: 'LoraWorkbench:sampleImageAlt',
      })[1],
    )
    expect(
      within(detail).getByRole('img', { name: 'Saved samples' }),
    ).toHaveAttribute('src', 'https://example.com/sample.png')
    expect(stackIds()).toBe('')
  })

  it('去生成: mounts the LoRA and navigates to the generate section', () => {
    renderCard(<LoraAssetCard asset={makeAsset({ id: '2', name: 'Use Me' })} />)

    fireEvent.click(screen.getByRole('button', { name: 'LoraWorkbench:use' }))

    expect(stackIds()).toBe('2')
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('section=generate'),
    )
  })

  it('去生成: the bottom bar carries one undo that unmounts what was just mounted', () => {
    renderCard(
      <LoraAssetCard asset={makeAsset({ id: '5', name: 'Undo Me' })} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'LoraWorkbench:use' }))

    const options = mockToastSuccess.mock.calls[0]?.[1] as {
      action?: { label: string; onClick: () => void }
    }
    expect(options.action?.label).toBe('Feedback:undo')
    expect(stackIds()).toBe('5')
    act(() => options.action?.onClick())
    expect(stackIds()).toBe('')
  })

  it('shows the alreadyInUse state (no re-mount) when the LoRA is already in the stack', async () => {
    const asset = makeAsset({ id: '3', name: 'Already' })
    seedLoraStack([{ asset, scale: 1 }])

    renderCard(<LoraAssetCard asset={asset} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench:alreadyInUse' }),
    )
    expect(stackIds()).toBe('3')
  })

  it('favorites card: overflow menu surfaces open-source + unfavorite', () => {
    renderCard(
      <LoraAssetCard
        asset={makeAsset({ id: '4', name: 'Fav', source: 'imported' })}
        onUnfavorite={vi.fn().mockResolvedValue(true)}
      />,
    )

    openActions()
    expect(
      screen.getByRole('menuitem', { name: /LoraWorkbench:unfavorite/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', {
        name: /LoraWorkbench:assetActionOpenSource/,
      }),
    ).toBeInTheDocument()
  })

  it('own trained card: shows the private lock indicator and a delete menu item', () => {
    renderCard(
      <LoraAssetCard
        asset={makeAsset({
          id: '5',
          name: 'Trained',
          source: 'trained',
          isOwn: true,
          isPublic: false,
        })}
        showVisibilityToggle
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    )

    // Private-lock indicator preserved (§5 "自训卡保留私有锁标").
    expect(screen.getByText('LoraWorkbench:private')).toBeInTheDocument()

    openActions()
    expect(
      screen.getByRole('menuitem', {
        name: /LoraWorkbench:assetActionDelete/,
      }),
    ).toBeInTheDocument()
  })

  it('falls back to the type icon (no img) when the asset has no cover', () => {
    renderCard(
      <LoraAssetCard
        asset={makeAsset({ id: '6', name: 'No Cover', coverImageUrl: null })}
      />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
