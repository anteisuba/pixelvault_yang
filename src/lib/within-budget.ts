/**
 * 最多等 `budgetMs`：到点没回来就回 `fallback`，`work` 照跑（它的结果多半进了缓存，下一次用得上）。
 * 字面结果已经排满时给按意思那边用（语义检索，见 docs/references/semantic-search.md）。
 */
export async function withinBudget<T>(
  work: Promise<T>,
  budgetMs: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = Symbol('late')
  const result = await Promise.race([
    work,
    new Promise<typeof late>((resolve) => {
      timer = setTimeout(() => resolve(late), budgetMs)
    }),
  ])
  clearTimeout(timer)
  return result === late ? fallback : result
}
