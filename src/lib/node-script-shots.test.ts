import { describe, expect, it } from 'vitest'

import { parseScriptShots } from '@/lib/node-script-shots'

describe('parseScriptShots · 确定性拆镜（进度表 24）', () => {
  /**
   * ⭐ 这一条是整条投影链的地基：同一份正文拆两次必须得到同一批键，否则
   * 「第二镜改了一句话」会被重投影读成「删了一批又建了一批」。
   */
  it('⭐ 同一份正文拆两次得到同一批键', () => {
    const body = 'S01 雨夜街角\nS02 递伞\nS03 对视'
    expect(parseScriptShots(body).shots.map((shot) => shot.key)).toEqual(
      parseScriptShots(body).shots.map((shot) => shot.key),
    )
  })

  it('编号档：键取编号，标记行之前的正文是大纲', () => {
    const result = parseScriptShots(
      [
        '雨夜街角，小黑把伞递给陌生人。',
        '',
        'S01 · 雨夜街角 · 远景 · 4s',
        '雨声渐起。',
        'S02 · 递伞 · 5s',
      ].join('\n'),
    )
    expect(result.outline).toBe('雨夜街角，小黑把伞递给陌生人。')
    expect(result.shots).toHaveLength(2)
    expect(result.shots[0]).toMatchObject({
      key: 's1',
      no: 1,
      title: '雨夜街角 · 远景',
      durationSec: 4,
    })
    expect(result.shots[0]?.text).toContain('雨声渐起。')
    expect(result.shots[1]).toMatchObject({ key: 's2', no: 2, durationSec: 5 })
  })

  it('编号档里的 # 小标题算「幕」，不算镜', () => {
    const result = parseScriptShots(
      ['# 第一幕', 'S01 开场', '## 第二幕', 'S02 递伞'].join('\n'),
    )
    expect(result.actCount).toBe(2)
    expect(result.shots.map((shot) => shot.key)).toEqual(['s1', 's2'])
  })

  it('`## S02 递伞` 这种带 # 前缀的编号行仍是镜', () => {
    const result = parseScriptShots('## S02 递伞\n中景')
    expect(result.shots[0]).toMatchObject({ key: 's2', no: 2, title: '递伞' })
  })

  /**
   * ⚠ 没有这条边界，`s3cret …` 会被读成第 3 镜 —— 一行被误判成标记的后果是整张
   * 剧本的键全错位，而那在界面上表现为「我只改了一句话，它把四镜全标成删了」。
   */
  it('⭐ `s3cret` 不算编号标记', () => {
    const result = parseScriptShots('s3cret plan\n\n第二段')
    expect(result.shots.map((shot) => shot.key)).toEqual(['p1', 'p2'])
  })

  it('小标题档：没有编号时按 # 切，键取标题文字', () => {
    const result = parseScriptShots('# 递伞\n中景\n# 对视\n特写')
    expect(result.shots.map((shot) => shot.key)).toEqual(['h:递伞', 'h:对视'])
    expect(result.shots[1]?.title).toBe('对视')
  })

  it('空行档：两种标记都没有时按段落切', () => {
    const result = parseScriptShots('雨夜街角\n\n递伞\n\n对视')
    expect(result.shots.map((shot) => shot.key)).toEqual(['p1', 'p2', 'p3'])
    expect(result.shots[0]?.title).toBe('雨夜街角')
    // ⚠ 段落档没有大纲：哪一段是大纲这件事在正文里读不出来，⛔ 不猜。
    expect(result.outline).toBe('')
  })

  it('读出这一段里的 @角色（角色槽的空位来源）', () => {
    const result = parseScriptShots('S01 对视 · @小黑 @路人\n@小黑 抬头')
    expect(result.shots[0]?.roles).toEqual(['小黑', '路人'])
  })

  it('空正文拆不出镜', () => {
    expect(parseScriptShots('   \n\n  ').shots).toEqual([])
  })

  it('重复编号不互相顶掉，第二次出现改键', () => {
    const result = parseScriptShots('S01 甲\nS01 乙')
    expect(result.shots.map((shot) => shot.key)).toEqual(['s1', 's1#2'])
  })
})
