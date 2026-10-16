'use client'

/**
 * **找到的图**（联网候选 · 拍板 21 · 切片 3b → 搜索期切片 1 → 胶片条，2026-10-16）。
 *
 * ── 搜索期切片 1：它是答案的一部分，⛔ 不是过程 ────────────────────
 * 附录 I §四：搜到的东西摆在**回答正文下面**（与来源卡同一格，面板经
 * `StudioOperatorMessageBody.webFinds` 交进来；找到的视频排在它下面，见
 * `StudioOperatorWebVideoRow`），⛔ 不再折进步骤组 —— 之前它长在
 * 日志条里，组默认收起、一轮收尾后整个过程区又被收掉，找到的图于是看不见。
 * 过程那一行只剩一句「搜索 Google 图片：… · 8 张」（`StudioOperatorLogItem`）。
 * 还没等到回答（还在搜 / 回答还在写 / 这一轮停了）时面板把它就地画在那一块里，
 * 同一个 `entryId` 当 key —— 灰块 → 图 → 搬到回答底下，已挂上的不丢。
 *
 * ── 胶片条（owner 2026-10-16 在三个方向里选 B，配色跟项目走）────────
 *  · 一条横排，按原比例分三档宽（竖 / 方 / 横，`tileWidthClass`），同一个高度；
 *    放不下就左右滑（`snap-x`），几张放得下就不滑。
 *  · 左上 `#n`（与回复里的 `#3` 对得上）· 右上**选择圈**（44px 命中区）· 回复点名的
 *    左下写「回复提到」，外圈细黑框照旧（`operatorFindRingClass`）。
 *  · 卡下两行：**来源网站**（发布者，点它开原页）+ 域名，再一行这一张的状态（能用 /
 *    已选 / 已挂上 / 收进中 / 只能看原页 / 没取回来的原因）。
 *  · 底下一条：已选几张、参考位还空几个、「挂上 N 张」。
 *
 * ── 拍板 21：看与选是两件事 ──────────────────────────────────────
 *  · 点图 = 开灯箱看**原图**（取不到退缩略图），零入库；
 *  · 点圈 = 只是**选上**（这一格自己的状态，⛔ 不发请求）；点「挂上 N 张」才导入进
 *    素材库并挂上。已挂上的再点圈 = 取下（并从素材库清掉，hook 那头的规矩）。
 * 🔬 owner 2026-08-31 真机打回的就是这两件事合成一个手势：**浏览即采购**。
 *
 * ⚠ 选上的那几张是本组件自己的状态：回答写完、整条从工具步搬到回答底下时会重新挂载，
 *   选了还没挂上的要再选一次（已挂上的在 hook 里，不丢）。
 * ⚠ 名额在这里先卡住：选满了再点圈只提示「参考位满了」，⛔ 不走 hook「满了换掉最早
 *   那张」那一支 —— 一次挂好几张时，悄悄换掉一张已挂上的读起来就是丢图。
 */

import { useState } from 'react'
import { Check, ExternalLink, ImageOff, Pin } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS } from '@/constants/studio-assistant-operator'
import {
  WEB_IMAGE_SOURCE_NOT_USABLE_MESSAGE_KEYS,
  WEB_IMAGE_SOURCE_VERDICT_IDS,
} from '@/constants/web-image-sources'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import {
  operatorFindCardProps,
  operatorFindRingClass,
  useOperatorFindHighlighted,
} from '@/components/business/studio/assistant-operator/StudioOperatorFindRef'
import { revealStep, useMediaReveal } from '@/components/ui/load-reveal'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { operatorFindKey } from '@/lib/studio-operator-timeline'
import { cn } from '@/lib/utils'
import type { AssistantOperatorWebImage } from '@/types/assistant-operator'
import { useThirdPartyImage } from '@/hooks/use-third-party-image'
import type {
  StudioOperatorWebImportPick,
  StudioOperatorWebImportState,
} from '@/hooks/use-studio-operator-web-import'

/** 一张都没选时共用这一份，⛔ 别写成行内 `[]`（每次 render 换引用）。 */
const NO_PICKS: readonly StudioOperatorWebImportPick[] = []
const NO_NAMED: ReadonlySet<string> = new Set()
const NO_STAGED: ReadonlySet<string> = new Set()

