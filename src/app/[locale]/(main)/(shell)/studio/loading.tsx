/**
 * 换台 / 开台时新台还没到的那一拍：台那一栏先空着跟着滑进来（点下去立刻有反应），
 * 到了再填上。⛔ 画骨架 —— 原来那份是改版前侧栏的样子，换台时闪一下旧界面（10-26）。
 */
export default function StudioLoading() {
  return <div data-shell-loading aria-busy="true" className="h-full" />
}
