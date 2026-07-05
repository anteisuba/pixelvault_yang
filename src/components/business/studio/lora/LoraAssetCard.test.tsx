import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LoraAssetRecord } from '@/types'

import { LoraAssetCard } from './LoraAssetCard'

// B8 / P2-3: the my-page asset card now shares the LoraCoverTile base with
// the public library card (cover-first tile, black-nacre type badge), while
// keeping its own chrome — the "去生成" main button, the overflow actions
// menu, and the private-lock indicator. These tests lock in both the shared
// base and the preserved my-page behaviours.

const mockPush = vi.hoisted(() => vi.fn())
const mockStackPush = vi.hoisted(() => vi.fn())
let mockStackItems: { asset: LoraAssetRecord; scale?: number }[] = []

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

vi.mock('@/hooks/use-active-lora-stack', () => ({
  useActiveLoraStack: () => ({
    get items() {
      return mockStackItems
    },
    push: mockStackPush,
    setScale: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}))

// Radix DropdownMenu doesn't open on a synthetic click in jsdom; follow the
// repo's established pattern (StudioPromptArea.test) and render the menu
// inline so its conditional items are queryable without driving the portal.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { children: ReactNode }) => (
    <div role="menuitem">{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
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

describe('LoraAssetCard — B8 shared base + preserved my-page chrome', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockStackPush.mockReset()
    mockStackItems = []
  })

  it('renders the type badge on the shared black-nacre cover tile', () => {
    render(
      <LoraAssetCard
        asset={makeAsset({ id: '1', name: 'My Char', type: 'subject' })}
      />,
    )

    const badge = screen.getByText('LoraWorkbench:typeSubject')
    expect(badge.className).toContain('bg-black/55')
    expect(screen.getByRole('img', { name: 'My Char' })).toBeInTheDocument()
  })

  it('去生成: mounts the LoRA and navigates to the generate section', () => {
    render(<LoraAssetCard asset={makeAsset({ id: '2', name: 'Use Me' })} />)

    fireEvent.click(screen.getByRole('button', { name: 'LoraWorkbench:use' }))

    expect(mockStackPush).toHaveBeenCalledTimes(1)
    expect(mockStackPush.mock.calls[0]?.[0]).toMatchObject({ id: '2' })
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('section=generate'),
    )
  })

  it('shows the alreadyInUse state (no re-mount) when the LoRA is already in the stack', () => {
    const asset = makeAsset({ id: '3', name: 'Already' })
    mockStackItems = [{ asset, scale: 1 }]

    render(<LoraAssetCard asset={asset} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:alreadyInUse' }),
    )
    expect(mockStackPush).not.toHaveBeenCalled()
  })

  it('favorites card: overflow menu surfaces open-source + unfavorite', () => {
    render(
      <LoraAssetCard
        asset={makeAsset({ id: '4', name: 'Fav', source: 'imported' })}
        onUnfavorite={vi.fn().mockResolvedValue(true)}
      />,
    )

    // Trigger present (menu is wired) + its conditional items render.
    expect(
      screen.getByRole('button', { name: 'LoraWorkbench:assetActionsLabel' }),
    ).toBeInTheDocument()
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
    render(
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

    expect(
      screen.getByRole('menuitem', {
        name: /LoraWorkbench:assetActionDelete/,
      }),
    ).toBeInTheDocument()
  })

  it('falls back to the type icon (no img) when the asset has no cover', () => {
    render(
      <LoraAssetCard
        asset={makeAsset({ id: '6', name: 'No Cover', coverImageUrl: null })}
      />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
