const TEMPLATE_NAME_MAX_LENGTH = 48

/** 存模板时没起名：取提示词第一行，过长截断。 */
export function getDefaultTemplateName(prompt: string): string {
  const firstLine = prompt
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstLine) return ''

  const normalized = firstLine.replace(/\s+/g, ' ')
  return normalized.length > TEMPLATE_NAME_MAX_LENGTH
    ? `${normalized.slice(0, TEMPLATE_NAME_MAX_LENGTH)}...`
    : normalized
}
