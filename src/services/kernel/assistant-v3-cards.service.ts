import 'server-only'

import { tool } from 'ai'

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
} from '@/constants/assistant-v3'
import { renderAssistantV3CardsItem } from '@/lib/assistant-v3-cards-board'
import {
  AssistantV3AskInputSchema,
  AssistantV3CardsEditInputSchema,
  AssistantV3CardsLookInputSchema,
  AssistantV3CardsReadInputSchema,
  AssistantV3ImageSearchLibraryInputSchema,
  AssistantV3SearchWebInputSchema,
  type AssistantV3CardsEditOpInput,
} from '@/types/assistant-v3'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import { toStepEvent } from '@/services/kernel/assistant-operator.service'
import {
  executeBenchLook,
  joinOutcomes,
  refused,
  runOldTool,
} from '@/services/kernel/assistant-v3-bench.service'
import {
  joinPhrases,
  nextStep,
  sayAboveCard,
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'

/**
 * v3 的角色页（S6 第三张脸）：工具名与别的脸同一套，但这里**不改任何东西** ——
 * 三种 edit 都是提议（设定 / 挑图 / 交给图片助手），出卡、停下，收不收由创作者勾。
 * ⚠ 没有 write / generate：角色页没有提示词，也不出图。
 */

export function assistantV3CardsTools(strict: boolean) {
  return {
    [ASSISTANT_V3_TOOL_IDS.read]: tool({
      description:
        'Read in full: a profile part of the open character ("look", "identity", "behavior", "speech", "backstory", "tags"), or a web page by its URL (a wiki character page, its story or voice-lines page).',
      inputSchema: AssistantV3CardsReadInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.look]: tool({
      description:
        '"card": check the open character\'s pictures against their profile (only when the creator asks whether they match). Or look at a picture attached to the message, by its name, with one specific question.',
      inputSchema: AssistantV3CardsLookInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.edit]: tool({
      description:
        'Put a proposal in front of the creator: profile fields, pictures to attach, or a hand-off to the image assistant. Each ends the turn on its card; the creator ticks what goes in.',
      inputSchema: AssistantV3CardsEditInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.searchWeb]: tool({
      description:
        'Look something up on the web: a work, a character, their story and way of speaking. Give a goal and the names it turns on.',
      inputSchema: AssistantV3SearchWebInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.searchLibrary]: tool({
      description:
        'kind "image": the creator\'s own pictures (results carry asset ids for propose_images). kind "web_images": pictures on the web (results carry image URLs for propose_images).',
      inputSchema: AssistantV3ImageSearchLibraryInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.ask]: tool({
      description:
        'Ask the creator when you cannot go on without their choice. Every option needs a one-line description of what it means.',
      inputSchema: AssistantV3AskInputSchema,
      strict,
    }),
  }
}

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

/**
 * 交给图片助手的那句话里把句柄换回角色名 —— 图片助手那边没有这份名册
 * （2026-10-10 回放 C5：「基于高尔（char-bc26e0）现有正面立绘…」）。
 */
function withNames(context: V3Context, text: string): string {
  const prefix = ASSISTANT_V3_CARDS_ITEM_IDS.characterPrefix
  return text
    .replace(new RegExp(`[（(]\\s*${prefix}-[0-9a-z]+\\s*[）)]`, 'gi'), '')
    .replace(new RegExp(`\\b${prefix}-[0-9a-z]+\\b`, 'gi'), (handle) => {
      const id = context.handles.idOf(handle)
      return (
        context.request.snapshot.cards?.characters.find(
          (entry) => entry.id === id,
        )?.name ?? handle
      )
    })
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
      const images = op.images.flatMap((image): ImagePick[] =>
        image.asset
          ? [{ assetId: image.asset, reason: image.reason }]
          : image.imageUrl
            ? [{ imageUrl: image.imageUrl, reason: image.reason }]
            : [],
      )
      if (images.length === 0)
        return yield* refused(
          context,
          TOOL.proposeCharacterImages,
          title,
          'Every picture needs an asset id or an image URL from a search this turn.',
        )
      yield* sayAboveCard(context, op.say)
      return yield* runOldTool(context, TOOL.proposeCharacterImages, title, {
        characterId: character.id,
        images,
      })
    }
    case ASSISTANT_V3_CARDS_EDIT_OP_IDS.handOff: {
      const title = `${text.handOff}「${character.ok ? character.name : op.character}」`
      if (!character.ok)
        return yield* refused(
          context,
          TOOL.handOffToImageAssistant,
          title,
          character.error,
        )
      yield* sayAboveCard(context, op.say)
      return yield* runOldTool(context, TOOL.handOffToImageAssistant, title, {
        characterId: character.id,
        request: withNames(context, op.request),
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
      const wantsCard = parsed.images.some(
        (image) =>
          image.trim().toLowerCase() === ASSISTANT_V3_CARDS_ITEM_IDS.card,
      )
      const others = parsed.images.filter(
        (image) =>
          image.trim().toLowerCase() !== ASSISTANT_V3_CARDS_ITEM_IDS.card,
      )
      const open = snapshot.cards?.open
      const outcomes: V3Outcome[] = []
      if (wantsCard)
        outcomes.push(
          open
            ? yield* runOldTool(
                context,
                TOOL.checkCharacterLook,
                `${text.checkLook}「${open.name}」`,
                { characterId: open.id },
              )
            : {
                kind: 'result',
                output:
                  'No character is open: there are no card pictures to check.',
                error: true,
              },
        )
      if (others.length)
        outcomes.push(yield* executeBenchLook(context, others, parsed.question))
      return joinOutcomes(outcomes)
    }
    case ASSISTANT_V3_TOOL_IDS.searchLibrary: {
      const parsed = AssistantV3ImageSearchLibraryInputSchema.parse(input)
      if (parsed.kind === ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND)
        return yield* runOldTool(
          context,
          TOOL.searchWebImages,
          `${text.searchImages} ${parsed.query}`,
          {
            query: parsed.query,
            ...(parsed.subject?.trim()
              ? { subject: parsed.subject.trim(), preferOfficial: true }
              : {}),
          },
        )
      return yield* runOldTool(
        context,
        TOOL.searchAssets,
        `${text.searchLibrary} ${parsed.query}`,
        { query: parsed.query, kind: parsed.kind },
      )
    }
  }
}
