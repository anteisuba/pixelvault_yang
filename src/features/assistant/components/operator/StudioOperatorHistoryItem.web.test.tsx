// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { resetPictureNumberCacheForTests } from '@/hooks/use-picture-number-references'

import { StudioOperatorHistoryItem } from './StudioOperatorHistoryItem'

/**
 * 只读历史条目的回归闸（2026-09-07 真机）。
 *
 * ⭐ 钉的是**长正文在历史里也折**：真机上历史里一条 8 行的正文整条铺开，既没有
 * 「展开全文」也没有那颗测试锚 —— 根因是历史那一支走的是另一段裸 `<p>`，折叠
 * 逻辑只写在实时线程那一侧。两边现在共用 `StudioOperatorCollapsibleText`。
 */

vi.mock('next-intl', () => ({
  useFormatter: () => ({ list: (items: string[]) => items.join('、') }),
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return Object.assign(t, { has: () => true })
  },
}))

const lookupMentions = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  lookupAssistantMentionAssetsAPI: lookupMentions,
}))

const LONG =
  ['一', '二', '三', '四', '五', '六', '七', '八'].join('。\n') + '。'

describe('StudioOperatorHistoryItem', () => {
  it('念给你听的那段载回来也洗掉念法记号（11-12 手机：历史里露出「[soft tone]」）', () => {
    render(
      <StudioOperatorHistoryItem
        entry={{
          kind: 'message',
          id: 'h4',
          text: '[soft tone] 在呢。',
          spoken: true,
        }}
      />,
    )
    expect(screen.queryByText(/soft tone/)).toBeNull()
    expect(screen.getByText(/在呢/)).toBeTruthy()
  })

  it('她在聊天的那段（②c-2）：一行一个气泡，整段直接摆出来、⛔ 不折', () => {
    render(
      <StudioOperatorHistoryItem
        entry={{ kind: 'message', id: 'h2', text: LONG, chat: true }}
      />,
    )
    expect(screen.getAllByTestId('operator-chat-bubble')).toHaveLength(8)
    expect(screen.queryByTestId('operator-chat-typing')).toBeNull()
    expect(screen.queryByTestId('operator-message-expand')).toBeNull()
  })

  it('她卡上的开场白载回来：整块一段叙事、每段动作都在（11-18 真机刷新后少两行动作），⛔ 拆气泡', () => {
    const opening = [
      '*阶梯教室里的灯一排排暗下去，只剩讲台那一盏，投影仪的风扇还在嗡嗡地响，她就坐在你旁边那排的空位上，托着下巴看你，像是已经等了很久很久。*',
      '*耳边的声音压得很低，带着笑，凑得近到有点痒。你下意识抖了一下，旁边的人连头都没抬。*',
      '「嘘——别出声。」',
      '*她把声音放得更轻，凑过来：*',
      '「下课等我。」',
    ].join('\n')
    render(
      <StudioOperatorHistoryItem
        entry={{
          kind: 'message',
          id: 'g1',
          text: opening,
          chat: true,
          greeting: true,
        }}
      />,
    )
    expect(screen.getAllByTestId('operator-greeting-text')).toHaveLength(1)
    expect(screen.queryByTestId('operator-chat-bubble')).toBeNull()
    expect(screen.getAllByTestId('operator-greeting-paragraph')).toHaveLength(5)
    const actions = screen.getAllByTestId('operator-greeting-action')
    expect(actions.map((node) => node.textContent)).toEqual([
      '阶梯教室里的灯一排排暗下去，只剩讲台那一盏，投影仪的风扇还在嗡嗡地响，她就坐在你旁边那排的空位上，托着下巴看你，像是已经等了很久很久。',
      '耳边的声音压得很低，带着笑，凑得近到有点痒。你下意识抖了一下，旁边的人连头都没抬。',
      '她把声音放得更轻，凑过来：',
    ])
    for (const node of actions)
      expect(node).toHaveClass('text-muted-foreground')
  })

  it('聊天气泡里的「图_N」换成缩略图（10-27 owner 真机：历史回放里只剩字）', async () => {
    resetPictureNumberCacheForTests()
    lookupMentions.mockResolvedValue({
      success: true,
      data: [{ seq: 1215, thumb: 'https://cdn.example/1215.webp' }],
    })
    render(
      <StudioOperatorHistoryItem
        entry={{
          kind: 'message',
          id: 'h3',
          text: '下一步将「图_1215」添加为参考图。',
          chat: true,
        }}
      />,
    )
    await waitFor(() =>
      expect(screen.getByAltText('图_1215')).toBeInTheDocument(),
    )
  })

  it('⭐ 历史里的长正文也折成首句 + 「展开全文」，点开才是全文', () => {
    render(
      <StudioOperatorHistoryItem
        entry={{ kind: 'message', id: 'h1', text: LONG }}
      />,
    )
    const folded = screen.getByTestId('operator-message-text')
    expect(folded.dataset.collapsed).toBe('true')
    expect(folded.textContent).toBe('一。')

    fireEvent.click(screen.getByTestId('operator-message-expand'))
    expect(screen.getByTestId('operator-message-text').textContent).toBe(LONG)
  })

  it('短正文原样出，⛔ 不长出一颗没用的展开钮', () => {
    render(
      <StudioOperatorHistoryItem
        entry={{ kind: 'message', id: 'h2', text: '改成夜景了。' }}
      />,
    )
    expect(screen.queryByTestId('operator-message-expand')).toBeNull()
    expect(screen.getByTestId('operator-message-text').textContent).toBe(
      '改成夜景了。',
    )
  })

  it('跨页面撤销（11-17）：本机还留着原文才给撤销钮，点了交回调用方；撤过的不给', () => {
    const step = {
      kind: 'step' as const,
      id: 'run-1:s1',
      tool: 'set_prompt',
      title: '改写提示词',
      status: 'done' as const,
      undone: false,
    }
    const onRestoredUndo = vi.fn()
    const { rerender } = render(<StudioOperatorHistoryItem entry={step} />)
    // 没给 = 历史照旧只读（头注那条「历史里写不出做错事的撤销钮」）。
    expect(screen.queryByTestId('operator-history-restored-undo')).toBeNull()
    rerender(
      <StudioOperatorHistoryItem
        entry={step}
        onRestoredUndo={onRestoredUndo}
      />,
    )
    fireEvent.click(screen.getByTestId('operator-history-restored-undo'))
    expect(onRestoredUndo).toHaveBeenCalledTimes(1)
    rerender(
      <StudioOperatorHistoryItem
        entry={{ ...step, undone: true }}
        onRestoredUndo={onRestoredUndo}
      />,
    )
    expect(screen.queryByTestId('operator-history-restored-undo')).toBeNull()
  })
})
