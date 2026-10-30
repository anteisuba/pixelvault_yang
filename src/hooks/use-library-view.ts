'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

import {
  STUDIO_LIBRARY_CATEGORY_IDS,
  type StudioShellOverlayId,
} from '@/constants/studio-shell'
import {
  ASSISTANT_LIBRARY_SCREEN_LIMIT,
  type AssistantLibraryShow,
  type AssistantLibraryView,
  type AssistantLibraryViewItem,
  type AssistantLibraryViewScreen,
} from '@/types/assistant-operator'
import { libraryItemShown } from '@/lib/assistant-workspace'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import { scanScreen } from '@/lib/assistant-screen-scan'

/**
 * 库开着、在看哪一样（10-26 用户在角色库开着 Denia 问「这个角色」，助手认不出）。
 *
 * ⭐ 库叠层里的页面不当宿主（`StudioOperatorDetachedScope`：⛔ 一打开库就掐掉台上那一轮），
 *   助手仍是底下那个台的身份 —— 所以库只往这里报一句，发请求时带上（`libraryView`）。
 * ⚠ 模块级：外壳那一份面板发请求时现读，⛔ 为它重渲染。点开的那一样由报它的页面卸掉时收回
 *   （⛔ 换类时在这里清：子页面的 effect 先于叠层的跑，会把新页刚报的清掉）。
 */
let library: AssistantLibraryView['library'] | null = null
let item: AssistantLibraryViewItem | null = null
let screen: AssistantLibraryViewScreen | null = null

/** 外壳的库叠层挂上 / 换类 / 收掉时调（「我的主页」不算库）。 */
export function setLibraryViewCategory(
  category: StudioShellOverlayId | null,
): void {
  const next =
    category &&
    (STUDIO_LIBRARY_CATEGORY_IDS as readonly string[]).includes(category)
      ? (category as AssistantLibraryView['library'])
      : null
  library = next
  if (pendingShow && pendingShow.library === next) flushShow()
}

/** 各库屏上那一页是哪一类东西：报上来的那一页对不上开着的库（换类时上一类还没卸）就不算。 */
const SCREEN_KIND_OF: Partial<
  Record<AssistantLibraryView['library'], AssistantLibraryViewScreen['kind']>
> = {
  assets: 'picture',
  cards: 'character',
  prompts: 'prompt',
  lora: 'lora',
  gallery: 'gallery',
  tags: 'tag',
  voices: 'voice',
  tavern: 'tavern',
}

/**
 * 页面报的那一页（范围 / 搜索 / 多选）叠上发请求这一刻扫到的屏上那几格（`scanScreen`）：
 * ⭐ 屏上有哪几样、在哪儿、长什么样以扫到的为准（你滚到哪儿就是哪儿）；没扫到格子才退回页面报的前几样。
 */
function currentScreen(): AssistantLibraryViewScreen | null {
  if (!library) return null
  const kind = SCREEN_KIND_OF[library] ?? null
  const reported = screen && kind === screen.kind ? screen : null
  const scanned = kind ? scanScreen(kind) : null
  if (!scanned) return reported
  return {
    ...(reported ?? {}),
    kind: scanned.kind,
    visible: scanned.visible,
    tiles: scanned.tiles,
    viewport: scanned.viewport,
  }
}

/** 发请求时现读：库没开 = `null`。 */
export function readLibraryView(): AssistantLibraryView | null {
  if (!library) return null
  const shown = currentScreen()
  return {
    library,
    ...(item ? { item } : {}),
    ...(shown ? { screen: shown } : {}),
  }
}

/**
 * 库里各页报「点开了哪一样」；`null` = 没点开。卸掉 / 换一样时收回自己报的那一条。
 * ⚠ 挑选框里也会挂同一个组件：库没开时 `readLibraryView` 本来就回 `null`，报了也不发。
 */
