// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { resetPictureNumberCacheForTests } from '@/hooks/use-picture-number-references'

import {
  StudioOperatorMessageBody,
  StudioOperatorUserText,
} from './StudioOperatorMessageBody'

/**
 * 助手正文那一格的回归闸（2026-09-06 面板轮，第 4 / 5 件）。
 *
 * 钉四件事：
 *  ① 短回话原样出，⛔ 不长出一颗没用的「展开全文」；
 *  ② 长回话折成**首句** + 「展开全文」，点开是全文；
 *  ③ **还在流的时候不折** —— 字长到一半自己没了是最坏的那种；
 *  ④ `detail` 折成「为什么」，缺席时⛔ 一颗都不画；
 *  ⑤ **正文是 markdown**（v2 §13.2）：`**粗体**` 出 `<strong>`、有序列表出 `<ol>`，
 *     星号⛔ 不许出现在 `textContent` 里；折叠态的首句同样是**渲染后**的。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const lookupMentions = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  lookupAssistantMentionAssetsAPI: lookupMentions,
}))

const LONG =
  ['一', '二', '三', '四', '五', '六', '七', '八'].join('。\n') + '。'

function renderBody(
  entry: Partial<
    React.ComponentProps<typeof StudioOperatorMessageBody>['entry']
  > = {},
  rest: Partial<React.ComponentProps<typeof StudioOperatorMessageBody>> = {},
) {
  render(
    <StudioOperatorMessageBody
      entry={{ kind: 'message', id: 'm1', text: '改成夜景了。', ...entry }}
      {...rest}
    />,
  )
}

/** 两条资料 —— 角标认的就是它们的 `cite`。 */
const SOURCES = [
  {
    cite: 1,
    title: '知乎那篇',
    url: 'https://zhihu.com/a',
    publisher: 'zhihu.com',
    kind: 'text',
  },
  {
    cite: 2,
    title: 'pixiv 作品集',
    url: 'https://pixiv.net/b',
    publisher: 'pixiv.net',
    kind: 'text',
  },
]

