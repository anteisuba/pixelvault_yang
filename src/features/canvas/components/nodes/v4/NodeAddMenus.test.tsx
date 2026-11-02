import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    key === 'addCanvasAttach' ? `挂上 ${values?.name}` : key,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { AudioAddMenuItems } from './audio/AudioNodeMenus'
import { ImageAddMenuItems } from './image/ImageNodeMenus'
import { VideoAddMenuItems } from './video/VideoNodeMenus'

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>+</DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

async function openMenu() {
  fireEvent.pointerDown(
    document.querySelector('[data-slot="dropdown-menu-trigger"]')!,
    {
      button: 0,
      pointerType: 'mouse',
    },
  )
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="dropdown-menu-content"]'),
    ).toBeTruthy(),
  )
}

describe('canvas node add menus', () => {
  it('先搜再画：只对支持的型号给这一行，拨动不收菜单', async () => {
    const onChange = vi.fn()
    render(
      <Menu>
        <ImageAddMenuItems
          onUpload={vi.fn()}
          onLibrary={vi.fn()}
          searchGrounding={{ checked: false, onChange }}
        />
      </Menu>,
    )
    await openMenu()

    const row = document.querySelector('[data-image-add="search-grounding"]')!
    expect(row.getAttribute('role')).toBe('menuitemcheckbox')
    expect(row.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(row)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(
      document.querySelector('[data-slot="dropdown-menu-content"]'),
    ).toBeTruthy()
  })

  it('没给开关（型号不支持）就没有这一行', async () => {
    render(
      <Menu>
        <ImageAddMenuItems onUpload={vi.fn()} onLibrary={vi.fn()} />
      </Menu>,
    )
    await openMenu()
    expect(
      document.querySelector('[data-image-add="search-grounding"]'),
    ).toBeNull()
  })

  it('shows image candidates as thumbnails; blocked candidates explain why, attached ones only close', async () => {
    const onPickCanvas = vi.fn()
    render(
      <Menu>
        <ImageAddMenuItems
          onUpload={vi.fn()}
          onLibrary={vi.fn()}
          onPickCanvas={onPickCanvas}
          canvasCandidates={[
            { id: 'fresh', name: '新图', thumbnailUrl: '/fresh.png' },
            { id: 'attached', name: '已挂图', attached: true },
            { id: 'blocked', name: '满额图', blockedReason: '参考图已满' },
          ]}
        />
      </Menu>,
    )
    await openMenu()

    expect(document.querySelector('[data-image-add="canvas"]')).toBeNull()
    expect(
      document.querySelector('[data-image-add-canvas="fresh"] img'),
    ).toBeTruthy()
    expect(document.querySelector('[data-attached="true"]')).toBeTruthy()
    const blocked = document.querySelector('[data-image-add-canvas="blocked"]')!
    expect(blocked.getAttribute('aria-disabled')).toBe('true')
    expect(blocked.getAttribute('title')).toBe('参考图已满')
    fireEvent.click(blocked)
    expect(onPickCanvas).not.toHaveBeenCalled()
    expect(
      document.querySelector('[data-slot="dropdown-menu-content"]'),
    ).toBeTruthy()

    fireEvent.click(document.querySelector('[data-image-add-canvas="fresh"]')!)
    expect(onPickCanvas).toHaveBeenCalledExactlyOnceWith('fresh')
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="dropdown-menu-content"]'),
      ).toBeNull(),
    )

    await openMenu()
    fireEvent.click(
      document.querySelector('[data-image-add-canvas="attached"]')!,
    )
    expect(onPickCanvas).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="dropdown-menu-content"]'),
      ).toBeNull(),
    )
  })

  it('routes a video tile through its media group without a submenu', async () => {
    const onPickSlotSource = vi.fn()
    render(
      <Menu>
        <VideoAddMenuItems
          canvasCandidates={[
            {
              id: 'image-1',
              name: '首帧',
              group: 'image',
              thumbnailUrl: '/frame.png',
            },
            { id: 'voice-1', name: '配音', group: 'voice' },
            {
              id: 'video-blocked',
              name: '超出上限',
              group: 'video',
              blockedReason: '参考视频已满',
            },
          ]}
          onPickSlotSource={onPickSlotSource}
          onUpload={vi.fn()}
          onLibrary={vi.fn()}
        />
      </Menu>,
    )
    await openMenu()

    expect(document.querySelector('[data-video-add-group]')).toBeNull()
    expect(
      document.querySelector('[data-video-slot-candidate="image-1"] img'),
    ).toBeTruthy()
    const blocked = document.querySelector(
      '[data-video-slot-candidate="video-blocked"]',
    )!
    expect(blocked.getAttribute('title')).toBe('参考视频已满')
    fireEvent.click(blocked)
    expect(onPickSlotSource).not.toHaveBeenCalled()
    fireEvent.click(
      document.querySelector('[data-video-slot-candidate="voice-1"]')!,
    )
    expect(onPickSlotSource).toHaveBeenCalledExactlyOnceWith('voice', 'voice-1')
  })

  it('keeps the three audio actions and shows the canvas section without a fake tile', async () => {
    const onVoiceLibrary = vi.fn()
    render(
      <Menu>
        <AudioAddMenuItems
          onUpload={vi.fn()}
          onAssetLibrary={vi.fn()}
          onVoiceLibrary={onVoiceLibrary}
        />
      </Menu>,
    )
    await openMenu()

    expect(
      Array.from(document.querySelectorAll('[data-audio-add]')).map((item) =>
        item.getAttribute('data-audio-add'),
      ),
    ).toEqual(['upload', 'library', 'voices'])
    expect(document.querySelector('[data-audio-add-empty]')?.textContent).toBe(
      'addCanvasEmpty',
    )
    expect(document.querySelector('[data-video-slot-candidate]')).toBeNull()
    fireEvent.click(document.querySelector('[data-audio-add="voices"]')!)
    expect(onVoiceLibrary).toHaveBeenCalledOnce()
  })

  it('shows canvas audio as unavailable with a reason and never attaches it', async () => {
    render(
      <Menu>
        <AudioAddMenuItems
          onUpload={vi.fn()}
          onAssetLibrary={vi.fn()}
          onVoiceLibrary={vi.fn()}
          canvasCandidates={[
            { id: 'ready', name: '声音 A', audioUrl: '/voice.mp3' },
            { id: 'empty', name: '空声音' },
          ]}
        />
      </Menu>,
    )
    await openMenu()

    const candidate = document.querySelector('[data-audio-add-canvas="ready"]')!
    expect(candidate.getAttribute('aria-disabled')).toBe('true')
    expect(candidate.getAttribute('title')).toBe('add.referenceUnavailable')
    expect(document.querySelector('[data-audio-add-canvas="empty"]')).toBeNull()
    fireEvent.click(candidate)
    expect(
      document.querySelector('[data-slot="dropdown-menu-content"]'),
    ).toBeTruthy()
  })
})
