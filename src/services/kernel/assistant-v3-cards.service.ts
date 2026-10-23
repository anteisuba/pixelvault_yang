import 'server-only'
import { z } from 'zod'

import {
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_CARDS_EDIT_OP_IDS,
  ASSISTANT_V3_CARDS_ITEM_IDS,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND,
  ASSISTANT_V3_MEMORIES_SEARCH_KIND,
  ASSISTANT_V3_WEB_VIDEOS_SEARCH_KIND,
} from '@/constants/assistant-v3'
import {
  openCharacterImages,
  renderAssistantV3CardsItem,
} from '@/lib/assistant-v3-cards-board'
import {
  AssistantV3CardsEditInputSchema,
  AssistantV3CardsLookInputSchema,
  AssistantV3CardsReadInputSchema,
  AssistantV3ImageSearchLibraryInputSchema,
  type AssistantV3CardsEditOpInput,
} from '@/types/assistant-v3'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import { searchMemoriesStep } from '@/services/kernel/assistant-v3-memories.service'
import { toStepEvent } from '@/services/kernel/assistant-operator.service'
import {
  executeBenchLook,
  inV3Words,
  joinOutcomes,
  refused,
  runOldTool,
  runWebFind,
} from '@/services/kernel/assistant-v3-bench.service'
import { pickV3WebImage } from '@/services/kernel/assistant-v3-finds.service'
import { executeV3Look } from '@/services/kernel/assistant-v3-look.service'
import {
  joinPhrases,
  nextStep,
  planSafely,
  sayAboveCard,
  settlePlan,
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'

type ImagePick =
  | { assetId: string; reason: string }
  | { imageUrl: string; reason: string }

function characterIdOf(
  context: V3Context,
  handle: string,
): { ok: true; id: string; name: string } | { ok: false; error: string } {
  const id = context.handles.idOf(handle)
  const character = id
    ? context.request.snapshot.cards?.characters.find(
        (entry) => entry.id === id,
      )
    : undefined
  if (id && character) return { ok: true, id, name: character.name }
  const nearest = context.handles
    .nearest(handle)
    .map((other) => context.handles.handleOf(other))
  return {
    ok: false,
    error: `No character "${handle}" on the page${nearest.length ? ` — did you mean ${nearest.join(', ')}?` : ''}.`,
  }
}

async function* runProposal(
  context: V3Context,
  op: AssistantV3CardsEditOpInput,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const character = characterIdOf(context, op.character)
  switch (op.op) {
    case ASSISTANT_V3_CARDS_EDIT_OP_IDS.proposeProfile: {
      const title = `${text.profile}「${character.ok ? character.name : op.character}」`
      if (!character.ok)
        return yield* refused(
          context,
          TOOL.proposeCharacterProfile,
          title,
          character.error,
        )
      yield* sayAboveCard(context, op.say)
      return yield* runOldTool(context, TOOL.proposeCharacterProfile, title, {
        characterId: character.id,
        fields: op.fields.map((field) => ({
          field: field.field,
          text: field.text,
          source: field.source,
          ...(field.sourceUrl ? { sourceUrl: field.sourceUrl } : {}),
          ...(field.added?.length ? { added: field.added } : {}),
        })),
      })
    }
    case ASSISTANT_V3_CARDS_EDIT_OP_IDS.proposeImages: {
      const title = `${text.pickImages}「${character.ok ? character.name : op.character}」`
      if (!character.ok)
        return yield* refused(
          context,
          TOOL.proposeCharacterImages,
          title,
          character.error,
        )
      const images: ImagePick[] = []
      for (const image of op.images) {
        if (image.asset) {
          images.push({ assetId: image.asset, reason: image.reason })
          continue
        }
        if (!image.find) continue
        // 联网找到的那一张只认 `#n`：服务端按本轮记录换回原图地址（⛔ 模型不写地址）。
        const found = pickV3WebImage(context.transcript, image.find)
        if (!found)
          return yield* refused(
            context,
            TOOL.proposeCharacterImages,
            title,
            `"${image.find}" is not a web find number: write the number from the search results, like "#3".`,
          )
        if (!found.ok)
          return yield* refused(
            context,
            TOOL.proposeCharacterImages,
            title,
            found.error,
          )
        images.push({ imageUrl: found.find.imageUrl, reason: image.reason })
      }
      if (images.length === 0)
        return yield* refused(
          context,
          TOOL.proposeCharacterImages,
          title,
          'Every picture needs an asset id from a library search or a web find number ("#3") from this turn or last turn.',
        )
      yield* sayAboveCard(context, op.say)
      return yield* runOldTool(context, TOOL.proposeCharacterImages, title, {
        characterId: character.id,
        images,
      })
    }
  }
}

/** edit：只走第一份提议 —— 一张卡就停下等创作者，⛔ 一条回复摆不了两张。 */
export async function* executeAssistantV3CardsMutation(
  context: V3Context,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const ops = AssistantV3CardsEditInputSchema.parse(input).ops
  const first = ops[0]
  if (!first)
    return {
      kind: 'result',
      output: 'ops is empty.',
      error: true,
      failureKey: 'edit:empty',
    }
  const outcome = yield* runProposal(context, first)
  if (ops.length > 1 && outcome.kind === 'result')
    return {
      ...outcome,
      output: `${outcome.output}\nOnly the first proposal ran: put one card in front of the creator at a time.`,
    }
  return outcome
}

/** 联网找图那一步结果里的候选：看图只要地址、缩略图与能不能挂。 */
const WebImageCandidatesSchema = z.object({
  images: z.array(
    z.object({
      n: z.number().int().positive().optional(),
      imageUrl: z.string(),
      thumbnailUrl: z.string().optional(),
      usableAsInput: z.boolean().optional(),
    }),
  ),
})

/** 所选模型看不了图：候选一张都没人看过（⛔ 不借别家的 key 去看）。 */
const WEB_CANDIDATES_TITLE_ONLY_NOTE =
  'Nobody looked at these candidates: the assistant model the creator picked cannot see pictures, and no other provider is used in its place. You only have their titles and pages. If you offer any, say plainly in your reply that you picked them by title only, without seeing them, and suggest switching to a model that can see pictures if the creator wants them checked.'

/** 交给主模型看候选时附的那一句：怎么认人由它自己判断（owner 2026-10-15）。 */
function webCandidatesLookNote(name: string, hasCardPictures: boolean): string {
  return `These are the web candidates listed above, each labelled with its number (#n). Judge yourself which ones show ${name}${
    hasCardPictures
      ? ' — compare them with their own pictures already in front of you (card-N) and the profile'
      : ' — compare them with the profile'
  }; a different character, a cosplay photo or fan art that changes the design is not them. Offer only ones you saw as them and write each reason from what you saw. One you did not get to see may be offered only if you say it was judged by its title.`
}

/**
 * 角色页联网找图（owner 2026-10-15「一种看法」）：搜完把候选的缩略图当一次 look 交给**主模型**，
 * 由它自己判断哪几张是这位角色。
 * ⛔ 不另起看缩略图的子调用（旧内核的 `inspectWebImageCandidates`，跑在视觉顺位挑中的那一家）、
 * ⛔ 不借别家的 key、⛔ 没有藏起来的判定去筛 propose_images（旧执行器见 `run.mainModelLooks`）。
 * 看图走 look 的硬规矩：只附给紧跟着的那一步、一次最多 `maxLookCards` 张、一张下不来只点名那一张。
 * 所选模型看不了图：结果里明说「没人看过这些图，只凭标题」，由模型照实告诉创作者。
 */
async function* searchWebImagesAndLook(
  context: V3Context,
  query: string,
  subject: string | null,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const tool = TOOL.searchWebImages
  const text = TITLE_TEXT[context.language]
  const plan = await planSafely(context, tool, {
    query,
    ...(subject ? { subject, preferOfficial: true } : {}),
  })
  let candidates: z.infer<typeof WebImageCandidatesSchema>['images'] = []
  const searched = inV3Words(
    yield* settlePlan(
      context,
      tool,
      `${text.searchImages} ${query}`,
      plan.kind === 'read'
        ? {
            ...plan,
            run: async () => {
              const found = await plan.run()
              candidates =
                WebImageCandidatesSchema.safeParse(found.result).data?.images ??
                []
              return found
            },
          }
        : plan,
    ),
  )
  if (searched.kind !== 'result' || searched.error || candidates.length === 0)
    return searched
  if (!context.seesImages)
    return joinOutcomes([
      searched,
      { kind: 'result', output: WEB_CANDIDATES_TITLE_ONLY_NOTE, error: false },
    ])
  const open = context.request.snapshot.cards?.open
  const name = open?.name ?? subject ?? query
  /**
   * 称呼用卡片上那个号 `#n`，与上面那张单子对得上。挂得上卡的排前面；标了 view only 的（pixiv
   * 一类，站点不让取图）挂不上卡，只在名额有剩时看它的小预览（2026-10-16 owner：pixiv 那几张
   * 一张都没看过、只按标题筛）—— 让 Denia 说得出「#22 最像，但只能点开原页看」。
   */
  const lookable = candidates.map((image, index) => {
    const n = image.n ?? index + 1
    return {
      url: image.thumbnailUrl ?? image.imageUrl,
      label: `#${n}`,
      title: text.candidate(n),
      viewOnly: image.usableAsInput === false,
      thumbnailUrl: image.thumbnailUrl,
    }
  })
  const targets = [
    ...lookable.filter((item) => !item.viewOnly),
    ...lookable.filter((item) => item.viewOnly && item.thumbnailUrl),
  ].map(({ url, label, title, viewOnly }) => ({
    url,
    label,
    title,
    ...(viewOnly ? { preview: true } : {}),
  }))
  if (targets.length === 0) return searched
  // 超出 `maxLookCards` 的由 look 明说没看（挂得上卡的在前，先看它们）。
  const viewOnly = targets
    .slice(0, ASSISTANT_V3_LIMITS.maxLookCards)
    .filter((target) => target.preview)
  const look = yield* executeV3Look(context, {
    targets,
    notes: [
      webCandidatesLookNote(name, openCharacterImages(open).length > 0),
      ...(viewOnly.length
        ? [
            `${viewOnly.map((target) => target.label).join(', ')} can only be opened on their own pages: you may judge them and name them, but never propose them.`,
          ]
        : []),
    ],
    question: `Which of these web pictures show ${name}?`,
  })
  return joinOutcomes([
    searched,
    // 缩略图一张都没下来：搜索本身是成的，⛔ 记成失败（连着两次会掐掉整轮）；照实说只剩标题。
    look.kind === 'result' && look.error
      ? {
          kind: 'result',
          output: `${look.output}\nNone of the candidates could be seen, so you only have their titles: if you offer any, say plainly that they were judged by title only.`,
          error: false,
        }
      : look,
  ])
}

/** `card` 或 `card-N`（打开那位卡上的第 N 张图）。 */
const CARD_PICTURE = new RegExp(
  `^${ASSISTANT_V3_CARDS_ITEM_IDS.card}(?:-(\\d+))?$`,
  'i',
)

/** 对设定与外观时怎么看（原 check_character_look 的判据，owner 09-27）。 */
const CARD_LOOK_NOTE =
  "These are the open character's own pictures (card-1 is the main one). Compare them with the profile yourself: only who they are counts — hair colour or length, eye colour, skin, apparent age, body type, species, permanent marks (scars, tattoos, horns, wings, ears). Outfits, accessories, poses, expressions, backgrounds and art styles never count; a detail the text does not mention or the pictures cannot show clearly is not a mismatch."

/** read / look / search_library 在角色页上的样子。search_web / ask 与别的脸共用。 */
export async function* executeAssistantV3CardsCall(
  context: V3Context,
  name:
    | typeof ASSISTANT_V3_TOOL_IDS.read
    | typeof ASSISTANT_V3_TOOL_IDS.look
    | typeof ASSISTANT_V3_TOOL_IDS.searchLibrary,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const snapshot = context.request.snapshot
  switch (name) {
    case ASSISTANT_V3_TOOL_IDS.read: {
      const items = AssistantV3CardsReadInputSchema.parse(input).items.slice(
        0,
        ASSISTANT_V3_LIMITS.maxReadCards,
      )
      const pages = items.filter((item) => /^https?:\/\//i.test(item.trim()))
      const parts = items.filter((item) => !pages.includes(item))
      const outcomes: V3Outcome[] = []
      if (parts.length) {
        const rendered = parts.map((item) => ({
          item,
          text: renderAssistantV3CardsItem(item, snapshot),
        }))
        const title = joinPhrases(
          context,
          parts.map((item) => `${text.read} ${item}`),
        )
        const unknown = rendered.filter((entry) => entry.text === null)
        if (unknown.length)
          outcomes.push(
            yield* refused(
              context,
              TOOL.readState,
              title,
              snapshot.cards?.open
                ? `Nothing called ${unknown.map((entry) => `"${entry.item}"`).join(', ')}. Use a profile part or a page URL.`
                : 'No character is open: there is no profile to read.',
            ),
          )
        else {
          const step = nextStep(context, TOOL.readState, title)
          yield toStepEvent({
            ...step,
            status: STATUS.done,
            payload: { items: parts },
            result: {
              digest: parts
                .join(' · ')
                .slice(0, ASSISTANT_OPERATOR_LIMITS.maxMessageChars),
            },
          })
          outcomes.push({
            kind: 'result',
            output: rendered.map((entry) => entry.text).join('\n'),
            error: false,
          })
        }
      }
      for (const page of pages)
        outcomes.push(
          yield* runOldTool(context, TOOL.readUrl, `${text.readPage} ${page}`, {
            url: page.trim(),
          }),
        )
      if (!outcomes.length)
        return yield* refused(
          context,
          TOOL.readState,
          text.read,
          'items is empty',
        )
      return joinOutcomes(outcomes)
    }
    case ASSISTANT_V3_TOOL_IDS.look: {
      const parsed = AssistantV3CardsLookInputSchema.parse(input)
      /**
       * ⭐ `card` / `card-N` = 打开那位卡上的图（前几张已经跟着板子附上了）。对设定与外观
       *   由模型自己看着判断（owner 2026-10-15），⛔ 不再另起 check_character_look 那次子调用。
       */
      const pictures = openCharacterImages(snapshot.cards?.open).map(
        (url, index) => ({ url, label: `card-${index + 1}` }),
      )
      const wantsCard = parsed.images.some((image) =>
        CARD_PICTURE.test(image.trim()),
      )
      return yield* executeBenchLook(
        context,
        parsed.images,
        parsed.question,
        (name) => {
          const key = name.trim().toLowerCase()
          if (key === ASSISTANT_V3_CARDS_ITEM_IDS.card)
            return pictures.length
              ? pictures
              : snapshot.cards?.open
                ? 'The open character has no pictures yet.'
                : 'No character is open: there are no card pictures to look at.'
          const numbered = CARD_PICTURE.exec(key)?.[1]
          if (!numbered) return null
          const picture = pictures[Number(numbered) - 1]
          return picture
            ? [picture]
            : `There is no ${key}: the open character has ${pictures.length} picture(s).`
        },
        wantsCard ? [CARD_LOOK_NOTE] : [],
      )
    }
    case ASSISTANT_V3_TOOL_IDS.searchLibrary: {
      const parsed = AssistantV3ImageSearchLibraryInputSchema.parse(input)
      if (parsed.kind === ASSISTANT_V3_MEMORIES_SEARCH_KIND)
        return yield* searchMemoriesStep(context, parsed.query)
      if (parsed.kind === ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND)
        return yield* searchWebImagesAndLook(
          context,
          parsed.query,
          parsed.subject?.trim() || null,
        )
      if (parsed.kind === ASSISTANT_V3_WEB_VIDEOS_SEARCH_KIND)
        return yield* runWebFind(context, parsed.kind, parsed.query, null)
      return yield* runOldTool(
        context,
        TOOL.searchAssets,
        `${text.searchLibrary} ${parsed.query}`,
        { query: parsed.query, kind: parsed.kind },
      )
    }
  }
}
