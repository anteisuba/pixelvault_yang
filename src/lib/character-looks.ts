/**
 * 造型的显示名（角色④）：起了名用名字；没起名的默认造型叫「默认」，其他叫「造型 N」
 * （N = 在她造型里的位次）。翻译由调用方传进来（`CharacterLooks` 命名空间）。
 */
export function lookLabel(
  look: { id: string; label: string | null; isDefault: boolean },
  looks: readonly { id: string }[],
  t: (key: 'default' | 'numbered', values?: { n: number }) => string,
): string {
  if (look.label) return look.label
  if (look.isDefault) return t('default')
  return t('numbered', {
    n: looks.findIndex((item) => item.id === look.id) + 1,
  })
}
