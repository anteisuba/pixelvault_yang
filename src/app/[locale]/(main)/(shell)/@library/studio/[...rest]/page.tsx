/**
 * 离开库：软跳转到别的地址时，没匹配上的一格会**留着上一次的内容**（Next 平行路由的规矩），
 * 所以台的所有地址都在这一格挂一页空的，把它清空，⛔ 库关不掉。
 * ⚠ 不能用 `@library/[...x]` 一把兜：会和 `[locale]/[...rest]`（404）撞成同一条路由，构建直接失败。
 */
export default function LibrarySlotStudio() {
  return null
}