export function useReportLibraryItem(
  next: AssistantLibraryViewItem | null,
): void {
  const kind = next?.kind ?? null
  const name = next?.name ?? null
  useEffect(() => {
    if (!kind || !name) return
    const mine: AssistantLibraryViewItem = { kind, name }
    item = mine
    return () => {
      if (item === mine) item = null
    }
  }, [kind, name])
}

const SCREEN_NAME_MAX = 200
const SCREEN_SCOPE_MAX = 400

function screenNames(names: readonly string[]): string[] {
  return names
    .map((name) => name.trim().slice(0, SCREEN_NAME_MAX))
    .filter(Boolean)
    .slice(0, ASSISTANT_LIBRARY_SCREEN_LIMIT)
}

function sanitizeScreen(
  screen: AssistantLibraryViewScreen,
): AssistantLibraryViewScreen {
  const search = screen.search?.trim().slice(0, SCREEN_NAME_MAX)
  return {
    ...screen,
    ...(screen.scope
      ? { scope: screen.scope.trim().slice(0, SCREEN_SCOPE_MAX) }
      : {}),
    ...(search ? { search } : { search: undefined }),
    visible: screenNames(screen.visible),
    ...(screen.selected ? { selected: screenNames(screen.selected) } : {}),
  }
}

/**
 * 库里各页报「屏上那一页」（owner 10-28）：哪一格 / 夹、搜了什么、屏上前几样、多选了哪几样。
 * ⚠ 按内容比较（键拼成一串），列表每次渲染换新数组也不会反复登记。
 */
export function useReportLibraryScreen(
  next: AssistantLibraryViewScreen | null,
): void {
  // ⚠ 名字为空的那几样（没起名的提示词…）不报，过长的截断：一格不合规整条请求会被拒。
  const key = next ? JSON.stringify(sanitizeScreen(next)) : null
  useEffect(() => {
    if (!key) return
    const mine = JSON.parse(key) as AssistantLibraryViewScreen
    screen = mine
    return () => {
      if (screen === mine) screen = null
    }
  }, [key])
}

/**
 * 库变了（助手改了库 / 撤销了一条）：开着的那一页重读（owner 10-28「刷新」）。
 * ⭐ 不走宿主：库叠层里的页面不当宿主，手里那份只能靠这个信号重读。
 */
type LibraryChangeListener = () => void
const changeListeners = new Map<
  AssistantLibraryView['library'],
  Set<LibraryChangeListener>
>()

export function notifyLibraryChanged(
  target: AssistantLibraryView['library'],
): void {
  changeListeners.get(target)?.forEach((listener) => listener())
}

export function useLibraryChanged(
  target: AssistantLibraryView['library'],
  refresh: () => void,
): void {
  const latest = useRef(refresh)
  useEffect(() => {
    latest.current = refresh
  }, [refresh])
  useEffect(() => {
    const listener = () => latest.current()
    let set = changeListeners.get(target)
    if (!set) {
      set = new Set()
      changeListeners.set(target, set)
    }
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }, [target])
}

/**
 * 助手「翻给你看」（`open` 的库那一支，owner 10-28）：换到那个库、打开那一样 / 搜那个词。
 * ⭐ 页面挂上（或已开着）时自己接走；接走之前 `libraryShowSettled` 一直是 `false`，
 *   面板据此等页面翻好、带着新的屏上那一页接着发。
 */
let pendingShow: AssistantLibraryShow | null = null
let showDone = true
type ShowListener = (show: AssistantLibraryShow) => void
const showListeners = new Map<AssistantLibraryView['library'], ShowListener>()

function flushShow(): void {
  if (!pendingShow) return
  const listener = showListeners.get(pendingShow.library)
  if (!listener) return
  const show = pendingShow
  pendingShow = null
  listener(show)
  showDone = true
}

/** 库是助手翻开的：叠层挂上时把对话一起叫出来（⛔ 库盖上来、对话收着，看不见它接着说）。 */
let openedByAssistant = false

export function requestLibraryShow(show: AssistantLibraryShow): void {
  pendingShow = show
  showDone = false
  if (library === show.library) flushShow()
  else openedByAssistant = true
}

