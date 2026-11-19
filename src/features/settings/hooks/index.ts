/**
 * settings 域的对外入口 —— 客户端 hook（只要 hook 时走这里，不会把设置页组件一起加载）
 *（见 docs/design/features-migration.md）。
 */
export {
  useGenerationCompleteNotifier,
  useReduceMotionPreference,
} from './use-app-preference-effects'
