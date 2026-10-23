import { serializeSkillMd } from '@/lib/skill-md'
import type { AssistantSkillView } from '@/types/assistant-skill'

/**
 * 一份技能导出成标准包（第 7b 步）：`<目录名>/SKILL.md` + `references/…`，打成 zip。
 * 拿到 Claude / ChatGPT / Codex 里直接能用；中文名放 `metadata.title`，回 ANTEI 认得出。
 */

export function skillExportFiles(
  skill: AssistantSkillView,
): Record<string, string> {
  return {
    [`${skill.slug}/SKILL.md`]: serializeSkillMd({
      name: skill.slug,
      description: skill.description,
      metadata: { title: skill.name },
      body: skill.body,
    }),
    ...Object.fromEntries(
      Object.entries(skill.references).map(([path, text]) => [
        `${skill.slug}/${path}`,
        text,
      ]),
    ),
  }
}

/** 浏览器里打包并下载（jszip 动态引，⛔ 进首屏包）。 */
export async function downloadSkillZip(
  skill: AssistantSkillView,
): Promise<void> {
  if (typeof document === 'undefined') return
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const [path, text] of Object.entries(skillExportFiles(skill)))
    zip.file(path, text)
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${skill.slug}.zip`
  anchor.click()
  URL.revokeObjectURL(url)
}
