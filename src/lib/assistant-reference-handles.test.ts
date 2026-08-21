import { describe, it, expect } from 'vitest'

import {
  buildReferenceHandles,
  formatReferenceTag,
} from '@/lib/assistant-reference-handles'

describe('buildReferenceHandles', () => {
  it('同一类里从 #1 顺序编号', () => {
    expect(
      buildReferenceHandles([
        { kind: 'image' },
        { kind: 'image' },
        { kind: 'image' },
      ]),
    ).toEqual(['#1', '#2', '#3'])
  })

  /**
   * ⚠ 这是整套编号存在的理由，也是画布**既有的错位**：
   * 模型收到的是 `imageData[]` 和 `videoData[]` 两个独立数组
   * （`filter(kind === …)`），所以中间插一个视频**不能**把后面的图片顺延。
   * 混编的话，用户说「第二张图」会指到第三个引用上。
   */
  it('图和视频各自从 #1 起 —— 插了视频不能把后面的图顺延', () => {
    expect(
      buildReferenceHandles([
        { kind: 'image' },
        { kind: 'video' },
        { kind: 'image' },
      ]),
    ).toEqual(['#1', '#1', '#2'])
  })

  it('编号从位置推导：删掉中间一张后自动重排', () => {
    const all = [
      { kind: 'image' as const },
      { kind: 'image' as const },
      { kind: 'image' as const },
    ]
    expect(buildReferenceHandles(all)).toEqual(['#1', '#2', '#3'])

    // 删掉第二张
    const afterRemoval = [all[0], all[2]]
    expect(buildReferenceHandles(afterRemoval)).toEqual(['#1', '#2'])
  })

  it('空列表不报错', () => {
    expect(buildReferenceHandles([])).toEqual([])
  })
})

describe('formatReferenceTag', () => {
  it('带上 kind —— 图和视频各自从 #1 起，光看 #2 分不清是哪类', () => {
    expect(formatReferenceTag('image', '#2')).toBe('[image #2]')
    expect(formatReferenceTag('video', '#1')).toBe('[video #1]')
  })

  it('不本地化 —— 界面和提示词必须是同一个字符串', () => {
    // 界面 chip 显示 `#2`，提示词写 `[image #2]`：两边共享 `#2` 这个符号。
    // 一旦这里翻成「图2」而提示词里是 `image 2`，用户和模型就没有共同称呼了。
    expect(formatReferenceTag('image', '#2')).toContain('#2')
  })
})
