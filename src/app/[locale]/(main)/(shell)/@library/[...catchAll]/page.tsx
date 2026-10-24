/**
 * 离开库：软跳转到别的地址时，没匹配上的一格会**留着上一次的内容**（Next 平行路由的规矩），
 * 所以用一条兜底把这一格清空，⛔ 库关不掉。
 */
export default function LibrarySlotCatchAll() {
  return null
}
