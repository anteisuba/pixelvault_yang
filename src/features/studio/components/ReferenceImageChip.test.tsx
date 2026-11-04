import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { text } from '@/test/i18n-text'
import { fakeStudioServer, renderWithStudio } from '@/test/studio-harness'

import { ReferenceImageChip } from './ReferenceImageChip'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))
// 只假上传那一跳（api-client 边界）：真 `useImageUpload` 拿回 R2 地址后自己挂上。
const uploadImageFileAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/generation')>()),
  uploadImageFileAPI,
}))

const T = (key: string, values?: Record<string, string | number>) =>
  text(`ImageChip.${key}`, values)

/** 真工作台里挂 chip；按需先挂参考图、设上限，然后点开弹层。 */
function renderChip({ max = 30, references = [] as string[] } = {}) {
  const view = renderWithStudio(
    <Toolbar.Root>
      <ReferenceImageChip />
    </Toolbar.Root>,
  )
  act(() => {
    const { imageUpload } = view.studio.current
    imageUpload.setMaxImages(max)
    for (const url of references) imageUpload.addReferenceImage(url)
  })
  fireEvent.click(screen.getByRole('button', { name: T('label') }))
  return view.studio
}

beforeEach(() => {
  fakeStudioServer()
  uploadImageFileAPI.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('ReferenceImageChip', () => {
  it('renders the shared image picker while empty', () => {
    renderChip()
    expect(
      screen.getByRole('button', { name: new RegExp(T('dropHint')) }),
    ).toBeEnabled()
  })

  it('⭐ 上传走 R2 那条路，不再把整张图 base64 塞进生成请求', async () => {
    // ⚠ 这条 413 是真机撞出来的：base64 膨胀 ~33%，一张 3.4MB 的图就能把
    //   `POST /api/studio/generate` 的 body 顶到 Vercel Serverless 的 4.5MB
    //   硬上限，平台层直接拒、响应不是 JSON，前端只剩 `Failed with status 413`。
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: { generation: { url: 'https://cdn.test/ref.png' } },
    })
    const studio = renderChip()

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['x'], 'ref.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))

    await waitFor(() =>
      expect(studio.current.imageUpload.referenceImages).toEqual([
        'https://cdn.test/ref.png',
      ]),
    )
    expect(uploadImageFileAPI).toHaveBeenCalledWith(file)
  })

  it('disables every add path and explains why when the image limit is full', () => {
    renderChip({
      max: 2,
      references: ['https://cdn.test/a.png', 'https://cdn.test/b.png'],
    })

    const reason = T('limitReached', { max: 2 })
    expect(screen.getByText(reason)).toHaveAttribute('role', 'status')
    expect(
      screen.getByRole('button', { name: new RegExp(T('dropHint')) }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: new RegExp(T('openLibrary')) }),
    ).toBeDisabled()
  })

  it('「素材库」弹正中的挑选框（ui-spec ㉔），弹层先收起', async () => {
    const studio = renderChip()

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(T('openLibrary')) }),
    )

    expect(
      await screen.findByRole('dialog', { name: T('pickTitle') }),
    ).toBeInTheDocument()
    expect(studio.current.state.panels.refImage).toBe(false)
  })
})
