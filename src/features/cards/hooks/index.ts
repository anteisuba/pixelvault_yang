/**
 * 角色卡域的对外入口（客户端 hook）。只要 hook 时走这里，不会把角色卡的组件一起加载
 *（见 docs/design/features-migration.md）。
 */
export * from './use-character-cards'
export * from './use-voice-cards'
export * from './use-card-manager'
export * from './use-character-growth'
export * from './use-character-stickers'
export * from './use-character-recent-activity'
export * from './use-character-memories'
export {
  appendSlotSources,
  examplesToTavernText,
} from './use-character-card-editor'
export { useCharacterCardUsage } from './use-character-card-usage'
export {
  useCharacterLibrary,
  useCharacterLibraryCards,
} from './use-character-library'
export {
  useCharacterLoras,
  type UseCharacterLorasReturn,
} from './use-character-loras'