/** 长宽比差多少算竖 / 横（宽 / 高）；中间那一段都画成方的。 */
const PORTRAIT_BELOW = 0.87
const LANDSCAPE_ABOVE = 1.15

/**
 * 同一个高度（`h-44`），宽按原比例落三档：竖 `w-32` · 方 `w-44` · 横 `w-64`；
 * 量不到尺寸的按竖图（找参考图多半是立绘）。⛔ 不按像素算宽：那要写任意值。
 */
function tileWidthClass(image: AssistantOperatorWebImage): string {
  if (!image.width || !image.height) return 'w-32'
  const ratio = image.width / image.height
  if (ratio < PORTRAIT_BELOW) return 'w-32'
  if (ratio > LANDSCAPE_ABOVE) return 'w-64'
  return 'w-44'
}

type TileState = 'idle' | 'staged' | 'importing' | 'imported' | 'error'

interface StudioOperatorWebCandidateGridProps {
  /** ⚠ 选用认的是**线程里这一条的 id**，不是 `step.id`。 */
  entryId: string
  /** 这一次搜的什么 —— 头上那一行「搜索 Google 图片：… · N 张」。 */
  query: string
  /**
   * 找到的图；`null` = **还在搜**：画同形状的灰块（`placeholderCount` 格），
   * ⛔ 呼吸闪烁（ui-defaults 加载态）。
   */
  images: readonly AssistantOperatorWebImage[] | null
  /** 还在搜时画几格灰块 —— 这一步要了几张（`payload.limit`）。 */
  placeholderCount?: number
  /** 这一条上的选用态。`undefined` = 一张都还没挂。 */
  webImport: StudioOperatorWebImportState | undefined
  /** 一行最多能挂几张（工作台参考位上限）；0 = 只能看。 */
  limit: number
  onToggle(entryId: string, image: AssistantOperatorWebImage): void
  /**
   * 回复点名的那几张（`operatorFindKey`，搜索期第三片）：常驻一圈细黑框 +「回复提到」。
   * 缺席 = 一张都没点名。
   */
  namedFinds?: ReadonlySet<string>
}

