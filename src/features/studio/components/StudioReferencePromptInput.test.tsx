import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { serializeEditor } from '@/components/ui/mention-input'
import { normalizeReferenceMentions } from '@/lib/studio-reference-mentions'
import { text } from '@/test/i18n-text'
import { fakeStudioServer, renderWithStudio } from '@/test/studio-harness'
import { StudioReferencePromptInput } from './StudioReferencePromptInput'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))
// 只假上传那一跳（api-client 边界）：真 `useImageUpload` 拿回 URL 后自己加进参考图。
const uploadImageFileAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/generation')>()),
  uploadImageFileAPI,
}))

const URLS = [
  'https://example.com/one.png',
  'https://example.com/two.png',
  'https://example.com/disabled.png',
]
const imageLabel = (index: number) =>
  text('StudioPromptArea.referenceMention.image', { index })

const submit = vi.fn()

/** 真工作台里挂输入框，再用真 `imageUpload` 挂参考图：上限 2，第三张超限。 */
function renderInput(
  { urls = URLS, prompt = '' }: { urls?: string[]; prompt?: string } = {},
  wrap: (ui: React.ReactElement) => React.ReactElement = (ui) => ui,
) {
  const view = renderWithStudio(
    wrap(<StudioReferencePromptInput onSubmit={submit} />),
  )
  act(() => {
    const upload = view.studio.current.imageUpload
    upload.setMaxImages(2)
    for (const url of urls) upload.addReferenceImage(url)
    if (prompt)
      view.studio.current.dispatch({ type: 'SET_PROMPT', payload: prompt })
  })
  return view
}

function typePrompt(value: string) {
  const editor = screen.getByRole('textbox')
  editor.focus()
  editor.textContent = value
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  if (editor.firstChild) range.setStart(editor.firstChild, value.length)
  range.collapse(true)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  fireEvent.input(editor)
  return editor
}

beforeEach(() => {
  submit.mockClear()
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

describe('StudioReferencePromptInput', () => {
  it('renders assistant-written references as matching inline thumbnails', () => {
    renderInput({
      prompt: normalizeReferenceMentions('Image1 服装，参考图2 画风'),
    })
    const editor = screen.getByRole('textbox')
    expect(serializeEditor(editor)).toBe('@Image1 服装，@Image2 画风')
    for (const [index, url] of URLS.slice(0, 2).entries()) {
      expect(
        editor.querySelector(`[data-mention="@Image${index + 1}"] img`),
      ).toHaveAttribute('src', url)
    }
  })

  it('lists only enabled attached images with thumbnails and inserts the selected atomic reference', () => {
    renderInput()
    const editor = typePrompt('采用@')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(
      screen.getByRole('option', { name: imageLabel(2) }).querySelector('img'),
    ).toHaveAttribute('src', URLS[1])
    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(submit).not.toHaveBeenCalled()
    expect(serializeEditor(editor)).toBe('采用@Image2 ')
    expect(editor.querySelector('[data-mention="@Image2"]')).toHaveAttribute(
      'contenteditable',
      'false',
    )
    expect(editor.querySelector('img')).toHaveAttribute('src', URLS[1])
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('portals the reference picker to the body, not the surrounding box', () => {
    /**
     * ⚠ 这条从前反过来断言「浮层留在外框里」（64b68e3a）。12ecc51c 把浮层改成
     * **只 portal 到 `document.body`**：它是 `position: fixed`，而 fixed 只在没有
     * transform / backdrop-filter 祖先时才以视口为参照 —— 留在外框里的表现是浮层
     * 被裁掉或飞出视口（见 `mention-input.tsx` 那段头注）。
     * ⛔ 别改回 `toContainElement`：那是把已经修掉的裁切 bug 重新钉死。
     */
    renderInput({}, (ui) => <div role="dialog">{ui}</div>)
    typePrompt('@')
    const listbox = screen.getByRole('listbox')
    expect(listbox.parentElement).toBe(document.body)
    expect(screen.getByRole('dialog')).not.toContainElement(listbox)
  })

  it('supports pointer selection without replacing surrounding text', () => {
    renderInput()
    const editor = typePrompt('角色@')
    fireEvent.mouseDown(screen.getByRole('option', { name: imageLabel(1) }))
    fireEvent.click(screen.getByRole('option', { name: imageLabel(1) }))
    expect(serializeEditor(editor)).toBe('角色@Image1 ')
  })

  it('does not open for an email and Escape dismisses without submitting', () => {
    renderInput()
    typePrompt('user@example')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    const editor = typePrompt('@')
    fireEvent.keyDown(editor, { key: 'Escape' })
    fireEvent.keyUp(editor, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
  })

  it('does not select or submit while committing a Chinese composition', () => {
    renderInput()
    const editor = typePrompt('@')
    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true })
    fireEvent.compositionEnd(editor)
    expect(serializeEditor(editor)).toBe('@')
    expect(submit).not.toHaveBeenCalled()
  })

  it('keeps the upload flow for pasted images', async () => {
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: { generation: { url: 'https://cdn.test/pasted.png' } },
    })
    const { studio } = renderInput({ urls: [] })
    const file = new File(['image'], 'reference.png', { type: 'image/png' })
    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: {
        files: [file],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
    })
    // 真上传流程把传回的地址加成了一张参考图。
    await waitFor(() =>
      expect(
        studio.current.imageUpload.referenceEntries.map((entry) => entry.url),
      ).toEqual(['https://cdn.test/pasted.png']),
    )
  })

  it('shows an empty state and does not submit on picker Enter without references', () => {
    renderInput({ urls: [] })
    const editor = typePrompt('@')
    expect(screen.getByRole('listbox')).toHaveTextContent(
      text('StudioPromptArea.referenceMention.empty'),
    )
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(submit).not.toHaveBeenCalled()
  })

  it('refreshes a referenced thumbnail after in-place image editing', () => {
    const { studio } = renderInput({ urls: [URLS[0]] })
    const editor = typePrompt('@')
    fireEvent.keyDown(editor, { key: 'Enter' })
    // 就地改图：真 `replaceReferenceImage` 把第 1 张换成改好的那张。
    act(() => {
      studio.current.imageUpload.replaceReferenceImage(
        0,
        'https://example.com/edited.png',
      )
    })
    expect(editor.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/edited.png',
    )
    expect(serializeEditor(editor)).toBe('@Image1 ')
  })

  it('pastes reference tokens as thumbnail chips and copies their portable image indices', () => {
    renderInput()
    const editor = typePrompt('使用')
    fireEvent.paste(editor, {
      clipboardData: { files: [], getData: () => '@Image2' },
    })
    expect(
      editor.querySelector('[data-mention="@Image2"] img'),
    ).toHaveAttribute('src', URLS[1])
    const range = document.createRange()
    range.selectNodeContents(editor)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    const setData = vi.fn()
    fireEvent.copy(editor, { clipboardData: { setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', '使用@Image2')
  })
})
