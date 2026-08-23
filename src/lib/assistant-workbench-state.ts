/**
 * 把「当前工作台状态」渲染成喂给助手的文本块（§3.0b「读」半边）。
 *
 * **为什么需要它**：owner 三次实测同一个发作——助手看不到左边工作台，于是反问用户
 * 已经填好的东西（底模家族、LoRA 名称权重触发词），最后甚至给出「上传挂载面板
 * 截图」的选项，让用户去截一个**应用内存里就有**的状态。
 *
 * 机制上不是模型笨：系统提示给每个域列了「收敛前必须问清什么」的槽位，并明写
 * 「attached context 里可见的算已知，绝不重复问」。LoRA 域五个槽里有四个工作台
 * 知道答案，但一个都没告诉模型 —— 协议逼它问，应用从没开口。所以这个块的写法
 * 是**照着槽位回答**，不是 store dump。
 *
 * 三条硬规矩：
 *
 * 1. **空态要说出来**。「还没选模型」「一个 LoRA 都没挂」是信息，不是缺失。
 *    静默省略等于让模型继续猜。
 * 2. **不冒充自己不知道的事**。该批生成实际用的参数（snapshot）客户端拿不到，
 *    表单里的是**当前实时值**（用户出图后拖一下滑杆就变），所以规格一律标成
 *    "current form settings"，绝不写进「上一批」那段。
 * 3. **有上限**。见 `ASSISTANT_WORKBENCH_STATE_LIMITS` —— 便宜是这件事的前提，
 *    喂胖了就本末倒置。
 */

import { ASSISTANT_WORKBENCH_STATE_LIMITS as LIMITS } from '@/constants/assistant'
import type { AssistantWorkbenchState } from '@/types'

function clamp(value: string | undefined, max: number): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

function formatLoraMounts(
  mounts: NonNullable<AssistantWorkbenchState['loraMounts']>,
): string[] {
  if (mounts.length === 0) {
    // 空态说出来 —— 否则模型会去问「你挂了什么」
    return ['- Mounted LoRAs: none']
  }

  const shown = mounts.slice(0, LIMITS.maxLoraMounts)
  const lines = shown.map((mount, index) => {
    const bits: string[] = []
    if (mount.type) bits.push(clamp(mount.type, LIMITS.labelChars) ?? '')
    if (typeof mount.scale === 'number') bits.push(`weight ${mount.scale}`)
    // 停用的必须点名 —— 不然助手会把没生效的 LoRA 算进画面归因
    if (mount.enabled === false) bits.push('DISABLED (mounted but not applied)')
    if (mount.family) bits.push(clamp(mount.family, LIMITS.labelChars) ?? '')
    const meta = bits.filter(Boolean).join(' · ')
    const triggers = mount.triggerWords?.length
      ? ` · trigger words: ${mount.triggerWords.join(', ')}`
      : ''
    const name = clamp(mount.name, LIMITS.labelChars) ?? '(unnamed)'
    // 序号带上：栈的顺序是图层序，不是装饰
    return `  ${index + 1}. ${name}${meta ? ` — ${meta}` : ''}${triggers}`
  })

  const omitted = mounts.length - shown.length
  return [
    `- Mounted LoRAs (${mounts.length}, listed in stack order):`,
    ...lines,
    ...(omitted > 0 ? [`  …and ${omitted} more not listed`] : []),
  ]
}

function formatLastRun(
  run: NonNullable<AssistantWorkbenchState['lastRun']>,
): string[] {
  const head: string[] = []
  if (run.mode) head.push(run.mode)
  if (typeof run.total === 'number') head.push(`${run.total} image(s)`)
  if (typeof run.failed === 'number' && run.failed > 0) {
    head.push(`${run.failed} failed`)
  }

  const lines = [`- Last generation batch: ${head.join(' · ') || 'unknown'}`]

  const models = run.byModel.slice(0, LIMITS.maxRunModels)
  if (models.length > 0) {
    lines.push(
      `  models: ${models
        .map(
          (entry) => `${clamp(entry.model, LIMITS.labelChars)} ×${entry.count}`,
        )
        .join(', ')}`,
    )
  }
  const runPrompt = clamp(run.prompt, LIMITS.runPromptChars)
  if (runPrompt) lines.push(`  prompt used: ${runPrompt}`)
  if (typeof run.hasSelection === 'boolean') {
    lines.push(
      run.hasSelection
        ? '  the creator already picked a favourite from this batch'
        : '  the creator has not picked a favourite from this batch yet',
    )
  }
  return lines
}

/**
 * 渲染成可直接拼进用户提示的一段。没有任何已知字段时返回空串（不塞空壳）。
 *
 * ⚠ 放**用户提示**不放系统提示：块里含用户自己写的提示词/负面提示词，把用户可控
 * 文本放进系统提示等于给它系统级权威。放用户提示同样满足协议里那句「attached
 * context 里可见的算已知」。
 */
