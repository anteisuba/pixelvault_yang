import { fireEvent } from '@testing-library/react'

/**
 * 真的 Radix `DropdownMenu` 在 jsdom 里怎么开：触发器认的是 `pointerdown`（左键、不带
 * ctrl），⛔ 不认 `click`。组件测试用真菜单时拿它开，⛔ 再把菜单原语换成直通替身。
 */
export function openRadixMenu(trigger: Element): void {
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
}
