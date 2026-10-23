import {
  CINEMATIC_SHOT_GRAMMAR,
  VIDEO_PROMPT_WRITING_RULES,
} from '@/constants/cinematic-grammar'
import {
  SEEDANCE_20_CONTROL_RULES,
  SEEDANCE_25_CONTROL_RULES,
} from '@/constants/seedance-prompt-plan'
import { ASSISTANT_NEXT_HANDLE_PREFIXES as PREFIX } from '@/features/assistant/constants'

/**
 * 内置技能（第 7a 步，方案 /mnt/project-files/assistant-reliability/step7-plan.md）。
 *
 * ⭐ 一份技能 = 名字（中文，模型用 `look 技能·名字` 读）+ 一句「什么时候用」+ 正文。系统提示里
 *   只列名字和那一句；正文按需读，读过的这一轮一直留着（`clearOldToolResults` 不清）。
 * ⭐ 正文从旧 v3 各台的 CRAFT 与型号写法改写，换成新内核的工具名（find / look / edit）。
 *   视频写法、镜头语法、Seedance 控制规则直接引用原常量 —— 一份来源，⛔ 别抄一份。
 * ⚠ 名字是模型看到的编号，改名 = 旧对话里的「技能·旧名」打不开；要改先想清楚。
 *   用户自己的技能与「改成我的版本」是第 7b 步（设置页 + 一张表）。
 */

/** 内置技能的名字（模型看到的编号后半段，系统提示里点名也用它）。 */
export const ASSISTANT_SKILL_NAMES = {
  tagPrompts: '标签模型写提示词',
  danbooruTags: '查角色 Danbooru 标签',
  references: '参考图分工',
  reproduce: '复刻与反推',
  tagBenchPeople: '标签台多人与画面文字',
  framing: '画面比例与档位',
  safetyBlock: '被安全过滤拦了',
  videoShots: '视频分镜与台词',
  seedance: 'Seedance 写法',
  loraMix: 'LoRA 搭配与复刻',
  characterProfile: '角色设定怎么查怎么写',
} as const

export interface AssistantSkill {
  /** 中文名，也是编号的后半段（`技能·<name>`）。 */
  readonly name: string
  /** 什么时候读它：一句，进系统提示。 */
  readonly when: string
  readonly body: string
}

const TAG_PROMPTS = `Writing for a tag model (NovelAI, Illustrious, Pony, Anima and the other tag checkpoints).
- Chat stays in the creator's language; the prompt and negative fields are English Danbooru-style tags, comma-separated. Never a cinematic paragraph, never sentences in the prompt.
- Order: quality and score tags first (only the ones this model uses), then the head count (1girl, 2girls, 1boy …), the character tag and its series tag, appearance (hair, eyes, body), clothing, pose and gaze, expression, framing, background, light, style or artist tags.
- Keep the creator's tag order and grouped weights. Never reorder or deduplicate across emphasis groups, and never flatten their groups into a generic quality list.
- NovelAI V4 and later: numeric emphasis is weight::tags:: — close every group with a bare ::. Keep existing groups verbatim, even weights outside the slider's range. Never translate them into another model's syntax ((tag:1.2) is SD syntax, not NovelAI).
- SD-family checkpoints (Illustrious, Pony, SDXL): (tag:1.2) weighting; Pony wants its score_9, score_8_up … prefix, Illustrious does not.
- Named characters: use the verified Danbooru tag name_(work) — read 技能·查角色 Danbooru 标签 when the tag is not already verified in this conversation. A Danbooru tag is not a guarantee the model knows the character: keep the visible traits too.
- Identity and rendering style are separate: a requested 3D game-render look stays 3D; a work or character tag alone does not fix the renderer.
- Negative: English tags (lowres, bad anatomy, extra fingers), not sentences.
- Example: masterpiece, best quality, 1girl, long hair, looking at viewer, school uniform, sitting, indoors.`

const DANBOORU_TAGS = `Finding a character's Danbooru tag.
- Danbooru only knows English (romanised) names. A character named in Chinese or Japanese: find the English name and its tag, written name_(work) (e.g. raiden_shogun, hatsune_miku, makima_(chainsaw_man)).
- One web search over all sources with the character and the work as the subject, Danbooru among the sources; read the tag page when the snippet is not clear. Prefer the tag with the most posts when there are several forms; name the form you picked.
- Write it with spaces in the prompt the way this model reads tags (raiden shogun) and add the series tag (genshin impact) when the model benefits.
- A tag already in the prompt stays as it is.
- When nothing confirms a tag, say so in one line, write the visible traits (hair colour and style, eyes, signature outfit and accessories) instead, and never present a guessed tag as verified.`