export function StudioOperatorWebCandidateGrid({
  entryId,
  query,
  images,
  placeholderCount = ASSISTANT_OPERATOR_LIMITS.maxWebImageResults,
  webImport,
  limit,
  onToggle,
  namedFinds = NO_NAMED,
}: StudioOperatorWebCandidateGridProps) {
  const t = useTranslations('StudioOperator')
  /** 选上、还没挂上的那几张（原图地址），按选的先后。 */
  const [staged, setStaged] = useState<readonly string[]>([])
  const [fullNotice, setFullNotice] = useState(false)

  /** §四「先给 8 张」。 */
  const shown = images?.slice(0, ASSISTANT_OPERATOR_LIMITS.maxWebImageResults)
  const picks = webImport?.picks ?? NO_PICKS
  const pickOf = (image: AssistantOperatorWebImage) =>
    picks.find((pick) => pick.imageUrl === image.imageUrl)
  const occupied = picks.filter((pick) => pick.status !== 'error').length
  const importingCount = picks.filter(
    (pick) => pick.status === 'importing',
  ).length
  /**
   * 已经挂上 / 在飞的那张不算「选上」（宿主那头先变了：选上之后又从别处挂上）。
   * ⚠ 只认这一次还画着的图：搜索结果换了，旧的选择作废。按选的先后（挂的先后也是它）。
   */
  const stagedImages = staged.flatMap((url) => {
    const image = shown?.find((item) => item.imageUrl === url)
    if (!image) return []
    const status = pickOf(image)?.status
    return status === 'imported' || status === 'importing' ? [] : [image]
  })
  const stagedSet: ReadonlySet<string> = stagedImages.length
    ? new Set(stagedImages.map((image) => image.imageUrl))
    : NO_STAGED
  const free = Math.max(0, limit - occupied - stagedImages.length)
  /**
   * 宿主**没有参考位**（角色页，卡片助手 C3）：这一条只能看、不能选 —— 那里挑图走
   * 助手交出来的候选卡（`StudioOperatorCharacterImagesCard`），选中的挂到角色上。
   * ⛔ 不留一颗点了会导进素材库却挂不到任何地方的圈。
   */
  const pickable = limit > 0

  if (shown && shown.length === 0) return null

  const toggleStage = (image: AssistantOperatorWebImage) => {
    const status = pickOf(image)?.status
    if (status === 'importing') return
    // 已挂上：取下（hook 摘附件 + 清素材）。
    if (status === 'imported') {
      setFullNotice(false)
      onToggle(entryId, image)
      return
    }
    if (stagedSet.has(image.imageUrl)) {
      setFullNotice(false)
      setStaged((current) => current.filter((url) => url !== image.imageUrl))
      return
    }
    if (free <= 0) {
      setFullNotice(true)
      return
    }
    setFullNotice(false)
    setStaged((current) => [...current, image.imageUrl])
  }

  /**
   * 「挂上 N 张」：选上的那几张一起交给 hook。
   * ⚠ `toggleCandidate` 每次读的是同一帧里还没更新的选用态，所以名额必须在这里先卡好
   *   （上面 `free` 就是）—— 交过去的每一张都走「没挂过 → 导入」或「上次失败 → 重试」。
   */
  const commit = () => {
    if (!stagedImages.length || importingCount > 0) return
    for (const image of stagedImages) onToggle(entryId, image)
    setStaged([])
    setFullNotice(false)
  }

  /** 「全选能用的」：没挂上、没选上、能当输入的，按名额从前往后选。 */
  const selectable = (shown ?? []).filter((image) => {
    if (!image.usableAsInput || stagedSet.has(image.imageUrl)) return false
    const status = pickOf(image)?.status
    return status !== 'imported' && status !== 'importing'
  })
  const selectAll = () => {
    const room = selectable.slice(0, free)
    if (!room.length) {
      setFullNotice(true)
      return
    }
    setStaged((current) => [...current, ...room.map((image) => image.imageUrl)])
    setFullNotice(selectable.length > room.length)
  }

  /** 不可作输入的理由，按判据合并：一种理由一行，前面写是哪几个站。 */
  const blockedNotes = new Map<string, string[]>()
  if (pickable) {
    for (const image of shown ?? []) {
      if (image.usableAsInput) continue
      const key = WEB_IMAGE_SOURCE_NOT_USABLE_MESSAGE_KEYS[image.sourceVerdict]
      const domain = image.domain ?? t('web.publisherUnknown')
      const domains = blockedNotes.get(key) ?? []
      if (!domains.includes(domain)) domains.push(domain)
      blockedNotes.set(key, domains)
    }
  }

  /** 底下那条写什么：在飞 > 选上了几张 > 参考位满了 > 怎么选。 */
  const bar = (() => {
    if (importingCount > 0)
      return { title: t('web.barImporting', { count: importingCount }) }
    if (stagedImages.length)
      return {
        title: t('web.barStaged', { count: stagedImages.length }),
        sub:
          fullNotice && free === 0
            ? t('web.barNoRoomStaged')
            : t('web.barRoomCommit', { free }),
      }
    if (limit - occupied <= 0)
      return {
        title: t('web.barFull', { limit }),
        sub: t('web.barFullHint'),
      }
    return { title: t('web.barIdle'), sub: t('web.barRoom', { free }) }
  })()

  return (
    <section
      className="min-w-0"
      data-testid="operator-web-candidates"
      data-entry-id={entryId}
      data-state={shown ? 'ready' : 'loading'}
      aria-busy={shown ? undefined : true}
    >
      {shown ? (
        <p
          data-testid="operator-web-candidates-caption"
          className="mb-1.5 truncate text-2sm text-muted-foreground"
        >
          {t('web.found', { query, count: shown.length })}
        </p>
      ) : (
        <Skeleton className="mb-1.5 h-5 w-48 max-w-full" />
      )}

      <ul
        data-testid="operator-web-candidate-strip"
        aria-label={t('web.stripLabel', { count: shown?.length ?? 0 })}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pt-1"
      >
        {shown
          ? shown.map((image, index) => {
              const pick = pickOf(image)
              const state: TileState =
                pick?.status === 'importing'
                  ? 'importing'
                  : pick?.status === 'imported'
                    ? 'imported'
                    : stagedSet.has(image.imageUrl)
                      ? 'staged'
                      : pick?.status === 'error'
                        ? 'error'
                        : 'idle'
              return (
                <WebCandidateTile
                  key={image.imageUrl}
                  image={image}
                  index={index}
                  findKey={image.n ? operatorFindKey(entryId, image.n) : null}
                  named={
                    image.n !== undefined &&
                    namedFinds.has(operatorFindKey(entryId, image.n))
                  }
                  state={state}
                  error={pick?.status === 'error' ? pick.error : undefined}
                  pickable={pickable}
                  onSelect={() => toggleStage(image)}
                />
              )
            })
          : Array.from(
              {
                length: Math.min(
                  Math.max(placeholderCount, 1),
                  ASSISTANT_OPERATOR_LIMITS.maxWebImageResults,
                ),
              },
              (_, index) => (
                <li
                  key={index}
                  className="flex w-32 shrink-0 snap-start flex-col gap-1.5"
                >
                  <Skeleton
                    data-testid="operator-web-candidate-skeleton"
                    className="h-44 w-full rounded-lg"
                  />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </li>
              ),
            )}
      </ul>

      {/* 选好了挂上（2026-09-06「都挂上」那条用例 → 胶片条：先选、再一次挂上）。
          ⚠ 数量写在键上（「挂上 3 张」），没选的时候**禁用而不是移除**：左边那行就是理由。 */}
      {shown && pickable ? (
        <div
          data-testid="operator-web-bar"
          className="mt-1 flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card py-1.5 pl-3 pr-1.5"
        >
          <div role="status" className="min-w-0 flex-1">
            <p className="flex min-w-0 flex-wrap items-center gap-1 text-sm font-medium text-foreground">
              <span data-testid="operator-web-bar-title">{bar.title}</span>
              {stagedImages.map((image) =>
                image.n ? (
                  <span
                    key={image.imageUrl}
                    className="rounded-sm bg-foreground px-1 font-mono text-2xs tabular-nums leading-4 text-background"
                  >
                    #{image.n}
                  </span>
                ) : null,
              )}
            </p>
            {bar.sub ? (
              <p
                data-testid="operator-web-bar-sub"
                className="text-xs text-muted-foreground"
              >
                {bar.sub}
              </p>
            ) : null}
          </div>
          {!stagedImages.length && selectable.length > 0 && free > 0 ? (
            <button
              type="button"
              data-testid="operator-web-select-all"
              onClick={selectAll}
              className="h-9 shrink-0 rounded-md px-2 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none coarse:h-11"
            >
              {t('web.selectAll')}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="operator-web-use-all"
            disabled={stagedImages.length === 0 || importingCount > 0}
            onClick={commit}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background transition-[opacity,transform] duration-fast ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none coarse:h-11"
          >
            {importingCount > 0 ? <Spinner size="sm" /> : null}
            {t('web.useAll', { count: stagedImages.length })}
          </button>
        </div>
      ) : null}

      {[...blockedNotes].map(([key, domains]) => (
        <p
          key={key}
          data-testid="operator-web-candidate-blocked"
          className="mt-1.5 text-xs text-muted-foreground"
        >
          {t('web.blockedNote', {
            domains: domains.join(', '),
            reason: t(key),
          })}
        </p>
      ))}
      {webImport?.refusalError ? (
        <p
          data-testid="operator-web-refusal-error"
          className="mt-1.5 text-2sm text-status-risk"
        >
          {webImport.refusalError}
        </p>
      ) : null}
      {webImport?.cleanupError ? (
        <p
          data-testid="operator-web-cleanup-error"
          className="mt-1.5 text-2sm text-status-risk"
        >
          {webImport.cleanupError}
        </p>
      ) : null}
    </section>
  )
}

function WebCandidateTile({
  image,
  index,
  findKey,
  named,
  state,
  error,
  pickable,
  onSelect,
}: {
  image: AssistantOperatorWebImage
  index: number
  /** 这一格的 `#n` 键（`operatorFindKey`）；没编号（旧内核）= `null`。 */
  findKey: string | null
  /** 回复点名了这一张：常驻细黑框 +「回复提到」。 */
  named: boolean
  state: TileState
  /** 上次没取回来的原因（`state === 'error'`）。 */
  error: string | undefined
  pickable: boolean
  onSelect(): void
}) {
  const t = useTranslations('StudioOperator')
  const highlighted = useOperatorFindHighlighted(findKey)
  /**
   * 格子里画**缩略图**（gstatic，稳）；取不到再试原图（能走热链代理就先走代理）。
   * 🔬 原图直链约三成 403 —— 格子里先画原图会得到一半碎图。
   */
  const thumb = useThirdPartyImage(image.thumbnailUrl, image.imageUrl)
  const {
    imageRef: revealRef,
    onLoad: onRevealLoad,
    style: revealStyle,
    className: revealClassName,
  } = useMediaReveal({ src: thumb.src ?? '', step: revealStep(index, 0) })

  /** 灯箱底下那一行 / 悬停提示：标题 · 发布者（取不到发布者就不写，⛔ 拿域名冒充）。 */
  const caption =
    [image.title, image.publisher].filter(Boolean).join(' · ') ||
    image.domain ||
    image.pageUrl ||
    image.imageUrl
  /** 来源网站：发布者（站名）优先，没有写域名；两样都有时域名小字跟在后面。 */
  const site = image.publisher ?? image.domain ?? t('web.publisherUnknown')
  const domainAside =
    image.publisher && image.domain && image.domain !== image.publisher
      ? image.domain
      : null
  const handle = image.n ? `#${image.n}` : site
  const viewOnly = !image.usableAsInput

  const status = viewOnly
    ? t('web.statusViewOnly')
    : state === 'staged'
      ? t('web.statusStaged')
      : state === 'imported'
        ? t('web.statusImported')
        : state === 'importing'
          ? t('web.statusImporting')
          : state === 'error'
            ? (error ?? t('web.importFailed'))
            : image.sourceVerdict ===
                WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense
              ? t('web.statusUsableUnknownLicense')
              : t('web.statusUsable')
  const selectLabel =
    state === 'imported'
      ? t('web.unmountCandidate', { handle })
      : state === 'staged'
        ? t('web.unselectCandidate', { handle })
        : state === 'error'
          ? t('web.reselectCandidate', { handle })
          : t('web.selectCandidate', { handle })
  const marked = state === 'staged' || state === 'imported'

  return (
    <li
      data-testid="operator-web-candidate-tile"
      {...operatorFindCardProps(findKey, image.n, named, highlighted)}
      className={cn(
        'flex shrink-0 scroll-m-2 snap-start flex-col gap-1.5',
        tileWidthClass(image),
      )}
    >
      <div
        className={cn(
          'relative h-44 w-full overflow-hidden rounded-lg border border-border/70 bg-accent transition-[border-color,box-shadow] duration-fast ease-standard motion-reduce:transition-none',
          marked && 'border-foreground ring-2 ring-foreground',
          state === 'error' && 'border-status-risk ring-1 ring-status-risk',
          operatorFindRingClass(named, highlighted),
        )}
      >
        {/* 看 —— ⛔ 这一颗不发任何导入，它只开灯箱。
            ⚠ 灯箱吃的是**原图**（看大图的意义就在这儿），取不到退缩略图。 */}
        <button
          type="button"
          data-testid="operator-web-candidate"
          data-selected={state === 'idle' ? 'false' : 'true'}
          data-state={state}
          data-verdict={image.sourceVerdict}
          onClick={() =>
            openOperatorLightbox(image.imageUrl, caption, {
              thirdParty: true,
              ...(image.thumbnailUrl
                ? { fallbackUrl: image.thumbnailUrl }
                : {}),
            })
          }
          title={caption}
          aria-label={`${t('web.viewLarge')} · ${caption}`}
          className="absolute inset-0 grid cursor-zoom-in place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {thumb.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- 任意第三方图床，进不了 next.config 的 remotePatterns 白名单。
            <img
              key={thumb.src}
              ref={revealRef}
              src={thumb.src}
              alt={image.title ?? image.domain ?? ''}
              width={STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS}
              height={STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS}
              loading="lazy"
              referrerPolicy={thumb.referrerPolicy}
              onLoad={onRevealLoad}
              onError={thumb.onError}
              style={revealStyle}
              className={cn(
                'size-full object-cover',
                viewOnly && 'opacity-60',
                revealClassName,
              )}
            />
          ) : (
            <ImageOff
              data-testid="operator-web-candidate-unavailable"
              className="size-5 text-muted-foreground"
              aria-hidden
            />
          )}
        </button>

        {/* 左上：编号 `#n`（与回复里的 `#3` 对得上，搜索期第三片）。 */}
        {image.n ? (
          <span
            data-testid="operator-web-candidate-number"
            className="pointer-events-none absolute left-1.5 top-1.5 rounded-sm bg-foreground/75 px-1 font-mono text-2xs font-semibold tabular-nums leading-4 text-background"
          >
            #{image.n}
          </span>
        ) : null}

        {/* 左下：回复点名了这一张。 */}
        {named ? (
          <span
            data-testid="operator-web-candidate-named"
            className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-foreground px-1.5 text-3xs leading-4 text-background"
          >
            {t('web.namedBadge')}
            <span className="sr-only">{t('web.findNamed')}</span>
          </span>
        ) : null}

        {/* 右上：选择圈 —— 只是选上，「挂上 N 张」才导入。
            ⛔ 只能看的（站点不让取图 / 不许当输入）不画圈：状态行写着「只能看原页」。 */}
        {pickable && !viewOnly ? (
          <button
            type="button"
            data-testid="operator-web-candidate-use"
            data-state={state}
            aria-pressed={marked}
            aria-label={selectLabel}
            disabled={state === 'importing'}
            onClick={onSelect}
            className="absolute right-0 top-0 grid size-11 place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none"
          >
            <span
              className={cn(
                'grid size-7 place-items-center rounded-full border-2 transition-[background-color,border-color,transform] duration-fast ease-standard active:scale-[.98] motion-reduce:transition-none',
                state === 'staged' &&
                  'border-background bg-foreground text-background',
                state === 'imported' &&
                  'border-foreground bg-background text-foreground',
                state === 'importing' &&
                  'border-background bg-foreground/60 text-background',
                state === 'error' &&
                  'border-status-risk bg-background/85 text-status-risk',
                state === 'idle' && 'border-background bg-foreground/35',
              )}
            >
              {state === 'staged' ? (
                <Check className="size-4" aria-hidden />
              ) : state === 'imported' ? (
                <Pin className="size-3.5" aria-hidden />
              ) : state === 'importing' ? (
                <Spinner size="sm" />
              ) : null}
            </span>
          </button>
        ) : null}

        {state === 'importing' ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-background/40"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        {/* 来源网站：点它新窗开原页（`noopener noreferrer`：目标是任意第三方站）。
            ⛔ 没有 `pageUrl` 就只写字（一颗点不开的链接比没有坏）。 */}
        {image.pageUrl ? (
          <a
            href={image.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="operator-web-candidate-source"
            title={t('web.openPage')}
            aria-label={t('web.openPageOf', { site })}
            className="group inline-flex min-h-6 min-w-0 items-baseline gap-1 rounded-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <WebCandidateSite site={site} domainAside={domainAside} />
            <ExternalLink
              className="size-3 shrink-0 self-center text-muted-foreground transition-colors duration-fast ease-standard group-hover:text-foreground motion-reduce:transition-none"
              aria-hidden
            />
          </a>
        ) : (
          <span className="inline-flex min-h-6 min-w-0 items-baseline gap-1">
            <WebCandidateSite site={site} domainAside={domainAside} />
          </span>
        )}
        <span
          data-testid={
            state === 'error'
              ? 'operator-web-candidate-error'
              : 'operator-web-candidate-status'
          }
          className={cn(
            'line-clamp-2 text-xs',
            state === 'error'
              ? 'text-status-risk'
              : marked
                ? 'font-medium text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {status}
        </span>
      </div>
    </li>
  )
}

function WebCandidateSite({
  site,
  domainAside,
}: {
  site: string
  domainAside: string | null
}) {
  return (
    <>
      <span
        data-testid="operator-web-candidate-domain"
        className="min-w-0 truncate text-sm font-semibold"
      >
        {site}
      </span>
      {domainAside ? (
        <span className="min-w-0 truncate font-mono text-3xs text-muted-foreground">
          {domainAside}
        </span>
      ) : null}
    </>
  )
}
