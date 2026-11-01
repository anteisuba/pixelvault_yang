/**
 * 素材域的对外入口（客户端）。域外只从这里引，⛔ 直引域内文件
 *（见 docs/design/features-migration.md）。
 */
export { AssetDetailContent } from './components/AssetDetailContent'
export { AssetFacetBar } from './components/AssetFacetBar'
export {
  AssetPickerFolderNav,
  type PickerScope,
} from './components/AssetPickerFolderNav'
export { AssetSelectorDialog } from './components/AssetSelectorDialog'
export { KreaAssetBrowser } from './components/KreaAssetBrowser'
