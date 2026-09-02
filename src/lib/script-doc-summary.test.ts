import { describe, expect, it } from 'vitest'

import type { ScriptDoc } from '@/types/script-doc'

import {
  buildScriptDocSummary,
  scriptDocSceneLabels,
} from './script-doc-summary'

function doc(overrides: Partial<ScriptDoc> = {}): ScriptDoc {
  return {
    title: '雨夜',
    logline: '她在雨里找一把伞',
    roles: [],
    shots: [],
    ...overrides,
  }
}

function shot(id: string, sceneLabel?: string): ScriptDoc['shots'][number] {
  return {
    id,
    summary: `镜头 ${id}`,
    roleIds: [],
    dialogue: [],
    ...(sceneLabel === undefined ? {} : { sceneLabel }),
  }
}

describe('scriptDocSceneLabels', () => {
  it('按出场顺序去重；⚠ 没标场次的镜头不占一格（那不是「有一场叫空」）', () => {
    expect(
      scriptDocSceneLabels(
        doc({
          shots: [
            shot('s1', '街头'),
            shot('s2', '街头'),
            shot('s3', '  '),
            shot('s4', '便利店'),
            shot('s5'),
          ],
        }),
      ),
    ).toEqual(['街头', '便利店'])
  })
})

describe('buildScriptDocSummary', () => {
  it('标题 / logline / 场次 / 镜头数 / 角色名 —— 概览级，⛔ 没有镜头正文与台词', () => {
    const summary = buildScriptDocSummary(
      doc({
        roles: [
          { id: 'r1', name: '小林', description: '短黑发，红大衣' },
          { id: 'r2', name: '老张', description: '' },
        ],
        shots: [
          {
            id: 's1',
            sceneLabel: '街头',
            summary: '小林走进雨里',
            roleIds: ['r1'],
            dialogue: [{ id: 'd1', speakerRoleId: 'r1', line: '又下雨了。' }],
          },
          shot('s2', '便利店'),
        ],
      }),
    )
    expect(summary).toBe(
      '"雨夜" · 她在雨里找一把伞 · 2 scene(s): 街头, 便利店 · 2 shot(s) · cast: 小林, 老张',
    )
    // ⛔ 正文与台词一个字都不在摘要里 —— 它每一轮都驮在提示上。
    expect(summary).not.toContain('小林走进雨里')
    expect(summary).not.toContain('又下雨了。')
    expect(summary).not.toContain('短黑发')
  })

  it('空文档也说得出话（logline / 场次 / 角色缺席各有自己的说法）', () => {
    expect(buildScriptDocSummary(doc({ logline: '' }))).toBe(
      '"雨夜" · no scene labels · 0 shot(s) · no cast yet',
    )
  })
})
