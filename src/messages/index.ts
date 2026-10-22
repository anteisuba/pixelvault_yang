/**
 * 三语文案入口：每个模块一个文件夹，三语并排（`<模块>/{en,ja,zh}.json`）。
 * 这里把各模块拼回每种语言一整份，命名空间与键名不变。
 * 新命名空间放进所属模块，并在同一个改动里三语一起加（frontend.md「i18n」）。
 */
import type { AppLocale } from '@/i18n/routing'

import commonEn from './common/en.json'
import marketingEn from './marketing/en.json'
import modelsEn from './models/en.json'
import studioEn from './studio/en.json'
import mediaEn from './media/en.json'
import canvasEn from './canvas/en.json'
import assistantEn from './assistant/en.json'
import promptsEn from './prompts/en.json'
import tagsEn from './tags/en.json'
import loraEn from './lora/en.json'
import charactersEn from './characters/en.json'
import galleryEn from './gallery/en.json'
import assetsEn from './assets/en.json'
import settingsEn from './settings/en.json'
import commonJa from './common/ja.json'
import marketingJa from './marketing/ja.json'
import modelsJa from './models/ja.json'
import studioJa from './studio/ja.json'
import mediaJa from './media/ja.json'
import canvasJa from './canvas/ja.json'
import assistantJa from './assistant/ja.json'
import promptsJa from './prompts/ja.json'
import tagsJa from './tags/ja.json'
import loraJa from './lora/ja.json'
import charactersJa from './characters/ja.json'
import galleryJa from './gallery/ja.json'
import assetsJa from './assets/ja.json'
import settingsJa from './settings/ja.json'
import commonZh from './common/zh.json'
import marketingZh from './marketing/zh.json'
import modelsZh from './models/zh.json'
import studioZh from './studio/zh.json'
import mediaZh from './media/zh.json'
import canvasZh from './canvas/zh.json'
import assistantZh from './assistant/zh.json'
import promptsZh from './prompts/zh.json'
import tagsZh from './tags/zh.json'
import loraZh from './lora/zh.json'
import charactersZh from './characters/zh.json'
import galleryZh from './gallery/zh.json'
import assetsZh from './assets/zh.json'
import settingsZh from './settings/zh.json'

export const en = {
  ...commonEn,
  ...marketingEn,
  ...modelsEn,
  ...studioEn,
  ...mediaEn,
  ...canvasEn,
  ...assistantEn,
  ...promptsEn,
  ...tagsEn,
  ...loraEn,
  ...charactersEn,
  ...galleryEn,
  ...assetsEn,
  ...settingsEn,
}

export const ja = {
  ...commonJa,
  ...marketingJa,
  ...modelsJa,
  ...studioJa,
  ...mediaJa,
  ...canvasJa,
  ...assistantJa,
  ...promptsJa,
  ...tagsJa,
  ...loraJa,
  ...charactersJa,
  ...galleryJa,
  ...assetsJa,
  ...settingsJa,
}

export const zh = {
  ...commonZh,
  ...marketingZh,
  ...modelsZh,
  ...studioZh,
  ...mediaZh,
  ...canvasZh,
  ...assistantZh,
  ...promptsZh,
  ...tagsZh,
  ...loraZh,
  ...charactersZh,
  ...galleryZh,
  ...assetsZh,
  ...settingsZh,
}

export type Messages = typeof en

export const MESSAGES: Record<AppLocale, Messages> = { en, ja, zh }
