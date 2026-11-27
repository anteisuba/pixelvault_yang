---
name: artist-style-mixing
description: 'How to compose and tune NovelAI artist strings, decouple style into a prefix Prompt Block, and design clean original scenes on the tag bench. Read whenever composing/tuning an artist string or designing an original tag-bench illustration.'
metadata:
  title: '画师串调配与场景构图'
---

Composing NovelAI artist strings and designing original scenes on the tag bench.

## 1. Fast discovery (keep tool calls minimal)

- If you are on home and the creator asks for a tag-bench artist string or original tag illustration, call `open("tags")` immediately — do not inspect home history first.
- Run **one** `find(kinds: ["tags"], query: "<2–4 style vibes>")` call. It returns the creator's favourite `artist:*` tags, curated NovelAI artist-style matches, and Danbooru hits all together in one step.
- Only batch-`look` (`["标签·artist_a", "标签·artist_b"]`) 1–2 unfamiliar artists when you genuinely need visual confirmation. Never run 4–6 serial searches or inspect old picture recipes when they asked for a fresh style.

## 2. Four-layer artist string recipe

- **Anchor (1 artist, `0.65–0.9`)**: carries eyes, line clarity, and core rendering.
- **Accent / light & colour (1–2 complementary artists, `0.4–0.65`)**: blend from the creator's favourites and curated matches that add distinct lighting, colour harmony, or brushwork. Avoid stacking 4 heavy painterly artists; keep total artist weight sum around **`1.5–2.3`** (above ~2.6 heavy styles fight and distort anatomy or saturation).
- **Medium / texture (optional 0–1 tag, `0.3–0.6`)**: e.g. `painterly`, `watercolor (medium)`, `impasto`, only when it serves the mood.
- **Subtraction (optional negative weight)**: e.g. `-0.8::official art::` or `-0.6::flat color::` only when pulling away from a strong default look.
- **Syntax**: Always use NovelAI's `artist:<name with spaces>` form (e.g. `0.8::artist:rella::, 0.55::artist:guweiz::`). Never write unverified future years (`year 2026`) or conflicting year tags.
- **Variety**: When the creator asks for a fresh mix (or retries), pick a new anchor rather than repeating their previous full recipe.

## 3. Decouple style into a Prefix Prompt Block (`prompt_blocks`)

- On the tag bench, place the artist string in an enabled **fixed prefix** positive block (`position: "prefix"`, `mode: "fixed"`, `weight: 1`, e.g. `name: "画师·夜雨星轨"`, `items: ["0.8::artist:rella::", "0.55::artist:guweiz::", "0.45::artist:dino (dinoartforame)::"]`) so the base `prompt` stays clean for character and scene. Only inline artists directly into `prompt` if the creator asks.
- Always check the existing `Prompt blocks` section on the board first. Pass the full block list to `prompt_blocks`, keeping useful blocks and setting `enabled: false` on conflicting leftover blocks (such as a stray `[随机] 表情` block that would silently append `, smile` to a quiet scene).
- On follow-up turns: when they adjust only style ("太油了 / rella 降一点 / 换清爽水彩"), edit ONLY `prompt_blocks`; when they change only character or scene, edit ONLY `prompt`.

## 4. Clean original scene & NovelAI V5 prompt hygiene

- **Canon characters**: A well-known Danbooru character tag (e.g. `firefly (honkai: star rail)`) already encodes canon hair, eyes, and default outfit. Never dump guessed appearance or outfit colour tags (`brown jacket`, `purple eyes`) — only add clothing/hair tags when intentionally changing their outfit or hairstyle. If you need to verify a character tag, read 技能·查角色 Danbooru 标签.
- **Do not duplicate app chips**: Check `ucPreset` and `qualityToggle` on the board. When `UC · Heavy` (or another UC preset) is active, never hand-write `lowres, bad anatomy, bad hands, blurry, worst quality` into `negative` — use `negative` only for scene-specific exclusions (or leave it empty). When `qualityToggle` is on, do not repeat `masterpiece, best quality, very aesthetic`.
- **NovelAI V5 composition**: Keep the base `prompt` tight (~15–28 clean tags: head count, character + series, key scene props, framing, lighting, mood) plus **1 short plain English sentence** (≤25 words) describing the exact pose, gaze, and object interaction (see 技能·标签模型写提示词/references/novelai.md). Never stack contradictory pseudo-tags (`sitting on windowsill` + `hugging one knee` + `from side` + `cowboy shot`) that twist anatomy.

## 5. Short reply for steering

- In 2 concise lines (in the creator's language), note each artist's role in the prefix block (anchor vs lighting/atmosphere) and any leftover block you disabled, so the creator can steer weights by name next turn.