describe('StudioOperatorMessageBody', () => {
  it('renders named thumbnails in markdown and resolves a bound historical alias', () => {
    renderBody(
      { text: '以**生成图3**的画风修正 reference image 4，保留生成图的布局。' },
      {
        references: [
          { name: '生成图', url: '/original.png', aliases: ['生成图'] },
          {
            name: '生成图3',
            url: '/style.png',
            aliases: ['生成图3', 'reference image 4'],
          },
        ],
      },
    )
    expect(screen.getAllByAltText('生成图3')).toHaveLength(2)
    expect(screen.getAllByAltText('生成图3')[0].getAttribute('src')).toMatch(
      /\/style\.png$/,
    )
    expect(screen.getByAltText('生成图').getAttribute('src')).toMatch(
      /\/original\.png$/,
    )
    expect(
      screen.getByTestId('operator-message-text').textContent,
    ).not.toContain('reference image 4')
  })

  it('短回话原样出，⛔ 没有多余的展开钮', () => {
    renderBody()
    expect(screen.queryByTestId('operator-message-expand')).toBeNull()
    expect(screen.getByTestId('operator-message-text').textContent).toBe(
      '改成夜景了。',
    )
  })

  it('⭐ 长回话折成首句，点开才是全文', () => {
    renderBody({ text: LONG })
    const folded = screen.getByTestId('operator-message-text')
    expect(folded.dataset.collapsed).toBe('true')
    expect(folded.textContent).toBe('一。')

    fireEvent.click(screen.getByTestId('operator-message-expand'))
    expect(screen.getByTestId('operator-message-text').textContent).toBe(LONG)
  })

  /**
   * `streaming` 两种形态：空正文是占位脉冲；有字是收尾轮还在写，先不折叠。
   */
  it('⭐ 空正文 + streaming = 占位行，⛔ 不是一行空白', () => {
    renderBody({ text: '', streaming: true })
    expect(screen.getByTestId('operator-message-pending')).toBeTruthy()
    expect(screen.queryByTestId('operator-message-text')).toBeNull()
  })

  it('⭐ 还在写的长正文不折叠，免得半截 markdown 被切成首句', () => {
    renderBody({ text: LONG, streaming: true })
    expect(
      screen.getByTestId('operator-message-text').dataset.collapsed,
    ).toBeUndefined()
    expect(screen.queryByTestId('operator-message-expand')).toBeNull()
  })

  it('⭐ `**粗体**` 出 <strong>，星号不落在屏幕上', () => {
    renderBody({ text: '把它改成**夜景**。' })
    const body = screen.getByTestId('operator-message-text')
    expect(body.querySelector('strong')?.textContent).toBe('夜景')
    expect(body.textContent).not.toContain('*')
  })

  it('⭐ 有序列表出 <ol>，⛔ 不是一行 `1. 2. 3.`', () => {
    renderBody({ text: '两步走：\n\n1. 先定光源\n2. 再压背景\n' })
    const body = screen.getByTestId('operator-message-text')
    const items = body.querySelectorAll('ol > li')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('先定光源')
  })

  it('⭐ 折叠态的首句也是渲染后的 —— 星号不许漏出来', () => {
    const text =
      '先把它改成**夜景**。\n二。\n三。\n四。\n五。\n六。\n七。\n八。'
    renderBody({ text })
    const folded = screen.getByTestId('operator-message-text')
    expect(folded.dataset.collapsed).toBe('true')
    expect(folded.querySelector('strong')?.textContent).toBe('夜景')
    expect(folded.textContent).toBe('先把它改成夜景。')
  })

  it('⭐ 句尾 `[n]` 渲染成角标，⛔ 方括号不落在屏幕上（56b 切片 1）', () => {
    renderBody(
      { text: '核心是**霓虹反光**[1]。路面积水做镜面反射[2]。' },
      { sources: SOURCES },
    )
    const marks = screen.getAllByTestId('operator-message-citation')
    expect(marks.map((mark) => mark.dataset.cite)).toEqual(['1', '2'])
    expect(
      screen.getByTestId('operator-message-text').textContent,
    ).not.toContain('[1]')
  })

  it('⭐ 点角标高亮对应的来源卡；再点一次熄灭', () => {
    renderBody({ text: '一句话[2]。' }, { sources: SOURCES })
    const mark = screen.getByTestId('operator-message-citation')
    fireEvent.click(mark)
    const active = screen
      .getAllByTestId('operator-answer-source-card')
      .filter((card) => card.dataset.active === 'true')
    expect(active[0]?.dataset.cite).toBe('2')
    fireEvent.click(screen.getByTestId('operator-message-citation'))
    expect(
      screen
        .getAllByTestId('operator-answer-source-card')
        .filter((card) => card.dataset.active === 'true'),
    ).toHaveLength(0)
  })

  it('⛔ 没有这条资料的号原样留着那段字（模型编号时不许静默吞掉）', () => {
    renderBody({ text: '一句话[9]。' }, { sources: SOURCES })
    expect(screen.queryByTestId('operator-message-citation')).toBeNull()
    expect(screen.getByTestId('operator-message-text').textContent).toContain(
      '[9]',
    )
  })

  it('⛔ 还在流的时候不摆来源卡 —— 正文长高时它会一直往下跳', () => {
    renderBody({ text: '写到一半[1]', streaming: true }, { sources: SOURCES })
    expect(screen.queryByTestId('operator-answer-sources')).toBeNull()
  })

  it('⭐ 还在写时末尾有一根光标；定稿与历史回放都没有（56b 切片 3）', () => {
    renderBody({ text: '写到一半', streaming: true })
    expect(screen.getByTestId('operator-message-caret')).toBeTruthy()

    screen.getByTestId('operator-message-text').remove()
    renderBody({ text: '写完了。' })
    expect(screen.queryByTestId('operator-message-caret')).toBeNull()
  })

  it('⭐ §9.1：还没有字时是「正在想…」那一行（ThinkingRow），画布接力写「落地」', () => {
    renderBody({ text: '', streaming: true })
    expect(screen.getByTestId('operator-message-pending').textContent).toBe(
      'thinking',
    )
    screen.getByTestId('operator-message-pending').remove()
    renderBody({ text: '', streaming: true, pendingPhase: 'landing' })
    expect(screen.getByTestId('operator-message-pending').dataset.phase).toBe(
      'landing',
    )
  })

  it('⭐ §9.1：第一个字到了，正文上方是「想了 N 秒」；没想过一秒 / 历史条目不画', () => {
    renderBody({ text: '好了。', thoughtMs: 8_200 })
    expect(screen.getByTestId('operator-message-thought').textContent).toBe(
      'thought',
    )
    screen.getByTestId('operator-message-thought').remove()
    renderBody({ text: '好了。', thoughtMs: 300 })
    renderBody({ text: '好了。' })
    expect(screen.queryByTestId('operator-message-thought')).toBeNull()
  })

  it('「用 Grok 搜 X」：给了才画、点下去回调；流着的时候不画', () => {
    const onSearchXWithGrok = vi.fn()
    renderBody({}, { onSearchXWithGrok })
    const button = screen.getByTestId('operator-answer-search-x-grok')
    // 没有来源卡也在：没搜 X 的那一问可能一条来源都没有。
    expect(button.textContent).toBe('answer.searchXWithGrok')
    fireEvent.click(button)
    expect(onSearchXWithGrok).toHaveBeenCalledTimes(1)
  })

  it('「用 Grok 搜 X」还在流时不画', () => {
    renderBody({ streaming: true }, { onSearchXWithGrok: vi.fn() })
    expect(screen.queryByTestId('operator-answer-search-x-grok')).toBeNull()
  })

  it('reduced motion 下仍逐字出现（光标静止），⛔ 不扣住整段', () => {
    renderBody({ text: '写到一半', streaming: true })
    expect(screen.getByTestId('operator-message-text').textContent).toContain(
      '写到一半',
    )
  })
})

