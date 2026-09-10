import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src as string} alt="" data-testid="bar-thumb" />
  ),
}))

import { renderPromptMentions } from './render-prompt-value'

/**
 * 栏内 chip 的**唯一硬约束**：镜像层画出来的字符与 `value` 逐字符相同，光标才落在
 * 看到的字上。缩略图是绝对定位压在藏起来的 `@图` 上的，⛔ 一点布局宽度都不占。
 */
describe('renderPromptMentions', () => {
  const text = '男主（@图2）俯身'

  it('轨上序号项带缩略，且字符逐字符不变（owner 真机反馈第三条）', () => {
    const { container } = render(
      <div>
        {renderPromptMentions(text, {
          names: ['图2'],
          mediaOf: () => ({ kind: 'image', thumbnailUrl: '/a.png' }),
        })}
      </div>,
    )
    expect(container.textContent).toBe(text)
    expect(container.querySelector('[data-prompt-bar-thumb]')).not.toBeNull()
    expect(container.querySelector('[data-testid="bar-thumb"]')).not.toBeNull()
  })

  it('语音序号项压波形小标，⛔ 不去拉图', () => {
    const { container } = render(
      <div>
        {renderPromptMentions('听 @语音1 这条', {
          names: ['语音1'],
          mediaOf: () => ({ kind: 'audio' }),
        })}
      </div>,
    )
    expect(container.querySelector('[data-prompt-bar-thumb]')).not.toBeNull()
    expect(container.querySelector('[data-testid="bar-thumb"]')).toBeNull()
    expect(container.textContent).toBe('听 @语音1 这条')
  })

  it('普通 @名字 不画缩略：前面只有一个 `@`，16px 放不下', () => {
    const { container } = render(
      <div>
        {renderPromptMentions('@莫宁 靠在长椅边', {
          names: ['莫宁'],
          mediaOf: () => ({ kind: 'image', thumbnailUrl: '/a.png' }),
        })}
      </div>,
    )
    expect(container.querySelector('[data-prompt-bar-thumb]')).toBeNull()
    expect(container.textContent).toBe('@莫宁 靠在长椅边')
  })
})
