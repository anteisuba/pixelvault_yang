/**
 * 手机端镜头带视图（node-canvas-v2 §7.x）。< 768 宽时画布路由渲染的就是这一棵树。
 */

export {
  CanvasMobileRail,
  type CanvasMobileRailProps,
} from './CanvasMobileRail'
export {
  buildMobileRailLists,
  orderShots,
  isShotNode,
  type MobileRailLists,
} from './mobile-rail-model'
