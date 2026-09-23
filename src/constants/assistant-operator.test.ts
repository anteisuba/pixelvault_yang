import { describe, expect, it } from 'vitest'

import {
  isSelfPromiseClosingMessage,
  isUnfinishedClosingMessage,
} from '@/constants/assistant-operator'

/**
 * **收尾那句话不许停在进行时**（2026-09-07）。
 *
 * 🔬 owner 真机：助手最后留在线程里的整句是「正在检索……的角色立绘与外貌描述。」
 * —— 没有结论，也没有说这个角色查不到。
 */
describe('isUnfinishedClosingMessage', () => {
  it('⭐ 进行时开头 = 话没说完（三种语言各一条）', () => {
    expect(
      isUnfinishedClosingMessage(
        '正在检索《无限大》时夜的角色立绘与外貌描述。',
      ),
    ).toBe(true)
    expect(isUnfinishedClosingMessage('接下来我会去查官方站。')).toBe(true)
    expect(isUnfinishedClosingMessage('ただいま検索しています。')).toBe(true)
    expect(
      isUnfinishedClosingMessage("I'm searching for the official art."),
    ).toBe(true)
    expect(isUnfinishedClosingMessage('Let me look that up.')).toBe(true)
  })

  it('⭐ 空正文也算 —— 一个什么都不说就结束的助手最难查', () => {
    expect(isUnfinishedClosingMessage('')).toBe(true)
    expect(isUnfinishedClosingMessage('   ')).toBe(true)
  })

  it('省略号收尾的半句也算', () => {
    expect(isUnfinishedClosingMessage('这就去看看官方站…')).toBe(true)
  })

  it('⛔ 真的结论一律放行 —— 包括「查不到」那种结论', () => {
    expect(
      isUnfinishedClosingMessage(
        '官方还没有公开时夜的外貌设定，我在官网、维基和 danbooru 都找过了。要不要先按已知的气质写一版提示词？',
      ),
    ).toBe(false)
    expect(isUnfinishedClosingMessage('提示词写好了，参考图挂在第二格。')).toBe(
      false,
    )
    expect(
      isUnfinishedClosingMessage(
        'The official design has not been published; here is what I can build from what is known.',
      ),
    ).toBe(false)
  })
})

/** 2026-09-24 真机：收尾许诺「下一步我会调 16:9、准备确认卡」然后停下。 */
describe('isSelfPromiseClosingMessage', () => {
  it('⭐ 许诺挂在最后一句也算（三种语言）', () => {
    expect(
      isSelfPromiseClosingMessage(
        'JIAN，已按你的要求覆盖提示词。下一步我会把画幅调整为适配原图的16:9，再为你准备生成确认卡。',
      ),
    ).toBe(true)
    expect(
      isSelfPromiseClosingMessage(
        'JIAN，提示词已覆盖。回复“继续生成”，我就按参考图的16:9版式和2K继续准备确认卡。',
      ),
    ).toBe(true)
    expect(
      isSelfPromiseClosingMessage(
        'The prompt is in. Next, I will switch the ratio to 16:9.',
      ),
    ).toBe(true)
    expect(
      isSelfPromiseClosingMessage(
        'プロンプトを更新しました。次は比率を16:9に変更します。',
      ),
    ).toBe(true)
  })

  it('⛔ 把决定交给创作者的问句、以及真结论放行', () => {
    expect(
      isSelfPromiseClosingMessage(
        '提示词写好了。要不要我接下来我再把比例改成 16:9？',
      ),
    ).toBe(false)
    expect(
      isSelfPromiseClosingMessage('提示词和 16:9 都设好了，确认卡在下面。'),
    ).toBe(false)
  })
})