/** 2026-09-24 真机：用户气泡里是「@图1」原文，缩略图边上写着 reference image 1。 */
describe('StudioOperatorUserText 引用', () => {
  it('「图1」与 @图1：图排在气泡上方（一张，P4 第 3 项），字里只留名字、记号不留', () => {
    render(
      <StudioOperatorUserText
        text="把「图1」换成校服，再参考 @图1 的发型"
        attachments={[
          {
            id: 'ref-1',
            kind: 'image',
            label: '图1',
            url: 'https://cdn.test/1.png',
            thumbnailUrl: 'https://cdn.test/1.png',
          },
        ]}
      />,
    )
    const bubble = screen.getByTestId('operator-user-text')
    expect(bubble.textContent).not.toMatch(/[「」@]/)
    expect(bubble.textContent).toContain('图1')
    expect(bubble.querySelectorAll('img').length).toBe(0)
    const thumbs = screen.getByTestId('operator-user-thumbs')
    expect(thumbs.querySelectorAll('img').length).toBe(1)
    expect(thumbs.querySelector('button')?.getAttribute('title')).toBe('图1')
  })

  it('@文本节点名 画成文档胶囊（owner 2026-10-08），不是名字的字照常写', () => {
    render(
      <StudioOperatorUserText
        text="按 @剧本 改，剧本以外别动"
        attachments={[]}
        textNodeNames={['剧本', '分镜']}
      />,
    )
    const bubble = screen.getByTestId('operator-user-text')
    expect(bubble.textContent).not.toContain('@')
    expect(bubble.querySelectorAll('[title="剧本"]').length).toBe(1)
    expect(bubble.querySelector('[title="分镜"]')).toBeNull()
    expect(bubble.querySelectorAll('svg').length).toBe(1)
  })
})

describe('StudioOperatorMessageBody — 正文里的 `图_N`', () => {
  /** 10-27 owner 真机：她聊天口吻的回复（`chat`）里写「图_1215」只剩字，普通正文却有图。 */
  it.each([
    ['聊天气泡', true],
    ['普通正文', false],
  ])('%s：作品编号换成缩略图', async (_label, chat) => {
    resetPictureNumberCacheForTests()
    lookupMentions.mockResolvedValue({
      success: true,
      data: [{ seq: 1215, thumb: 'https://cdn.example/1215.webp' }],
    })
    renderBody({
      text: '你库里这张「图_1215」早就占全了。',
      ...(chat ? { chat: true } : {}),
    })
    await waitFor(() =>
      expect(screen.getByAltText('图_1215')).toBeInTheDocument(),
    )
    expect(lookupMentions).toHaveBeenCalledWith([], [1215])
    // 书名号随名字一起吞掉，⛔ 不剩一对空的「」。
    expect(document.body.textContent).not.toContain('「')
  })
})
