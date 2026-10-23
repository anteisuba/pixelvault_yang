/**
 * SKILL.md（Agent Skills 开放格式，Claude / Codex / ChatGPT 通用）的读与写（第 7b 步）。
 *
 * 一份 = 开头一段 YAML（`name`、`description`，可选 `metadata`）+ 下面的 Markdown 正文。
 * ⚠ 只认这个格式用到的那一小块 YAML：顶层标量 + `metadata` 下一层标量。别的键原样忽略，
 *   ⛔ 不为它引一个 YAML 库。写出去时标量一律单引号包住，冒号、引号都安全。
 */

export interface SkillMd {
  readonly name: string
  readonly description: string
  readonly metadata: Readonly<Record<string, string>>
  readonly body: string
}

/** 标准对 name 的要求：小写字母、数字、连字符，首尾不是连字符，≤64。 */
export const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

function unquote(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replace(/''/g, "'")
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
    return value
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\')
  return value
}

function quote(value: string): string {
  return `'${value.replace(/\s*\n\s*/g, ' ').replace(/'/g, "''")}'`
}

/** 读一份 SKILL.md；没有开头那段、或缺 name / description 回 null。 */
export function parseSkillMd(text: string): SkillMd | null {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return null
  const top: Record<string, string> = {}
  const metadata: Record<string, string> = {}
  let inMetadata = false
  for (const line of match[1]!.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const nested = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (nested && inMetadata) {
      metadata[nested[1]!] = unquote(nested[2]!)
      continue
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!pair) continue
    inMetadata = pair[1] === 'metadata' && pair[2]!.trim() === ''
    if (!inMetadata) top[pair[1]!] = unquote(pair[2]!)
  }
  if (!top.name || !top.description) return null
  return {
    name: top.name,
    description: top.description,
    metadata,
    body: match[2]!.replace(/^\s*\n/, '').trimEnd(),
  }
}

/** 写成一份标准 SKILL.md（导出用）。 */
export function serializeSkillMd(skill: SkillMd): string {
  const metadata = Object.entries(skill.metadata)
  return `---
name: ${skill.name}
description: ${quote(skill.description)}${
    metadata.length
      ? `\nmetadata:\n${metadata.map(([key, value]) => `  ${key}: ${quote(value)}`).join('\n')}`
      : ''
  }
---

${skill.body.trimEnd()}
`
}
