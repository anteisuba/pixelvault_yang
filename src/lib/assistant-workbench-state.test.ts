import { describe, it, expect } from 'vitest'

import { buildWorkbenchStateBlock } from '@/lib/assistant-workbench-state'
import { ASSISTANT_WORKBENCH_STATE_LIMITS as LIMITS } from '@/constants/assistant'

describe('buildWorkbenchStateBlock', () => {
  it('没有状态时不塞空壳', () => {
    expect(buildWorkbenchStateBlock(undefined)).toBe('')
    expect(buildWorkbenchStateBlock({})).toContain('Prompt in the editor')
  })

  // ── 空态必须说出来（owner 点名的那条）──────────────────────────

  it('「还没选模型」是信息，不是缺失', () => {
    const block = buildWorkbenchStateBlock({ modelSelected: false })
    expect(block).toContain('NOT SELECTED YET')
  })

  it('选了模型就报名字', () => {
    const block = buildWorkbenchStateBlock({
      modelSelected: true,
      modelLabel: 'Anima DiT',
    })
    expect(block).toContain('Anima DiT')
    expect(block).not.toContain('NOT SELECTED')
  })

  it('空提示词写成 (empty) 而不是省略', () => {
    const block = buildWorkbenchStateBlock({ prompt: '', negativePrompt: '' })
    expect(block).toContain('Prompt in the editor: (empty)')
    expect(block).toContain('Negative prompt: (empty)')
  })

  // 2026-08-22 owner：助手提了一条负面提示词，写回当场否掉「这个工作台没有这一项」。
  // 根因是这两件事此前都打成 `(empty)`：**「有槽但空着」和「根本没有这个槽」**。
  it('⭐ 负面字段缺席 = 这个工作台没有负面框，整行不出现', () => {
    const block = buildWorkbenchStateBlock({ prompt: 'a cat' })

    expect(block).not.toContain('Negative prompt')
    // 防空转：同一次调用里「有但空着」的提示词行照常出现。
    expect(block).toContain('Prompt in the editor: a cat')
  })

  it('一个 LoRA 都没挂也要说出来', () => {
    expect(buildWorkbenchStateBlock({ loraMounts: [] })).toContain(
      'Mounted LoRAs: none',
    )
  })

  it('没挂参考图也要说出来', () => {
    expect(buildWorkbenchStateBlock({ referenceImageCount: 0 })).toContain(
      'Reference images on the workbench: none',
    )
  })

  // ── LoRA 明细：owner 原始问题「我挂了两个 LoRA 你能看到吗」──────

  it('挂载明细带上权重、类型、触发词和栈内序号', () => {
    const block = buildWorkbenchStateBlock({
      loraMounts: [
        {
          name: '安可 (encore)',
          type: 'character',
          triggerWords: ['encore'],
          scale: 0.95,
          family: 'anima',
        },
        {
          name: '终末地建模画风',
          type: 'style',
          triggerWords: ['终末地建模画风'],
          scale: 0.3,
        },
      ],
    })

    expect(block).toContain('Mounted LoRAs (2, listed in stack order)')
    expect(block).toContain('1. 安可 (encore)')
    expect(block).toContain('weight 0.95')
    expect(block).toContain('trigger words: encore')
    expect(block).toContain('2. 终末地建模画风')
    expect(block).toContain('weight 0.3')
  })

  // LoRA 域里「目标模型」和「底模」是同一个东西 —— 不处理就会打出
  // 「selected (name unavailable)」而下一行正写着那个名字（子 agent 2026-08-20 实测）
  it('目标模型名回落到底模名，不出现「拿不到名字」紧挨着名字', () => {
    const block = buildWorkbenchStateBlock({
      modelSelected: true,
      baseModelLabel: 'FLUX.1-dev',
      baseModelFamily: 'flux',
    })

    expect(block).toContain('Target model: FLUX.1-dev')
    expect(block).not.toContain('name unavailable')
    // 名字不重复两遍，但家族是额外事实要留
    expect(block).toContain('family flux')
    expect(block.match(/FLUX\.1-dev/g)).toHaveLength(1)
  })

  it('目标模型和底模是两个不同的东西时，两行都留', () => {
    const block = buildWorkbenchStateBlock({
      modelSelected: true,
      modelLabel: 'gpt-image-2',
      baseModelLabel: 'FLUX.1-dev',
    })

    expect(block).toContain('Target model: gpt-image-2')
    expect(block).toContain('Base model: FLUX.1-dev')
  })

  it('停用的挂载必须点名 —— 否则助手会把没生效的算进画面归因', () => {
    const block = buildWorkbenchStateBlock({
      loraMounts: [{ name: 'A', triggerWords: [], enabled: false }],
    })
    expect(block).toContain('DISABLED')
  })

  // ── 不冒充自己不知道的事 ──────────────────────────────────────

  it('规格标成「当前表单值」，不冒充成某一批用过的参数', () => {
    const block = buildWorkbenchStateBlock({
      output: { aspectRatio: '1:1', batchCount: 1 },
      lastRun: { mode: 'compare', total: 4, byModel: [] },
    })
    // 这批实际用的参数客户端拿不到（snapshot 不在 payload 里），所以只能说
    // 「当前表单值」——说成「这批用的」就是喂谎
    expect(block).toContain('Current form settings')
    expect(block).not.toMatch(/batch.*used.*1:1/i)
  })

  it('批次元数据按模型聚合，且绝不带缩略图 URL', () => {
    const block = buildWorkbenchStateBlock({
      lastRun: {
        mode: 'compare',
        total: 4,
        failed: 1,
        byModel: [
          { model: 'gpt-image-2', count: 2 },
          { model: 'flux-2-pro', count: 2 },
        ],
        prompt: '一只猫',
        hasSelection: false,
      },
    })

    expect(block).toContain('4 image(s)')
    expect(block).toContain('1 failed')
    expect(block).toContain('gpt-image-2 ×2')
    expect(block).toContain('has not picked a favourite')
    // URL 每条 ~120 字符且纯文本模型看不了图 —— 一律不发
    expect(block).not.toContain('http')
  })

  // ── 有上限（便宜是这件事的前提）─────────────────────────────

  it('超长提示词被截断', () => {
    const block = buildWorkbenchStateBlock({ prompt: 'x'.repeat(5000) })
    expect(block).toContain('…')
    expect(block.length).toBeLessThan(LIMITS.promptChars + 400)
  })

  it('挂载过多时截断并说明省略了几条', () => {
    const mounts = Array.from({ length: LIMITS.maxLoraMounts + 5 }, (_, i) => ({
      name: `lora-${i}`,
      triggerWords: [],
    }))
    const block = buildWorkbenchStateBlock({ loraMounts: mounts })
    expect(block).toContain('and 5 more not listed')
  })

  it('整块在典型场景下稳定在几百字量级', () => {
    const block = buildWorkbenchStateBlock({
      prompt: '一只坐在树下的猫，黄昏光线',
      negativePrompt: 'lowres, bad anatomy',
      modelSelected: true,
      modelLabel: 'Anima DiT',
      output: { aspectRatio: '1:1', resolution: 'auto', batchCount: 1 },
      loraMounts: [
        {
          name: '安可',
          type: 'character',
          triggerWords: ['encore'],
          scale: 0.95,
        },
        { name: '画风', type: 'style', triggerWords: ['style'], scale: 0.3 },
      ],
      baseModelFamily: 'anima',
      referenceImageCount: 2,
      lastRun: {
        mode: 'single',
        total: 1,
        byModel: [{ model: 'anima-dit', count: 1 }],
        prompt: '一只猫',
        hasSelection: true,
      },
    })

    expect(block.length).toBeLessThan(1200)
  })

  // ── 措辞要挂上协议里那句「可见的算已知」──────────────────────

  it('开头明说这些用户看得见、算已知、别再问', () => {
    const block = buildWorkbenchStateBlock({ prompt: 'a' })
    expect(block).toContain('the creator can see all of this')
    expect(block).toContain('never ask for it')
  })

  // ── 能选的模型（`[[setup]]` 提案的取值范围）─────────────────────

  it('模型目录列出 id，并说明用途是「可以切过去」而不是「已经在用」', () => {
    const block = buildWorkbenchStateBlock({
      modelSelected: true,
      modelLabel: 'FLUX 2 Flash',
      availableModels: [
        { id: 'illustrious-xl', label: 'Illustrious XL' },
        { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
      ],
    })

    expect(block).toContain('can switch to right now')
    // id 要原样出现 —— 助手得照抄它，不然 chip 永远不出现
    expect(block).toContain('illustrious-xl — Illustrious XL')
    // 而且不能被误读成「当前模型」那一行
    expect(block).toContain('- Target model: FLUX 2 Flash')
  })

  it('没有目录时整段不出现，不打一句空标题', () => {
    const block = buildWorkbenchStateBlock({ prompt: 'a' })
    expect(block).not.toContain('can switch to')
  })

  it('目录过长时截断并说明省略了几个', () => {
    const many = Array.from(
      { length: LIMITS.maxCatalogModels + 3 },
      (_, i) => ({
        id: `model-${i}`,
        label: `Model ${i}`,
      }),
    )
    const block = buildWorkbenchStateBlock({ availableModels: many })

    expect(block).toContain(`model-${LIMITS.maxCatalogModels - 1} —`)
    expect(block).not.toContain(`model-${LIMITS.maxCatalogModels} —`)
    expect(block).toContain('and 3 more not listed')
  })

  it('名字和 id 一样时只打一遍', () => {
    // 工作区内置模型没有 displayLabel，宿主回落到 modelId ——
    // 真机上这一整段十六行全长成 `illustrious-xl — illustrious-xl`。
    const block = buildWorkbenchStateBlock({
      availableModels: [{ id: 'illustrious-xl', label: 'illustrious-xl' }],
    })

    expect(block).toContain('illustrious-xl')
    expect(block).not.toContain('illustrious-xl — illustrious-xl')
  })
})
