import { describe, expect, it } from 'vitest'

import type { AssistantOperatorCanvasNode } from '@/types/assistant-operator'

import {
  checkShotBeforeGenerate,
  promptTimelineEnd,
} from './assistant-v3-shot-checks'

function shot(
  text: string,
  values: { duration?: string; generateAudio?: boolean },
): AssistantOperatorCanvasNode {
  return {
    id: 'video4f610510-8120-436b-b3ac-ba4202af49b5',
    name: 'S02',
    kind: 'video',
    subtype: 'shot',
    text,
    parameters: {
      values,
      options: { generateAudio: [false, true] },
    },
  } as AssistantOperatorCanvasNode
}

describe('镜头卡出片前核对', () => {
  it('分段里的台词按那一段的秒数算：19 个词塞不进 3 秒', () => {
    const issues = checkShotBeforeGenerate(
      shot(
        '镜头1（0-6秒）：门拉开。镜头2（6-9秒）：她伸出右手并说：{女德拉科：Some wizarding families are much better than others, Potter. You don’t want to make friends with the wrong sort.}',
        { duration: '9', generateAudio: true },
      ),
    )
    expect(issues).toEqual([
      'the spoken line in the part from 6 to 9 s has 19 words; about 7 fit in 3 s',
    ])
  })

  it('有台词但没开声音', () => {
    expect(
      checkShotBeforeGenerate(
        shot(
          '镜头1（0-5秒）：她喊：{女德拉科：W-whatever! You’ll regret this, Potter!}',
          {
            duration: '5',
          },
        ),
      ),
    ).toEqual(['it has a spoken line but sound is off'])
  })

  it('没分段时按整张卡的时长算引号里的台词；放得下就不报', () => {
    expect(
      checkShotBeforeGenerate(
        shot('帽檐下特写 · @哈利（小声）："Not Slytherin…"', {
          duration: '4',
          generateAudio: true,
        }),
      ),
    ).toEqual([])
  })

  it('图片卡与没台词的镜头不核对', () => {
    expect(
      checkShotBeforeGenerate({
        ...shot('无对白', { duration: '5' }),
        kind: 'image',
      }),
    ).toEqual([])
    expect(
      checkShotBeforeGenerate(shot('全景，雨声', { duration: '5' })),
    ).toEqual([])
  })

  it('提示词里的分段时间码最晚到第几秒', () => {
    expect(
      promptTimelineEnd('镜头1（0-2秒）：近景。硬切。镜头2（2-5秒）：中景。'),
    ).toBe(5)
    expect(promptTimelineEnd('全景，雨声')).toBeNull()
  })
})
