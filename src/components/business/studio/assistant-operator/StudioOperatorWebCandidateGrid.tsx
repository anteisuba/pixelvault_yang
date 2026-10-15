'use client'

/**
 * **找到的图**（联网候选网格 · 拍板 21 · 切片 3b → 搜索期切片 1，2026-10-15）。
 *
 * ── 搜索期切片 1：它是答案的一部分，⛔ 不是过程 ────────────────────
 * 附录 I §四：搜到的东西摆在**回答正文下面**（与来源卡同一格，面板经
 * `StudioOperatorMessageBody.webImages` 交进来），⛔ 不再折进步骤组 —— 之前它长在
 * 日志条里，组默认收起、一轮收尾后整个过程区又被收掉，找到的图于是看不见。
 * 过程那一行只剩一句「搜索 Google 图片：… · 8 张」（`StudioOperatorLogItem`）。
 * 还没等到回答（还在搜 / 回答还在写 / 这一轮停了）时面板把它就地画在那一块里，
 * 同一个 `entryId` 当 key —— 灰块 → 图 → 搬到回答底下，选用态不丢。
 *
 * ── 拍板 21：看与选是两件事 ──────────────────────────────────────
 *  · 点缩略图 = 开灯箱看**原图**（取不到退缩略图），零入库；
 *  · 点「选用」= 才导入进素材库并挂上（再点 = 取消，并从素材库清掉）。
 * 🔬 owner 2026-08-31 真机打回的就是这两件事合成一个手势：**浏览即采购**。
 *
 * ── 一格（§四）────────────────────────────────────────────────
 *  · 缩略图：第三方网图，⛔ 不带我们的 Referer（`useThirdPartyImage`），到了由糊变清
 *    （`useMediaReveal`）；全取不到画一格断图标，⛔ 破图标。
 *  · 左下角**域名**小标 · 右上角**能不能当参考**小点（实心 = 可作输入，空心 = 仅参考；
 *    读屏念完整一句）。判据在 `constants/web-image-sources.ts`，**是启发式不是法律判断**。
 *  · 格子下面一行动作，**常显**（ui-defaults §5：悬停才出的操作在触屏上要常显）：
 *    「选用」+「打开来源」（新窗，⛔ 点它不算选用）。
 *  · 不可作输入的那格「选用」**禁用而不是移除**；理由按判据合并成网格底下几行
 *    （一格 80px 宽写不下一段理由，逐格写会把网格撑成一列长条）。
 *
 * ⚠ 列数：手机 2 列；桌面（`lg` = 面板外壳的桌面档）面板内容够宽（`@2xs`）时 4 列。
 *   面板宽度是用户拖出来的，所以第二道看**容器**（同 `StudioOperatorResultRow`）。
 */

import { Check, ExternalLink, ImageOff } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS } from '@/constants/studio-assistant-operator'
import {
  WEB_IMAGE_SOURCE_NOT_USABLE_MESSAGE_KEYS,
  WEB_IMAGE_SOURCE_VERDICT_IDS,
} from '@/constants/web-image-sources'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { revealStep, useMediaReveal } from '@/components/ui/load-reveal'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { AssistantOperatorWebImage } from '@/types/assistant-operator'
import { useThirdPartyImage } from '@/hooks/use-third-party-image'
import type {
  StudioOperatorWebImportPick,
  StudioOperatorWebImportState,
} from '@/hooks/use-studio-operator-web-import'

/** 一张都没选时共用这一份，⛔ 别写成行内 `[]`（每次 render 换引用）。 */
const NO_PICKS: readonly StudioOperatorWebImportPick[] = []

/** 一行几格 —— 错开（`revealStep`）按桌面那一档算，手机两列时错得稍密，无妨。 */
const REVEAL_COLUMNS = 4

interface StudioOperatorWebCandidateGridProps {
  /** ⚠ 选用认的是**线程里这一条的 id**，不是 `step.id`。 */
  entryId: string
  /** 这一次搜的什么 —— 网格头上那一行「搜索 Google 图片：… · N 张」。 */
  query: string
  /**
   * 找到的图；`null` = **还在搜**：画同形状的灰块（`placeholderCount` 格），
   * ⛔ 呼吸闪烁（ui-defaults 加载态）。
   */
  images: readonly AssistantOperatorWebImage[] | null
  /** 还在搜时画几格灰块 —— 这一步要了几张（`payload.limit`）。 */
  placeholderCount?: number
  /** 这一条上的选用态。`undefined` = 一张都还没选。 */
  webImport: StudioOperatorWebImportState | undefined
  /** 一行最多能选几张（工作台参考位上限）——「已选 n/m」里的 m；0 = 只能看。 */
  limit: number
  onToggle(entryId: string, image: AssistantOperatorWebImage): void
}

