export const LORA_WORKBENCH_SECTIONS = {
  MINE: 'mine',
  TRAIN: 'train',
  COMMUNITY: 'community',
} as const

export type LoraWorkbenchSection =
  (typeof LORA_WORKBENCH_SECTIONS)[keyof typeof LORA_WORKBENCH_SECTIONS]

export const LORA_WORKBENCH_SECTION_VALUES = Object.values(
  LORA_WORKBENCH_SECTIONS,
)

export const DEFAULT_LORA_WORKBENCH_SECTION = LORA_WORKBENCH_SECTIONS.MINE

export const LORA_WORKBENCH_SEARCH_PARAM = 'section'

export const CIVITAI_LORA_PAGE_SIZE = 10

export const CIVITAI_LORA_SORT_VALUES = [
  'Highest Rated',
  'Most Downloaded',
  'Newest',
] as const

export type CivitaiLoraSort = (typeof CIVITAI_LORA_SORT_VALUES)[number]

export const CIVITAI_LORA_SORT_OPTIONS = [
  { value: 'Highest Rated', labelKey: 'sortHighestRated' },
  { value: 'Most Downloaded', labelKey: 'sortMostDownloaded' },
  { value: 'Newest', labelKey: 'sortNewest' },
] as const satisfies readonly {
  value: CivitaiLoraSort
  labelKey: string
}[]

export const CIVITAI_LORA_BASE_MODEL_VALUES = [
  'all',
  'Flux.1 D',
  'SDXL 1.0',
  'Illustrious',
  'Pony',
  'SD 1.5',
  'Anima',
] as const

export type CivitaiLoraBaseModel =
  (typeof CIVITAI_LORA_BASE_MODEL_VALUES)[number]

export function isLoraWorkbenchSection(
  value: string | null,
): value is LoraWorkbenchSection {
  return (
    typeof value === 'string' &&
    (LORA_WORKBENCH_SECTION_VALUES as readonly string[]).includes(value)
  )
}

export function isCivitaiLoraSort(value: string): value is CivitaiLoraSort {
  return (CIVITAI_LORA_SORT_VALUES as readonly string[]).includes(value)
}

export function isCivitaiLoraBaseModel(
  value: string,
): value is CivitaiLoraBaseModel {
  return (CIVITAI_LORA_BASE_MODEL_VALUES as readonly string[]).includes(value)
}
