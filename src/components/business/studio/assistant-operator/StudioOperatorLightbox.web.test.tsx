import type { HTMLAttributeReferrerPolicy } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  StudioOperatorLightbox,
  closeOperatorLightbox,
  openOperatorLightbox,
} from './StudioOperatorLightbox'

/**
 * 灯箱看**第三方网图**（附录 I §3.4）：⛔ 不带我们的 Referer，原图取不到退到缩略图，
 * 都取不到画占位（⛔ 破图标）；自家的图照原样取、不加这一层。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    referrerPolicy,
    onError,
  }: {
    alt: string
    src: string
    referrerPolicy?: HTMLAttributeReferrerPolicy
    onError?: () => void
  }) => (
    // eslint-disable-next-line @next/next/no-img-element -- 测试替身
    <img
      alt={alt}
      src={src}
      referrerPolicy={referrerPolicy}
      onError={onError}
    />
  ),
}))

afterEach(() => {
  act(() => closeOperatorLightbox())
  vi.unstubAllEnvs()
})

describe('StudioOperatorLightbox', () => {
  it('⭐ 挂在 pointer-events-none 的 rail 里也关得掉：portal 到 body，点遮罩 / Esc 都关', () => {
    render(
      <div data-testid="rail" className="pointer-events-none">
        <StudioOperatorLightbox />
      </div>,
    )
    act(() => openOperatorLightbox('https://cdn.test/own.png', '生成图'))
    const dialog = screen.getByRole('dialog')
    expect(screen.getByTestId('rail').contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => openOperatorLightbox('https://cdn.test/own.png', '生成图'))
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('自家的图照原样取，⛔ 不改 Referer', () => {
    render(<StudioOperatorLightbox />)
    act(() => openOperatorLightbox('https://cdn.test/own.png', '自家'))
    const image = screen.getByAltText('自家')
    expect(image.getAttribute('src')).toBe('https://cdn.test/own.png')
    expect(image.hasAttribute('referrerpolicy')).toBe(false)
  })

  it('⭐ 第三方网图：不带 Referer → 原图取不到退缩略图 → 都取不到画占位', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', '')
    render(<StudioOperatorLightbox />)
    act(() =>
      openOperatorLightbox('https://site.test/full.jpg', '网图', {
        thirdParty: true,
        fallbackUrl: 'https://thumbs.test/t.jpg',
      }),
    )
    const full = screen.getByAltText('网图')
    expect(full.getAttribute('src')).toBe('https://site.test/full.jpg')
    expect(full.getAttribute('referrerpolicy')).toBe('no-referrer')

    fireEvent.error(full)
    expect(screen.getByAltText('网图').getAttribute('src')).toBe(
      'https://thumbs.test/t.jpg',
    )

    fireEvent.error(screen.getByAltText('网图'))
    expect(screen.queryByAltText('网图')).toBeNull()
    expect(
      screen.getByTestId('operator-lightbox-unavailable').textContent,
    ).toBe('web.previewUnavailable')
  })
})
