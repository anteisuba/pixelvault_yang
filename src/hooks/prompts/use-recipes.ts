'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { listRecipesAPI } from '@/lib/api-client/recipes'
import { deferToIdle } from '@/lib/defer-to-idle'
import type { RecipeRecord } from '@/types'

/**
 * 「我的模板」列表 = 一份**会话内共享**的缓存（owner 2026-09-26「模板加载慢」）。
 *
 * 此前每次打开模板弹层都从零拉整张表、拉完之前整块转圈；而那张表一次要 1–2 秒
 * （冷库时十几秒，封面要去 Generation 里按 JSON 字段找第一张图）。现在：
 *  · 工作台一挂上模板那颗 chip 就在空闲时先拉一遍（`prefetchRecipes`，会话内一次）；
 *  · 打开时手上已有列表就直接画，同时后台再拉一遍（stale-while-revalidate），拉回来
 *    原地换 —— 转圈只剩「一条都还没拿到」那一次；
 *  · 同一时刻只有一次在飞，几颗 chip 同时挂着也只拉一遍。
 */
interface RecipesSnapshot {
  recipes: RecipeRecord[]
  /** 至少成功拉到过一次完整的表。 */
  loaded: boolean
  isLoading: boolean
  error: boolean
}

const EMPTY_SNAPSHOT: RecipesSnapshot = {
  recipes: [],
  loaded: false,
  isLoading: false,
  error: false,
}

let snapshot = EMPTY_SNAPSHOT
let inflight: Promise<void> | null = null
/** 在飞那一轮拉回来之前新存的模板：列表换新时并进去，⛔ 不许被旧表冲掉。 */
let additions: RecipeRecord[] = []
/** 这一会话里删掉的：在飞那一轮拉回来的表里还有它们，⛔ 不许被带回来。 */
let removedIds = new Set<string>()
/** 每次重置加一：重置之前发出的请求落地时不许写回来。 */
let epoch = 0
const listeners = new Set<() => void>()

function setSnapshot(patch: Partial<RecipesSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function loadAllRecipes(): Promise<RecipeRecord[]> {
  const loaded: RecipeRecord[] = []
  for (let page = 1; ; page++) {
    const result = await listRecipesAPI(page, 50)
    if (!result.success || !result.data) throw new Error('Recipe load failed')
    loaded.push(...result.data.recipes)
    if (loaded.length >= result.data.total) return loaded
    // 服务端说还有，却给了空页 —— 当成失败，⛔ 不把半张表当整张。
    if (result.data.recipes.length === 0)
      throw new Error('Incomplete recipe list')
  }
}

export function refreshRecipes(): Promise<void> {
  if (inflight) return inflight
  const startedIn = epoch
  setSnapshot({ isLoading: true, error: false })
  const run = loadAllRecipes()
    .then((loaded) => {
      if (startedIn !== epoch) return
      const merged = new Map(
        loaded
          .filter((recipe) => !removedIds.has(recipe.id))
          .map((recipe) => [recipe.id, recipe]),
      )
      for (const recipe of additions) merged.set(recipe.id, recipe)
      additions = []
      setSnapshot({ recipes: [...merged.values()], loaded: true })
    })
    .catch(() => {
      if (startedIn === epoch) setSnapshot({ error: true })
    })
    .finally(() => {
      if (startedIn !== epoch) return
      inflight = null
      setSnapshot({ isLoading: false })
    })
  inflight = run
  return run
}

/** 空闲时先拉一遍（会话内一次）。返回取消函数，给挂载它的 effect 用。 */
export function prefetchRecipes(): () => void {
  if (snapshot.loaded || inflight) return () => {}
  return deferToIdle(() => {
    if (!snapshot.loaded && !inflight) void refreshRecipes()
  })
}

function addRecipe(recipe: RecipeRecord): void {
  additions.push(recipe)
  setSnapshot({
    recipes: [
      recipe,
      ...snapshot.recipes.filter((item) => item.id !== recipe.id),
    ],
  })
}

/** 改过名的那一份原地换掉（在飞的那一轮拉回来时也以它为准）。 */
function replaceRecipe(recipe: RecipeRecord): void {
  additions = [...additions.filter((item) => item.id !== recipe.id), recipe]
  setSnapshot({
    recipes: snapshot.recipes.map((item) =>
      item.id === recipe.id ? recipe : item,
    ),
  })
}

/** 删掉的那一条先从表里拿掉（乐观）；删失败时用 `restoreRecipe` 放回来。 */
function removeRecipe(id: string): void {
  removedIds.add(id)
  additions = additions.filter((item) => item.id !== id)
  setSnapshot({ recipes: snapshot.recipes.filter((item) => item.id !== id) })
}

function restoreRecipe(recipe: RecipeRecord): void {
  removedIds.delete(recipe.id)
  setSnapshot({
    recipes: [
      ...snapshot.recipes.filter((item) => item.id !== recipe.id),
      recipe,
    ],
  })
}

export function __resetRecipesCacheForTests(): void {
  epoch++
  snapshot = EMPTY_SNAPSHOT
  inflight = null
  additions = []
  removedIds = new Set()
}

export function useRecipes(enabled = true) {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY_SNAPSHOT,
  )

  // 打开时总要再拉一遍（别处改过模板这里才看得见）；手上有列表就照画着等。
  useEffect(() => {
    if (enabled) void refreshRecipes()
  }, [enabled])

  return {
    recipes: state.recipes,
    /** 只在一条都还没拿到时算「加载中」—— 后台刷新 ⛔ 不让列表换成转圈。 */
    isLoading: state.isLoading && !state.loaded,
    /** 同理：手上有列表时后台那一次失败不报错，照旧画着上一份。 */
    error: state.error && !state.loaded,
    refresh: refreshRecipes,
    addRecipe,
    replaceRecipe,
    removeRecipe,
    restoreRecipe,
  }
}