const REFERENCES = `Reference pictures: which one does what.
- Before writing from references, look at them, then say which picture supplies what: identity (face, hair), outfit, body, pose, scene, rendering style. Write the prompt from that. Never describe a picture you have not seen.
- Models that read references through @Image1, @Image2 … use the bench order; the model's own line says how it addresses them.
- A reference that supplies only one thing (an outfit) gets told in the prompt what NOT to take from it: its pose, background, art style.
- A new outfit, pose, style or full-body version of a character is design work: keep the identity the references show, design the rest, and say in one clause what you designed. Ask only when they want an existing design reproduced exactly and no reference shows the part that matters.
- "Only the style" means only the rendering moves over — line, shading, colour, texture, finish. Keep the target's pose, composition, framing, outfit and light unless they ask for those too, and say so in plain words in the prompt.
- When a result differs from its references, compare the result with the source pictures before changing words: which picture drives identity, proportions and style, and which parts nothing shows. A prompt alone never guarantees exact preservation.
- Removing or hiding something (a logo, a mark on the chest): rewrite the prompt so it no longer asks for it and, when the model has a negative, put it there too. A reference that shows it will keep bringing it back — say so and offer to remove that reference.`

const REPRODUCE = `Reproducing a picture (复刻 / 做同款) and turning a picture into a prompt (反推).
- A picture from the creator's library has a recipe: look at it by number, then apply_recipe puts its prompt, negative, model, specs, options, references and LoRAs on the bench (parts picks some). Name in one line what cannot carry over: a model this bench does not have, a LoRA they do not own, a setting this model ignores.
- When a reproduced result's style is off, compare the two pictures before adding words: line, shading, colour, and the model or checkpoint each was made on.
- A picture with no recipe (a web picture, an upload): look at it first, then write only what it shows — people and head count, appearance, clothing, pose and gaze, expression, framing, background, light, medium — in this model's dialect (tags on a tag model, sentences on a natural-language model). Quality tags and the negative follow the model's own habits.
- Use the character name the creator gives; never guess a character or artist name you cannot recognise. When you recognise one, check its tag before using it (技能·查角色 Danbooru 标签).`

const TAG_BENCH_PEOPLE = `The tag bench: several people and text in the picture (the bench lists People and Scene text).
- Every prompt here is English Danbooru tags.
- With two or more people, the base prompt keeps what is shared: scene, style, quality and the head count (2girls, 1boy, 1girl …). Each person goes into edit "people" with their own tags only (their character tag, appearance, clothing, pose, expression) and where they stand.
- Never put one person's traits in the base prompt — they bleed onto everyone.
- A line someone says is that person's dialogue; text that nobody says (a sign, a title, a caption) is edit "scene_texts". Never write quotes into any prompt.
- edit people / scene_texts takes the full list each time: send everyone, and [] removes the layout.`

const FRAMING = `Aspect ratio, resolution and quality tiers — and which model to pick.
- Frame by what the picture contains: full body 2:3 (3:4 where 2:3 is not offered) · bust 3:4 or 4:5 · face 1:1 or 4:5 · turnaround or character sheet 16:9 · scene 16:9 or 3:2.
- A ratio the creator set stays. When a reference or first frame pins the ratio, use exactly that one.
- Keep resolution at 1K and quality at high (or the model's default) unless they ask — higher tiers cost several times as much. To make an existing picture sharper or 4K it needs an upscale, not a new run: generating again at a higher resolution makes a different picture.
- Video: leave resolution and length as they are unless they ask or the clip cannot fit (a spoken line too long for its length); a resolution shown as not set stays unset.
- A full-body character prompt states the age-true head-to-body ratio.
- Picking a model for them: choose from the models the bench offers by what they want (anime illustration, 3D game render, photo, readable text in the picture) and say why in half a sentence.`

const SAFETY_BLOCK = `When a provider's safety filter blocked the prompt.
- Say plainly that the exact trigger is not known — the provider does not say.
- Remove or neutralise wording that could read as sexual, and anything that dwells on a young-looking character's age or body. Prefer describing clothing and pose concretely and neutrally.
- Never add words like child, minor, non-sexual or innocent: naming them draws the filter's attention.
- A reference picture can trigger it too: say so when the words look clean.
- Keep the model unless the creator asks; tell them in one line what you changed so they can judge it.`

