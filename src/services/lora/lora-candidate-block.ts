import 'server-only'

/**
 * 把候选列表渲染成喂给助手的文本块（切片 3，任务包 §C 的「注入侧」）。
 *
 * ── 两条硬规矩 ─────────────────────────────────────────────────────
 * 1. **只喂模型判断得上的东西**：id / 名字 / 作者 / 家族 / 触发词 / 许可 /
 *    是否已挂载 / 能不能导入。⛔ 样图 URL、长描述、下载数一律不进 —— 卡面
 *    上那些字段由客户端从候选对象直接渲染，模型看了也只能原样抄一遍，抄错
 *    还会和卡面打架。
 * 2. **块进用户提示，规矩进系统提示**（`buildAssistantLoraCandidateDirective`）。
 *    与检索证据同一条分界：候选名/作者名是上游用户可控的文本，放进系统提示
 *    等于给它系统级权威。
 *
 * ⚠ 许可那一行**不许省略**。省略会被读成「没有限制」，而这正是策略 C 明确
 * 要避免的读法：不知道就写 unknown，写出来。
 */

import { LORA_CANDIDATE_LIMITS } from '@/constants/lora-candidate'
import type { LoraCandidate } from '@/types/lora-candidate'

/** 许可渲染成一行。三种形态各自成句，⛔ 不合并、不省略、不软化 unknown。 */
function formatLicence(license: LoraCandidate['license']): string {
  if (!license.known) return 'licence: unknown (upstream states none)'
  if (license.label) return `licence: ${license.label}`

  // Civitai：没有许可名，只有作者勾的权限位 —— 如实说是「作者权限声明」，
  // 别把它叫作 licence name。
  const commercial = license.commercialUse?.length
    ? license.commercialUse.join(', ')
    : 'none allowed'
  const derivatives =
    license.allowDerivatives === null
      ? 'unknown'
      : license.allowDerivatives
        ? 'allowed'
        : 'not allowed'
  const credit =
    license.allowNoCredit === null
      ? 'unknown'
      : license.allowNoCredit
        ? 'not required'
        : 'required'
  return `licence: no licence name upstream; author permissions — commercial use: ${commercial}; derivatives: ${derivatives}; credit: ${credit}`
}

/** 名字/作者按上限截断 —— 与工作台状态块同一套 token 纪律。 */
function clampLabel(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > LORA_CANDIDATE_LIMITS.labelChars
    ? `${trimmed.slice(0, LORA_CANDIDATE_LIMITS.labelChars)}…`
    : trimmed
}

function formatCandidate(candidate: LoraCandidate, index: number): string {
  const lines = [`${index + 1}. id: ${candidate.candidateId}`]

  const head = [
    clampLabel(candidate.name),
    `by ${candidate.author ? clampLabel(candidate.author) : 'unknown author'}`,
    `base model: ${candidate.baseModelFamily ?? 'could not be determined'}`,
    `kind: ${candidate.type}`,
    `source: ${candidate.source}`,
  ].join(' · ')
  lines.push(`   ${head}`)

  const triggers = candidate.triggerWords.slice(
    0,
    LORA_CANDIDATE_LIMITS.maxPromptTriggerWords,
  )
  lines.push(
    `   trigger words: ${triggers.length ? triggers.join(', ') : 'none published'}`,
  )
  lines.push(`   ${formatLicence(candidate.license)}`)

  if (candidate.alreadyMounted) {
    lines.push(
      '   ALREADY MOUNTED on the workbench right now — the creator already has this one',
    )
  } else if (candidate.alreadyImported) {
    lines.push(
      '   already in the creator library (imported before, not mounted right now)',
    )
  }
  if (!candidate.importable) {
    lines.push(
      `   CANNOT BE IMPORTED (${candidate.notImportableReason}) — it can still be recommended, but only as something to open on its source page`,
    )
  }
  return lines.join('\n')
}

/**
 * 渲染成可直接拼进用户提示的一段。没有候选时返回空串（不塞空壳）。
 */
export function buildLoraCandidateBlock(
  candidates: readonly LoraCandidate[],
  query: string,
): string {
  if (candidates.length === 0) return ''
  const body = candidates
    .map((candidate, index) => formatCandidate(candidate, index))
    .join('\n')
  return `LORA CANDIDATES FOUND FOR THIS TURN (searched for: ${query}). These are real entries fetched just now — the ONLY ids you may use:
${body}`
}
