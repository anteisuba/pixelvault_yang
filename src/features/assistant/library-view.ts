import type {
  AssistantLibraryView,
  AssistantLibraryViewItem,
} from '@/types/assistant-operator'
import { ASSISTANT_NEXT_HANDLE_PREFIXES } from '@/features/assistant/constants'

/**
 * 库开着时，库里的东西在模型眼里叫什么（10-26 起；10-30 加画廊 / 音色 / 酒馆与「看屏」）。
 * ⭐ 板子那一句（`renderLibraryView`）与「看屏」小样图底下那一行（`assistant-screen.service`）
 *   共用这一份写法：同一格两处叫法不一样，模型就对不上号。
 */

/** 库在模型眼里叫什么（`AssistantLibraryView.library`）。 */
export const LIBRARY_VIEW_LABELS: Record<
  AssistantLibraryView['library'],
  string
> = {
  lora: 'LoRA library',
  tavern: 'Chub character-card library',
  tags: 'Danbooru tag library',
  voices: 'voice library',
  assets: 'asset library (their pictures)',
  cards: 'character library',
  prompts: 'saved-prompt library',
  gallery: 'gallery (public pictures by everyone)',
}

const LIBRARY_VIEW_PREFIXES: Record<
  Exclude<AssistantLibraryViewItem['kind'], 'picture'>,
  string
> = {
  character: ASSISTANT_NEXT_HANDLE_PREFIXES.character,
  lora: ASSISTANT_NEXT_HANDLE_PREFIXES.lora,
  prompt: ASSISTANT_NEXT_HANDLE_PREFIXES.prompt,
  tag: ASSISTANT_NEXT_HANDLE_PREFIXES.tag,
  gallery: ASSISTANT_NEXT_HANDLE_PREFIXES.gallery,
  voice: ASSISTANT_NEXT_HANDLE_PREFIXES.voice,
  tavern: ASSISTANT_NEXT_HANDLE_PREFIXES.tavern,
}

/** 一格的编号：图按身份段原样（`图_012`），其余带各自前缀。 */
export function libraryHandle(
  kind: AssistantLibraryViewItem['kind'],
  name: string,
): string {
  return kind === 'picture' ? name : `${LIBRARY_VIEW_PREFIXES[kind]}${name}`
}

/** 能 `look` 打开的那几类（酒馆卡只认得名字）。 */
export function libraryKindOpens(
  kind: AssistantLibraryViewItem['kind'],
): boolean {
  return kind !== 'tavern'
}

/**
 * 角色库开着时（角色大项目第 ⑩ 步）：改设定一律先出卡，图也用候选卡（`library.ts` 的
 * `proposesOnCharacterPage`）—— 说给模型听，免得它以为已经写进去了。
 */
const CHARACTER_PAGE_PROPOSALS =
  '\nOn the character library, nothing about a character is written straight away: character_profile shows the parts as a card the creator ticks (name and tags still change at once), propose_profile offers parts you researched or drafted (each with its source), propose_images offers pictures to put on the card (their picture numbers, or web finds "#3"). The turn ends on the card; say in one line what is on it.'

/**
 * 库开着时板子底下那一句（10-26）：助手仍是台的身份，看不见库 —— 用户说「这个角色」时
 * 指的就是库里点开的那一样，先 `look` 它再答。
 */
export function renderLibraryView(
  view: AssistantLibraryView | undefined,
): string {
  if (!view) return ''
  const where = `\nLIBRARY ON SCREEN: the creator has their ${LIBRARY_VIEW_LABELS[view.library]} open next to this chat`
  const screen =
    renderLibraryScreen(view.screen) +
    (view.library === 'cards' ? CHARACTER_PAGE_PROPOSALS : '')
  if (!view.item) return `${where}.${screen}`
  const handle = libraryHandle(view.item.kind, view.item.name)
  return `${where}, looking at ${handle}. When they say "this one", "her", "it" without naming it, they mean ${handle}: look ${handle} before you answer.${screen}`
}

/**
 * 屏上那一页（owner 10-28）：范围、搜索词、屏上那几样、多选了哪几样。更多的叫它 `find`。
 * ⭐ 10-30 起屏上那几样是发请求那一刻扫到的（`tiles`）：按位置编了号，与 `look 屏幕` 那张
 *   小样图上的号一一对应；带图的提醒它先看屏再认。
 */
function renderLibraryScreen(
  screen: AssistantLibraryView['screen'] | undefined,
): string {
  if (!screen) return ''
  const handles = (names: readonly string[]) =>
    names.map((name) => libraryHandle(screen.kind, name)).join(', ')
  const scanned = Boolean(screen.tiles?.length)
  const pictured = screen.tiles?.some((tile) => tile.thumb) ?? false
  const visible = screen.visible.length
    ? scanned
      ? `On their screen right now, numbered top-left first${screen.total === undefined ? '' : ` (${screen.total} in all)`}: ${screen.visible
          .map(
            (name, index) => `${index + 1} ${libraryHandle(screen.kind, name)}`,
          )
          .join(' · ')}.`
      : `On screen (first ${screen.visible.length}${screen.total === undefined ? '' : ` of ${screen.total}`}): ${handles(screen.visible)}.`
    : 'Nothing on screen.'
  const lines = [
    screen.scope ? `Showing: ${screen.scope}.` : '',
    screen.search ? `Search box: "${screen.search}".` : '',
    visible,
    screen.selected?.length
      ? `Selected by the creator: ${handles(screen.selected)}. "These" means them.`
      : '',
    pictured
      ? `To see their screen the way they see it, look ${ASSISTANT_NEXT_HANDLE_PREFIXES.screen}: one sheet with these tiles where they sit, numbered as above. When they point at what is on screen without naming it ("这边 / 屏上 / 哪张 / this one here / which of these"), look ${ASSISTANT_NEXT_HANDLE_PREFIXES.screen} first, then look the one you need by its name to see it big with its recipe.`
      : '',
  ].filter(Boolean)
  return `\n${lines.join('\n')}\nTo change what is on their screen (open one of them, search, switch section), call open with library.`
}