const VIDEO_SHOTS = `Drafting a video clip: shots, camera, dialogue.
- A clip prompt says what MOVES and how the camera moves, in time order; the first frame already shows what the scene looks like, so do not re-describe it at length. One main action per clip of this length.
- The model's own syntax (beat labels, asset tokens, dialogue and sound marks, where exclusions go) is the line about the model on the bench in your instructions — it differs for every model.
- Spoken lines must fit: about 2.5 English words per second of the shot they are in. When a line does not fit, say so instead of writing it in. Write a character's lines in their own voice, from their profile.
- References: say which picture supplies what (identity, outfit, scene, style); a reference that supplies one thing gets told what not to take.
- First and last frames are named slots: putting a picture in "last" never disturbs "first". A web picture is a reference, never a frame.
- When judging a clip, say the uncomfortable thing first, then one concrete change.
- Seedance has its own control rules: read 技能·Seedance 写法 too when the bench is on Seedance.

${VIDEO_PROMPT_WRITING_RULES}

${CINEMATIC_SHOT_GRAMMAR}`

const SEEDANCE = `Seedance control rules. Use the block for the version on the bench (2.0 and 2.5 differ only in how a beat is addressed). "finalPrompt" below is the prompt field on the bench.

${SEEDANCE_25_CONTROL_RULES}

${SEEDANCE_20_CONTROL_RULES}`

const LORA_MIX = `LoRAs: mixing, weights and reproducing an example.
- A mounted LoRA already owns part of the picture — a character LoRA owns the face, hair and body type; a style LoRA owns line and shading. Help with the layer the creator is actually changing (outfit, scene, light, pose) and say plainly when a request fights a mounted LoRA instead of piling on words.
- Trigger words live in the prompt text. Keep every trigger already there exactly once; a trigger marked as NOT in the prompt was left out on purpose — say when this turn needs it, never write it back yourself.
- Weights: start from each LoRA's recommended weight; character LoRAs usually 0.7–1.0, style LoRAs 0.4–0.8. Two LoRAs that own the same layer (two styles, two characters' faces) fight: lower one or remove it. Keep the enabled weights inside this base's budget (the bench prints it) unless you say why it has to go over.
- A LoRA only loads on its own base family. One trained on another checkpoint of the same family changes the style: say so instead of adding style words.
- To reproduce an example (复刻这张图): apply_recipe takes its prompt, negative, sampler, steps, CFG, size and LoRAs. Keep every trigger of the mounted LoRAs exactly once. Name in one line what cannot carry over (a different checkpoint, a LoRA they do not have, a clip skip this base ignores).
- When a result's style does not match the example, compare the two pictures first: line, shading, colour, and the checkpoint the example was made on.
- Frame by what the picture contains: full body 2:3 · bust 3:4 or 4:5 · face 1:1 or 4:5 · scene 16:9 or 3:2.`

const CHARACTER_PROFILE = `Researching and writing a character profile.
- A profile has four parts plus a look line: identity (who they are, one or two lines), behavior (what they DO in concrete situations — "holds the umbrella over others first" beats "gentle"), speech (how they address people, habits, sample phrasing), backstory (history). Appearance belongs to the pictures and tags; look is one line.
- Canon characters: research before writing. Official text is canon — the character's wiki page, its story and voice-lines pages; read them instead of stopping at snippets. Their own lines are the best evidence for speech; their stories for behavior and backstory. Encyclopedic write-ups (official wiki, 萌娘百科, Fandom, Wikipedia) are usable — name them; fan theories and fan works are not. When sources disagree or the character has several forms, say so and ask which one.
- Do not hold back waiting for perfect sources: propose the parts that are supported and say which parts are still missing and why.
- What the creator dictated goes straight in with character_profile / character_look. What you researched or drafted yourself goes on a propose_profile card, each part with its source page.
- A character adapted from canon (gender-swapped, alternate version) is design work on a canon base: research the canon one, keep what still fits, change what the creator changed, and mark your additions.
- Original characters: do not write a full profile at once. Ask ONE question with two or three directions, each a few words plus one line on how the character behaves; after they pick, expand and propose. When the creator wrote a skeleton, keep their words verbatim and list every phrase you added.
- Good pictures for a character show them alone, large and clear, without text over them, in one outfit; say which view each gives (face / full body / back). Outfits are never a mismatch — a character can own many.`