export function StudioOperatorWebCandidateGrid({
  entryId,
  query,
  images,
  placeholderCount = ASSISTANT_OPERATOR_LIMITS.maxWebImageResults,
  webImport,
  limit,
  onToggle,
}: StudioOperatorWebCandidateGridProps) {
  const t = useTranslations('StudioOperator')

  /** §四「先给 8 张」。 */
  const shown = images?.slice(0, ASSISTANT_OPERATOR_LIMITS.maxWebImageResults)
  const picks = webImport?.picks ?? NO_PICKS
  const failedPicks = picks.filter((pick) => pick.status === 'error')
  const usedCount = picks.length - failedPicks.length

  /**
   * 「把能用的都挂上」那颗按钮要挂的**具体那几张**（2026-09-06）。
   *
   * ── 为什么这份名额算在这里，而不是在 hook 里 ─────────────────────
   * `toggleCandidate` 每次调用都读一份**同一帧内还没更新**的选中态，所以循环调
   * 它时每一张都以为自己是第一张 —— 名额判定会全部按旧值走。这在这里恰好是
   * 安全的（都走「没选过 → 导入」那一支），但**只有在调用方自己把数量卡在剩余
   * 名额之内**时才成立。所以这份筛选是这颗按钮的一部分，⛔ 不能省成
   * 「把 images 全丢给 onToggle」。
   *
   * 三条闸，与格子上那颗「选用」逐条同源：
   *  · `usableAsInput=false` 的**不在名单里**；
   *  · 已经选过的跳过（⛔ 再点一次会变成取消选用，那正好是反效果）；
   *  · 名额满了 = 一张都不动（⛔ 不挤掉用户自己挑好的那些）。
   */
  const remaining = limit - usedCount
  const pendingUsable = (shown ?? []).filter(
    (image) =>
      image.usableAsInput &&
      !picks.some((pick) => pick.imageUrl === image.imageUrl),
  )
  const batch = remaining > 0 ? pendingUsable.slice(0, remaining) : []
  /**
   * 宿主**没有参考位**（角色页，卡片助手 C3）：这一行只能看、不能选 —— 那里挑图走
   * 助手交出来的候选卡（`StudioOperatorCharacterImagesCard`），选中的挂到角色上。
   * ⛔ 不留一颗点了会导进素材库却挂不到任何地方的「选用」。
   */
  const pickable = limit > 0

  if (shown && shown.length === 0) return null

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

  return (
    <section
      className="@container min-w-0"
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

      <div className="grid grid-cols-2 gap-2 lg:@2xs:grid-cols-4">
        {shown
          ? shown.map((image, index) => (
              <WebCandidateTile
                key={image.imageUrl}
                image={image}
                index={index}
                pick={picks.find((item) => item.imageUrl === image.imageUrl)}
                pickable={pickable}
                onUse={() => onToggle(entryId, image)}
              />
            ))
          : Array.from(
              {
                length: Math.min(
                  Math.max(placeholderCount, 1),
                  ASSISTANT_OPERATOR_LIMITS.maxWebImageResults,
                ),
              },
              (_, index) => (
                <div key={index} className="flex min-w-0 flex-col gap-1">
                  <Skeleton
                    data-testid="operator-web-candidate-skeleton"
                    className="aspect-square w-full rounded-lg"
                  />
                  <Skeleton className="h-7 w-full" />
                </div>
              ),
            )}
      </div>

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
      {/* 「把能用的都挂上」（2026-09-06）—— owner 用例的收尾动作：助手搜到一行
          官方设定图之后，用户要的是「都挂上」，而不是点四次「选用」。
          ⚠ 名额为 0 或没有可挂的时**禁用而不是移除**：位置留着，旁边那行
            「已选 n/m」就是理由。
          ⚠ 数量写在按钮上（「挂上 3 张」）——⛔ 不写一句无数字的「全部挂上」。 */}
      {shown && pickable ? (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
          <p className="min-w-0 text-2sm text-muted-foreground">
            {usedCount > 0
              ? t('web.selectedHint', { count: usedCount, limit })
              : t('web.pickHint')}
          </p>
          <button
            type="button"
            data-testid="operator-web-use-all"
            disabled={batch.length === 0}
            onClick={() => {
              for (const image of batch) onToggle(entryId, image)
            }}
            className={cn(
              'h-7 shrink-0 rounded-md border px-2 text-xs transition-colors duration-fast ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
              batch.length === 0
                ? 'cursor-not-allowed border-border/70 text-muted-foreground/60'
                : 'border-border text-foreground hover:bg-muted/60',
            )}
          >
            {t('web.useAll', { count: batch.length })}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function WebCandidateTile({
  image,
  index,
  pick,
  pickable,
  onUse,
}: {
  image: AssistantOperatorWebImage
  index: number
  pick: StudioOperatorWebImportPick | undefined
  pickable: boolean
  onUse(): void
}) {
  const t = useTranslations('StudioOperator')
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
  } = useMediaReveal({
    src: thumb.src ?? '',
    step: revealStep(
      index % REVEAL_COLUMNS,
      Math.floor(index / REVEAL_COLUMNS),
    ),
  })

  const importing = pick?.status === 'importing'
  const failed = pick?.status === 'error'
  const imported = pick?.status === 'imported'
  // ⚠ 每格算自己的态：一行里可以同时有「已选用」「在飞」「取不到」三种格子，
  //    把整行的状态印到每一格会让没出事的那些也标红。
  const tileState = importing
    ? 'importing'
    : failed
      ? 'error'
      : imported
        ? 'imported'
        : 'idle'
  /** 灯箱底下那一行 / 悬停提示：标题 · 发布者（取不到发布者就不写，⛔ 拿域名冒充）。 */
  const caption =
    [image.title, image.publisher].filter(Boolean).join(' · ') ||
    image.domain ||
    image.pageUrl ||
    image.imageUrl
  const usableLabel = image.usableAsInput
    ? image.sourceVerdict === WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense
      ? t('web.usableUnknownLicense')
      : t('web.usable')
    : t('web.referenceOnly')

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        className={cn(
          'relative aspect-square w-full overflow-hidden rounded-lg border border-border/70 bg-accent',
          imported && 'border-foreground ring-1 ring-foreground',
          failed && 'border-status-risk ring-1 ring-status-risk',
        )}
      >
        {/* 看 —— ⛔ 这一颗不发任何导入，它只开灯箱。
            ⚠ 灯箱吃的是**原图**（看大图的意义就在这儿），取不到退缩略图。 */}
        <button
          type="button"
          data-testid="operator-web-candidate"
          data-selected={pick ? 'true' : 'false'}
          data-state={tileState}
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
              className={cn('size-full object-cover', revealClassName)}
            />
          ) : (
            <ImageOff
              data-testid="operator-web-candidate-unavailable"
              className="size-5 text-muted-foreground"
              aria-hidden
            />
          )}
        </button>

        {/* 右上角：能不能当参考（§四「可当参考」小点）。读屏念整句。 */}
        <span
          data-testid="operator-web-candidate-usable"
          data-usable={image.usableAsInput ? 'true' : 'false'}
          className={cn(
            'pointer-events-none absolute right-1.5 top-1.5 size-2.5 rounded-full shadow-sm ring-2 ring-background/80',
            image.usableAsInput
              ? 'bg-status-applied'
              : 'border-2 border-status-risk bg-background',
          )}
        >
          <span className="sr-only">{usableLabel}</span>
        </span>

        {/* 左下角：域名小标（§四）。 */}
        {image.domain ? (
          <span className="pointer-events-none absolute inset-x-1 bottom-1 flex">
            <span
              data-testid="operator-web-candidate-domain"
              className="max-w-full truncate rounded-sm bg-foreground/70 px-1 font-mono text-3xs leading-4 text-background"
            >
              {image.domain}
            </span>
          </span>
        ) : null}

        {imported ? (
          <span className="pointer-events-none absolute left-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-foreground text-background">
            <Check className="size-2.5" aria-hidden />
            <span className="sr-only">{t('web.imported')}</span>
          </span>
        ) : null}
        {importing ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-background/70">
            <Spinner className="size-4 text-foreground" />
          </span>
        ) : null}
      </div>

      {pickable || image.pageUrl ? (
        <div className="flex min-w-0 items-center gap-1">
          {/* 选 —— 这一颗才花钱（花的是存储与一次下载）。
              ⚠ 不可作输入时**禁用而不是移除**；理由在网格底下、也在悬停提示里。 */}
          {pickable ? (
            <button
              type="button"
              data-testid="operator-web-candidate-use"
              data-state={tileState}
              aria-pressed={imported}
              disabled={!image.usableAsInput}
              onClick={onUse}
              {...(!image.usableAsInput
                ? {
                    title: t(
                      WEB_IMAGE_SOURCE_NOT_USABLE_MESSAGE_KEYS[
                        image.sourceVerdict
                      ],
                    ),
                  }
                : {})}
              className={cn(
                'h-7 min-w-0 flex-1 truncate rounded-md border px-1 text-xs transition-colors duration-fast ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
                imported
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-foreground hover:bg-muted/60',
                failed && 'border-status-risk/50 text-status-risk',
                !image.usableAsInput &&
                  'cursor-not-allowed border-border/70 text-muted-foreground hover:bg-transparent',
              )}
            >
              {!image.usableAsInput
                ? t('web.cannotUse')
                : imported
                  ? t('web.used')
                  : failed
                    ? t('web.retry')
                    : t('web.use')}
            </button>
          ) : null}
          {/* 打开来源 —— 新窗；`noopener noreferrer`：目标是任意第三方站。
              ⛔ 没有 `pageUrl` 时不画（一颗点不开的链接比没有坏）。 */}
          {image.pageUrl ? (
            <a
              href={image.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="operator-web-candidate-source"
              title={t('web.openPage')}
              aria-label={t('web.openPage')}
              className={cn(
                'grid h-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
                pickable ? 'w-7' : 'w-full',
              )}
            >
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}

      {/* ⛔ 失败原因写在**这一格**下面（2026-09-07 真机）：一行里可以同时有
          「403 拒了」和「不是图片格式」两种失败。 */}
      {failed ? (
        <span
          data-testid="operator-web-candidate-error"
          className="line-clamp-2 text-2xs text-status-risk"
        >
          {pick?.error ?? t('web.importFailed')}
        </span>
      ) : null}
    </div>
  )
}
