import { describe, expect, it } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { describeSilentTurn } from '@/lib/studio-operator-silent-turn'

describe('describeSilentTurn', () => {
  it('只看不改的一轮不补', () => {
    expect(
      describeSilentTurn(
        [
          {
            tool: ASSISTANT_OPERATOR_TOOL_IDS.readState,
            title: '读取 S01',
            undone: false,
          },
        ],
        0,
      ),
    ).toBeNull()
  })

  it('改过的步写进去，看 / 查的不写，撤销的标出来', () => {
    const note = describeSilentTurn(
      [
        {
          tool: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: '读取 S01',
          undone: false,
        },
        {
          tool: ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch,
          title: '改写「S01 首帧」',
          undone: false,
        },
        {
          tool: ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch,
          title: '设置 vid-9c1ff8',
          undone: true,
        },
      ],
      1,
    )
    expect(note).toContain('改写「S01 首帧」')
    expect(note).toContain('设置 vid-9c1ff8 (the creator undid this)')
    expect(note).not.toContain('读取 S01')
    expect(note).toContain('1 generation(s)')
  })
})
