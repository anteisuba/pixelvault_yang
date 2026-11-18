import { describe, expect, it } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SCRIPT_PROJECTION_MODE_IDS } from '@/constants/node-script'
import { applyNodeAssistantOpV4 } from '@/lib/node-assistant-op-apply-v4'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import { planV4Generation } from './use-node-media-generation-v4'

/**
 * **事实记录，不是行为约定**（owner 2026-11-18 提案项）：剧本卡投出来的镜头，发出去的
 * 提示词里到底有没有整份剧本？
 *
 * 投影时每一镜 `prompt` = 这一镜那段文本，同时剧本卡以 `role: script` 连进它的文本槽
 * （`applyScriptProjection`）。G4 拼提示词时 `readTextSegments` 读的是剧本卡的**整份**
 * `body` —— 所以每一镜都是「整份剧本 + 本镜那段」。这里把实际发出去的那句打出来并
 * 锁住**现状**；要改行为（只发本镜那段 / 只带大纲）等 owner 拍板后再改这条断言。
 */

const NOW = '2026-11-18T00:00:00.000Z'
const MODEL = {
  optionId: 'opt',
  modelId: 'seedance-2.5-volcengine',
  adapterType: 'volcengine',
  apiKeyId: 'key-1',
} as NodeV4Data extends { model?: infer M } ? NonNullable<M> : never

const SCRIPT_BODY = [
  '雨夜，一条老街。',
  'S01 街角，她撑着伞站在路灯下',
  'S02 他递过一把伞',
  'S03 两人对视，雨声变小',
].join('\n')

describe('投影镜头的提示词（事实记录）', () => {
  it('每一镜发出去的都带着整份剧本，再接本镜那段', () => {
    const script: NodeV4 = {
      id: 'script',
      position: { x: 0, y: 0 },
      data: {
        kind: 'text',
        subtype: 'script',
        name: '剧本',
        body: SCRIPT_BODY,
        status: 'idle',
        createdAt: NOW,
      },
    } as NodeV4
    let counter = 0
    const result = applyNodeAssistantOpV4(
      { version: 4, nodes: [script], edges: [] } as NodeWorkflowStateV4,
      {
        op: NODE_ASSISTANT_OP_V4_IDS.projectScript,
        scriptNodeId: 'script',
        mode: NODE_SCRIPT_PROJECTION_MODE_IDS.create,
      },
      {
        now: NOW,
        refs: new Map<string, string>(),
        mintId: (prefix) => {
          counter += 1
          return `${prefix}_${counter}`
        },
      },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const state = result.state
    const shots = state.nodes.filter((node) => node.data.kind === 'video')
    expect(shots.length).toBe(3)

    const prompts = shots.map((shot) => {
      const withModel = state.nodes.map((node) =>
        node.id === shot.id
          ? ({ ...node, data: { ...node.data, model: MODEL } } as NodeV4)
          : node,
      )
      const plan = planV4Generation(shot.id, {
        nodes: withModel,
        edges: state.edges,
      })
      return plan?.prompt ?? ''
    })

    // 把实际发出去的打出来（提案里引用的就是这三段输出）。
    prompts.forEach((prompt, index) => {
      process.stdout.write(
        `[projected shot ${index + 1}] prompt =\n${prompt}\n\n`,
      )
    })

    for (const [index, prompt] of prompts.entries()) {
      expect(prompt.startsWith(SCRIPT_BODY)).toBe(true)
      expect(prompt.length).toBeGreaterThan(SCRIPT_BODY.length)
      // 别的镜那段也在里面 —— 这就是「整份剧本」。
      const others = ['他递过一把伞', '两人对视']
      if (index === 0) {
        for (const other of others) expect(prompt).toContain(other)
      }
    }
  })
})
