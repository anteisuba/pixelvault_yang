import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" src={String(props.src)} />
  ),
}))

import { NodePromptBar } from './NodePromptBar'
import {
  matchMentionOptions,
  readMentionQuery,
  type MentionPickerOption,
} from './MentionPicker'

const OPTIONS: readonly MentionPickerOption[] = [
  { id: 'rail:1', name: '图1', groupLabel: '参考轨' },
  { id: 'rail:2', name: '图2', groupLabel: '参考轨' },
  { id: 'n_1', name: '莫宁', groupLabel: '角色' },
]

/** 受控壳：提示词栏的 `value` 归调用方，`@` 的落字要走这条真实回路。 */
function Harness({ initial = '' }: { readonly initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <NodePromptBar
      value={value}
      onValueChange={setValue}
      onSubmit={() => {}}
      placeholder="写点什么"
      ariaLabel="提示词"
      mentionOptions={OPTIONS}
    />
  )
}

function typeInto(text: string) {
  const input = screen.getByLabelText('提示词') as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: text } })
  return input
}

describe('readMentionQuery', () => {
  it('光标停在 `@` 之后就是一次查询，空查询也算', () => {
    expect(readMentionQuery('镜头 @', 4)).toEqual({ start: 3, query: '' })
    expect(readMentionQuery('镜头 @图', 5)).toEqual({ start: 3, query: '图' })
  })

  it('`@` 前面是普通字符（邮箱）不弹；中间遇到空白就断', () => {
    expect(readMentionQuery('a@b', 3)).toBeNull()
    expect(readMentionQuery('name123@图', 9)).toBeNull()
    expect(readMentionQuery('@图 的运镜', 5)).toBeNull()
    expect(readMentionQuery('参考图11@', 6)).toEqual({ start: 5, query: '' })
    expect(readMentionQuery('角色@图', 4)).toEqual({ start: 2, query: '图' })
  })
})

describe('matchMentionOptions', () => {
  it('空查询全给，非空按名字包含过滤', () => {
    expect(matchMentionOptions(OPTIONS, '')).toHaveLength(3)
    expect(matchMentionOptions(OPTIONS, '图').map((item) => item.name)).toEqual(
      ['图1', '图2'],
    )
  })

  // owner 2026-09-29：画布上图和视频交错，按原样分组断成「图片 · 视频 · 图片」。
  it('同一组收在一起：组按首次出现，组内保持原顺序', () => {
    const mixed: MentionPickerOption[] = [
      { id: 'a', name: '生成图', groupLabel: '图片' },
      { id: 'b', name: '里希', groupLabel: '视频' },
      { id: 'c', name: '生成图2', groupLabel: '图片' },
      { id: 'd', name: '参考片段', groupLabel: '视频' },
    ]
    expect(matchMentionOptions(mixed, '').map((item) => item.id)).toEqual([
      'a',
      'c',
      'b',
      'd',
    ])
  })
})

describe('提示词栏里的 `@` 候选（spec §1.7）', () => {
  it('键入 `@` 弹候选并按组分栏；↓ 移动高亮；↵ 落成 `@名字 `', () => {
    render(<Harness />)
    const input = typeInto('@')

    expect(
      document.querySelector('[data-node-chrome="mention-picker"]'),
    ).not.toBeNull()
    expect(screen.getByText('参考轨')).toBeInTheDocument()
    expect(screen.getByText('角色')).toBeInTheDocument()
    // 默认高亮第一项。
    expect(
      document
        .querySelector('[data-mention-option="rail:1"]')
        ?.getAttribute('data-mention-option-active'),
    ).toBe('true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(
      document
        .querySelector('[data-mention-option="rail:2"]')
        ?.getAttribute('data-mention-option-active'),
    ).toBe('true')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect((screen.getByLabelText('提示词') as HTMLTextAreaElement).value).toBe(
      '@图2 ',
    )
    // 落完就关。
    expect(
      document.querySelector('[data-node-chrome="mention-picker"]'),
    ).toBeNull()
  })

  it('Enter 落候选时**不发送**（⛔ 半截提示词发不出去）', () => {
    const onSubmit = vi.fn()
    render(
      <NodePromptBar
        value="@图"
        onValueChange={() => {}}
        onSubmit={onSubmit}
        placeholder="写点什么"
        ariaLabel="提示词"
        mentionOptions={OPTIONS}
      />,
    )
    const input = screen.getByLabelText('提示词') as HTMLTextAreaElement
    input.setSelectionRange(2, 2)
    fireEvent.select(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Esc 关掉这一个 `@`，⛔ 不再弹回来', () => {
    render(<Harness />)
    const input = typeInto('@图')
    expect(
      document.querySelector('[data-node-chrome="mention-picker"]'),
    ).not.toBeNull()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(
      document.querySelector('[data-node-chrome="mention-picker"]'),
    ).toBeNull()
  })

  it('没给候选的卡不弹（⛔ 空列表比没有更糟）', () => {
    render(
      <NodePromptBar
        value="@"
        onValueChange={() => {}}
        onSubmit={() => {}}
        placeholder="写点什么"
        ariaLabel="提示词"
      />,
    )
    expect(
      document.querySelector('[data-node-chrome="mention-picker"]'),
    ).toBeNull()
  })
})
