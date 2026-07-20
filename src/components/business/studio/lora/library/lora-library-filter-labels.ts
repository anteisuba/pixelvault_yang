import type { LoraContentType, LoraLibraryFamily } from '@/constants/lora'

// R1 库聚焦浏览：类型/底模从 chip 行改成下拉（LoraLibraryFilterCombobox）后，
// civitai/HF 两个 pane 都要把可选值集合翻译成 {value,label} 选项——label key
// 集中在这里，两 pane 共用，避免各写一份漂移（原来分散在
// ContentTypeChipRow / FamilyChipRow 的 module-local 常量里）。

export const LORA_CONTENT_TYPE_LABEL_KEYS: Record<LoraContentType, string> = {
  all: 'typeAll',
  character: 'typeCharacter',
  clothing: 'typeClothing',
  expression: 'typeExpression',
  pose: 'typePose',
  style: 'typeStyle',
  concept: 'typeConcept',
  scene: 'typeScene',
}

export const LORA_LIBRARY_FAMILY_LABEL_KEYS: Record<LoraLibraryFamily, string> =
  {
    all: 'familyLabel.all',
    illustrious: 'familyLabel.illustrious',
    flux: 'familyLabel.flux',
    sdxl: 'familyLabel.sdxl',
    pony: 'familyLabel.pony',
    sd15: 'familyLabel.sd15',
    anima: 'familyLabel.anima',
    qwen: 'familyLabel.qwen',
    'z-image': 'familyLabel.zImage',
    chroma: 'familyLabel.chroma',
    other: 'familyLabel.other',
  }
