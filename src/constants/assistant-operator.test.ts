import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX,
  ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_OPERATOR_MUTATING_TOOLS,
  ASSISTANT_OPERATOR_READ_TOOLS,
  ASSISTANT_OPERATOR_TOOL_HINTS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN,
  buildAssistantOperatorCanvasConfirmKey,
  isAssistantOperatorToolInDomain,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_PROTOCOL_DOMAIN_IDS,
  ASSISTANT_PROTOCOL_DOMAINS,
} from '@/constants/assistant-protocol'
import { NODE_WORKFLOW_FIELDS } from '@/constants/node-types'
import { STUDIO_OPERATOR_SUGGESTIONS } from '@/constants/studio-assistant-operator'

/**
 * 画布域词表（C0，`docs/plans/canvas-assistant-operator-c0c1-2026-09-01.md` §2.1 / §2.3）。
 * schema 侧的用例在 `types/assistant-operator.test.ts`；这里只锁词表本身。
 */

const CANVAS = ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas
const CANVAS_TOOLS = ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[CANVAS]

const CANVAS_MUTATING_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.stageNodes,
  ASSISTANT_OPERATOR_TOOL_IDS.connectNodes,
  ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields,
  ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel,
  ASSISTANT_OPERATOR_TOOL_IDS.attachRefs,
  ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
  ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
] as const

describe('画布域接入（C0 §2.1）', () => {
  it('canvas 在操作员域表里，且域表与协议域表一致', () => {
    expect(ASSISTANT_OPERATOR_DOMAINS).toContain(CANVAS)
    expect([...ASSISTANT_OPERATOR_DOMAINS].sort()).toEqual(
      [...ASSISTANT_PROTOCOL_DOMAINS].sort(),
    )
  })

  it('每个域都有工具表、都有建议药丸（Record 穷举之外再锁一道运行时）', () => {
    for (const domain of ASSISTANT_OPERATOR_DOMAINS) {
      expect(ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[domain].length).toBeGreaterThan(
        0,
      )
      expect(STUDIO_OPERATOR_SUGGESTIONS[domain]).toHaveLength(3)
    }
  })

  it('工作台三域的工具表一条没变（画布接入零影响）', () => {
    expect(ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN.image).toHaveLength(14)
    expect(ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN.video).toHaveLength(14)
    expect(ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN.lora).toHaveLength(15)
    for (const domain of [
      ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
      ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
      ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
    ] as const) {
      for (const tool of CANVAS_MUTATING_TOOLS) {
        expect(isAssistantOperatorToolInDomain(tool, domain)).toBe(false)
      }
    }
  })
})

describe('画布工具表（C0 §2.3 / §2.5 ①）', () => {
  it('⛔ 钱闸：表里没有任何一条含 generate，唯一例外是只置态的 prime_node_generate', () => {
    const generating = CANVAS_TOOLS.filter(
      (tool) =>
        tool.includes('generate') &&
        tool !== ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
    )
    expect(generating).toEqual([])
    expect(CANVAS_TOOLS).toContain(
      ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
    )
  })

  it('⛔ 不复用工作台的那几条通用件（形状不同即非通用件）', () => {
    for (const tool of [
      ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
      ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
      ASSISTANT_OPERATOR_TOOL_IDS.setModel,
      ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
      ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
      ASSISTANT_OPERATOR_TOOL_IDS.readState,
    ]) {
      expect(CANVAS_TOOLS, `${tool} 不该在画布表里`).not.toContain(tool)
    }
  })

  it('两条读 + 八条改 + update_script_doc + 三条读库通用件，一条不多', () => {
    expect([...CANVAS_TOOLS].sort()).toEqual(
      [
        ASSISTANT_OPERATOR_TOOL_IDS.readGraph,
        ASSISTANT_OPERATOR_TOOL_IDS.readNode,
        ...CANVAS_MUTATING_TOOLS,
        ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc,
        ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
        ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
        ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
      ].sort(),
    )
    /**
     * ⚠ C3 之后 `update_script_doc` 才进域表：C0 只定义了它，而一条在提示词里
     * 看得见却必定被拒的工具只会白烧一步。现在服务端写文档、客户端经既有投影
     * 确认门落到画布，两侧都通了。
     */
    expect(CANVAS_TOOLS).toContain(ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc)
  })

  it('读 / 改分类：两条读进 READ_TOOLS，八条改进 MUTATING_TOOLS', () => {
    expect(ASSISTANT_OPERATOR_READ_TOOLS).toContain(
      ASSISTANT_OPERATOR_TOOL_IDS.readGraph,
    )
    expect(ASSISTANT_OPERATOR_READ_TOOLS).toContain(
      ASSISTANT_OPERATOR_TOOL_IDS.readNode,
    )
    for (const tool of [
      ...CANVAS_MUTATING_TOOLS,
      ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc,
    ]) {
      expect(ASSISTANT_OPERATOR_MUTATING_TOOLS).toContain(tool)
    }
  })

  it('每条画布工具都有一行给模型看的说明', () => {
    for (const tool of CANVAS_TOOLS) {
      expect(ASSISTANT_OPERATOR_TOOL_HINTS[tool].length).toBeGreaterThan(20)
    }
  })
})

describe('批内别名与确认复合键（C0 §2.2 / §2.4）', () => {
  it('别名前缀是 new:', () => {
    expect(ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX).toBe('new:')
  })

  it('画布确认字段 = title + NODE_WORKFLOW_FIELDS（不含档位）', () => {
    expect(ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELDS).toContain('title')
    for (const field of NODE_WORKFLOW_FIELDS) {
      expect(ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELDS).toContain(field)
    }
    expect(ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELDS).not.toContain(
      'aspectRatio',
    )
  })

  it('复合键是 `${nodeId}:${field}`', () => {
    expect(buildAssistantOperatorCanvasConfirmKey('node-1', 'action')).toBe(
      'node-1:action',
    )
  })
})