export function buildWorkbenchStateBlock(
  state: AssistantWorkbenchState | undefined,
): string {
  if (!state) return ''

  const lines: string[] = []

  const baseLabel = clamp(state.baseModelLabel, LIMITS.labelChars)
  const baseFamily = clamp(state.baseModelFamily, LIMITS.labelChars)

  // ── 模型 ──
  // ⚠ LoRA 域里「目标模型」就是底模，是同一个东西。所以名字回落到底模名 ——
  // 不回落的话会打出「selected (name unavailable)」，而紧接着的下一行就写着那个
  // 名字，自相矛盾。
  const targetLabel = clamp(state.modelLabel, LIMITS.labelChars) ?? baseLabel
  if (state.modelSelected === false) {
    // 空态说出来：这是 owner 点名要的那条
    lines.push('- Target model: NOT SELECTED YET')
  } else if (state.modelSelected === true) {
    lines.push(
      `- Target model: ${targetLabel ?? 'selected (name unavailable)'}`,
    )
  }
  if (state.extraModelCount && state.extraModelCount > 0) {
    lines.push(
      `- Also sending to ${state.extraModelCount} additional model(s) in the same run`,
    )
  }

  // ── 底模 / LoRA 栈 ──
  // 名字已经在上面那行打过就不再重复，只补家族信息（家族是额外事实，不是重复）。
  const baseNameAlreadyShown = Boolean(baseLabel && baseLabel === targetLabel)
  const baseParts = [
    baseNameAlreadyShown ? null : baseLabel,
    baseFamily && `family ${baseFamily}`,
  ].filter(Boolean)
  if (baseParts.length > 0) {
    lines.push(`- Base model: ${baseParts.join(' · ')}`)
  }
  if (state.loraMounts) lines.push(...formatLoraMounts(state.loraMounts))

  // ── 编辑器文本 ──
  const prompt = clamp(state.prompt, LIMITS.promptChars)
  lines.push(`- Prompt in the editor: ${prompt ?? '(empty)'}`)
  // ⚠ **字段缺席 = 这个工作台没有负面框**，不是「有但空着」—— 图片模态就是这一档
  //   （不渲染 BottomDock，整个高级面板不存在）。判据必须在 `clamp` **之前**：
  //   clamp 对 `''` 和 `undefined` 都返回 null，过完就分不出这两件事了。
  //   打成 `(empty)` 的后果实拍过（2026-08-22）：模型以为有槽可填，提了一个负面
  //   提示词，写回那边当场否掉「这个工作台没有这一项」—— 一条注定被拒的建议。
  if (state.negativePrompt !== undefined) {
    const negative = clamp(state.negativePrompt, LIMITS.promptChars)
    lines.push(`- Negative prompt: ${negative ?? '(empty)'}`)
  }

  // ── 规格 ──
  if (state.output) {
    const parts: string[] = []
    if (state.output.aspectRatio) parts.push(state.output.aspectRatio)
    if (state.output.resolution) parts.push(state.output.resolution)
    if (state.output.batchCount)
      parts.push(`${state.output.batchCount} per model`)
    if (state.output.durationSeconds) {
      parts.push(`${state.output.durationSeconds}s`)
    }
    if (state.output.videoResolution) parts.push(state.output.videoResolution)
    if (parts.length > 0) {
      // 明说是「当前表单值」—— 它不是任何一批的历史快照，别让模型拿它解释旧图
      lines.push(`- Current form settings: ${parts.join(' · ')}`)
    }
  }

  if (typeof state.referenceImageCount === 'number') {
    lines.push(
      state.referenceImageCount > 0
        ? `- Reference images on the workbench: ${state.referenceImageCount}`
        : '- Reference images on the workbench: none',
    )
  }

  if (state.lastRun) lines.push(...formatLastRun(state.lastRun))

  // ── 能选的模型 ──
  // ⚠ 这一段和上面所有行**性质不同**：上面是「现在是什么样」，这段是「能被改成
  // 什么样」。所以它自带一句用途说明——不然模型会把它当成「已经在用这些」。
  if (state.availableModels?.length) {
    const shown = state.availableModels.slice(0, LIMITS.maxCatalogModels)
    lines.push(
      `- Models the creator can switch to right now (use the exact id on the left if you propose one):`,
      // ⚠ 名字和 id 一样时只打一遍。工作区内置模型没有 displayLabel，宿主回落到
      // modelId，于是原样渲染会打出 `illustrious-xl — illustrious-xl` —— 十几行
      // 这种重复既费 token 又像是两个不同的东西。
      ...shown.map((model) => {
        const label = clamp(model.label, LIMITS.labelChars)
        return label && label !== model.id
          ? `  ${model.id} — ${label}`
          : `  ${model.id}`
      }),
    )
    const omitted = state.availableModels.length - shown.length
    if (omitted > 0) lines.push(`  …and ${omitted} more not listed`)
  }

  if (lines.length === 0) return ''

  return `CURRENT WORKBENCH STATE (the creator can see all of this on their screen right now — treat every line as already known and never ask for it):
${lines.join('\n')}`
}
