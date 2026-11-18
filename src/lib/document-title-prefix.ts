/**
 * 给标签页标题钉一个前缀（「Denia · 角色 — ANTEI」），直到撤掉为止。
 *
 * ⚠ 为什么不是 `document.title = …` 一次了事（11-18）：页面的 `generateMetadata` 是异步的，
 *   Next 16 把 metadata 流式送进来 —— 直接打开 / 刷新带 `?character=` 的地址时，`<title>`
 *   常常在我们写完之后才落下来，把名字整个盖掉（「有时只剩『角色 — ANTEI』」）。所以看着 `<head>`：
 *   标题被别人改了就把前缀补回去。撤掉时只去掉自己那段前缀，⛔ 把「当时的标题」原样写回
 *   （那份可能就是还没落下的旧标题）。
 */
export function pinDocumentTitlePrefix(prefix: string): () => void {
  const head = `${prefix} · `
  const strip = (title: string) =>
    title.startsWith(head) ? title.slice(head.length) : title
  const apply = () => {
    if (!document.title.startsWith(head))
      document.title = `${head}${document.title}`
  }
  apply()
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => apply())
  observer?.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  return () => {
    observer?.disconnect()
    document.title = strip(document.title)
  }
}