/** 叠层挂上时问一次：这次是不是助手翻开的（问过就清）。 */
export function takeLibraryOpenedByAssistant(): boolean {
  const opened = openedByAssistant
  openedByAssistant = false
  return opened
}

/**
 * 翻好了没有：页面接走了、库也是那一个，且屏上那一页已经是翻过去的样子（打开的那一样、搜索词）；
 * `timedOut` = 等够了，页面接走了就算（找不到那一样也照实接着发）。
 */
export function libraryShowSettled(
  target: AssistantLibraryShow,
  timedOut: boolean,
): boolean {
  if (!showDone || pendingShow !== null || library !== target.library)
    return false
  if (timedOut) return true
  // 页面还在取（屏上那一页没报）就再等等，⛔ 拿一页空的接着发。
  const shown = currentScreen()
  if (!shown) return false
  if (target.search && shown.search !== target.search) return false
  const view = readLibraryView()
  return !target.itemName || (!!view && libraryItemShown(target.itemName, view))
}

export function useLibraryShowRequest(
  target: AssistantLibraryView['library'],
  apply: (show: AssistantLibraryShow) => void,
): void {
  const latest = useRef(apply)
  useEffect(() => {
    latest.current = apply
  }, [apply])
  useEffect(() => {
    showListeners.set(target, (show) => latest.current(show))
    if (pendingShow?.library === target && library === target) flushShow()
    return () => {
      showListeners.delete(target)
    }
  }, [target])
}

type CardsHands = NonNullable<StudioOperatorApplyContext['cards']>

/**
 * 角色库里那两只落笔的手（角色大项目第 ⑩ 步）：角色库开着时助手改设定先出提议卡 / 候选图卡，
 * 可外壳那份面板的宿主是底下的台、没有角色页那只手 —— 点「收下」时到这里借（`readLibraryCardHands`）。
 * ⚠ 模块级，同 `item`：角色页挂着时报、卸掉时收回；`nameOf` 给卡上写她叫什么。
 */
export interface LibraryCardHands extends CardsHands {
  nameOf(characterId: string): string | null
}

let cardHands: LibraryCardHands | null = null

export function useReportLibraryCardHands(hands: LibraryCardHands): void {
  const latest = useRef(hands)
  useEffect(() => {
    latest.current = hands
  })
  useEffect(() => {
    const mine: LibraryCardHands = {
      applyProfile: (...args) => latest.current.applyProfile(...args),
      attachImages: (...args) => latest.current.attachImages(...args),
      nameOf: (id) => latest.current.nameOf(id),
    }
    cardHands = mine
    return () => {
      if (cardHands === mine) cardHands = null
    }
  }, [])
}

/** 收下提议卡时现读：角色页没挂着 = `null`。 */
export function readLibraryCardHands(): LibraryCardHands | null {
  return cardHands
}

/**
 * 库页给助手的起手药丸（第 ⑩ 步「缺什么出什么」）：报了就顶掉台上那几颗，`null` = 不管。
 * ⚠ 面板要跟着重画（打开另一位、补齐了一格），所以这一份带订阅。
 */
let libraryPills: readonly string[] | null = null
const pillListeners = new Set<() => void>()

function subscribePills(listener: () => void): () => void {
  pillListeners.add(listener)
  return () => pillListeners.delete(listener)
}

function setLibraryPills(next: readonly string[] | null): void {
  libraryPills = next
  for (const listener of pillListeners) listener()
}

export function useReportLibraryPills(next: readonly string[] | null): void {
  const key = next ? JSON.stringify(next) : null
  useEffect(() => {
    if (key === null) return
    const mine = JSON.parse(key) as string[]
    setLibraryPills(mine)
    return () => {
      if (libraryPills === mine) setLibraryPills(null)
    }
  }, [key])
}

export function useLibraryPills(): readonly string[] | null {
  return useSyncExternalStore(
    subscribePills,
    () => libraryPills,
    () => null,
  )
}