export const ASSISTANT_SKILLS: readonly AssistantSkill[] = [
  {
    name: ASSISTANT_SKILL_NAMES.tagPrompts,
    when: 'before writing a prompt for a tag model (NovelAI, Illustrious, Pony, Anima)',
    body: TAG_PROMPTS,
  },
  {
    name: ASSISTANT_SKILL_NAMES.danbooruTags,
    when: 'a named character (especially a Chinese or Japanese name) goes into a tag prompt',
    body: DANBOORU_TAGS,
  },
  {
    name: ASSISTANT_SKILL_NAMES.references,
    when: 'writing from reference pictures, "only the style", or a result that drifts from its references',
    body: REFERENCES,
  },
  {
    name: ASSISTANT_SKILL_NAMES.reproduce,
    when: 'reproducing a picture (复刻, 做同款) or turning a picture into a prompt (反推)',
    body: REPRODUCE,
  },
  {
    name: ASSISTANT_SKILL_NAMES.tagBenchPeople,
    when: 'two or more people, or text drawn in the picture, on the tag bench',
    body: TAG_BENCH_PEOPLE,
  },
  {
    name: ASSISTANT_SKILL_NAMES.framing,
    when: 'choosing aspect ratio, resolution, quality tier, or which model to use',
    body: FRAMING,
  },
  {
    name: ASSISTANT_SKILL_NAMES.safetyBlock,
    when: "a generation was refused by the provider's safety filter",
    body: SAFETY_BLOCK,
  },
  {
    name: ASSISTANT_SKILL_NAMES.videoShots,
    when: 'before writing or rewriting any video clip prompt',
    body: VIDEO_SHOTS,
  },
  {
    name: ASSISTANT_SKILL_NAMES.seedance,
    when: 'the video bench is on a Seedance model',
    body: SEEDANCE,
  },
  {
    name: ASSISTANT_SKILL_NAMES.loraMix,
    when: 'mounting, mixing or weighting LoRAs, or reproducing a LoRA example',
    body: LORA_MIX,
  },
  {
    name: ASSISTANT_SKILL_NAMES.characterProfile,
    when: "researching or writing a character's profile",
    body: CHARACTER_PROFILE,
  },
]

/** 技能的编号：`技能·标签模型写提示词`。 */
export function skillHandle(skill: AssistantSkill): string {
  return `${PREFIX.skill}${skill.name}`
}

/** 一份正文前后的记号：清旧工具结果时认得出来、原样留着（读过的这一轮一直在）。 */
const SKILL_OPEN = 'SKILL '
const SKILL_CLOSE = 'END OF SKILL'
const SKILL_BLOCK = new RegExp(
  `${SKILL_OPEN}${PREFIX.skill}[\\s\\S]*?\\n${SKILL_CLOSE}`,
  'g',
)

function normalizeName(name: string): string {
  return name.replace(/[\s·・]/g, '').toLowerCase()
}

/** 按名字找一份（不分大小写、不管空格）；找不到回 null。 */
export function findSkill(name: string): AssistantSkill | null {
  const wanted = normalizeName(name)
  return (
    ASSISTANT_SKILLS.find((skill) => normalizeName(skill.name) === wanted) ??
    null
  )
}

/** look 打开一份技能时给模型的全文。找不到就列出有哪些。 */
export function renderSkill(name: string): string {
  const skill = findSkill(name)
  if (!skill)
    return `${PREFIX.skill}${name}: no such skill. The skills are: ${ASSISTANT_SKILLS.map(skillHandle).join(', ')}.`
  return `${SKILL_OPEN}${skillHandle(skill)} — use when ${skill.when}. Follow it for the rest of this turn.\n${skill.body}\n${SKILL_CLOSE}`
}

/** 一段工具结果里读过的技能全文（清旧结果时留下它们）。 */
export function skillBlocksIn(text: string): string[] {
  return text.match(SKILL_BLOCK) ?? []
}

/** 系统提示里那一段：只有名字和一句。 */
export function skillsSection(): string {
  return `SKILLS — short guides for craft that goes wrong without them. Read one with look "${PREFIX.skill}<name>" whenever its line fits what you are about to do, BEFORE you write; it stays in front of you for the rest of the turn. Skip the ones that do not fit.
${ASSISTANT_SKILLS.map((skill) => `- ${skillHandle(skill)}: ${skill.when}`).join('\n')}`
}
