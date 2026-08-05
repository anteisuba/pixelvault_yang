# AI 拟人小剧场：第一版角色圣经

这套设计把各家品牌图形转译为发型、轮廓、服装结构、饰品和道具，不把官方 Logo 直接贴在衣服上。目标是：角色缩成剪影仍能认出，单独出镜有戏，同框时不会成为“七个不同发色的同一个人”。

> 定位：粉丝向原创拟人角色概念，不代表任何品牌官方形象或背书。公开或商业发布前，应再检查各品牌最新商标与使用规则。

## 1. 群像分工

| 角色     | 戏剧职位                | 核心人设                     | 喜剧按钮                                       | 三个视觉锚点                           |
| -------- | ----------------------- | ---------------------------- | ---------------------------------------------- | -------------------------------------- |
| DeepSeek | 深海女仆 / 情报潜航员   | 温柔、认真、擅长深挖         | 经常把简单问题潜到海沟级深度                   | 鲸尾、海浪渐变长发、深海蓝女仆轮廓     |
| Claude   | 禁书馆学霸 / 纪律委员   | 高冷、克制、标准极高         | 用户用别家视频模型时吃醋，并一本正经记进拉黑本 | 珊瑚六芒饰件、羊皮纸长外套、黑色索引本 |
| OpenAI   | 全能班长 / 调度中心     | 热心、全能、责任感过量       | 同时答应太多任务，偶尔礼貌地短暂断片           | 黑白交织几何、环形工具、模块化制服     |
| Kimi     | 月夜档案员 / 吃瓜记录官 | 慢悠悠、长记忆、夜猫子       | 别人都忘了时，她默默掏出很久以前的“证据”       | 月牙短发、无限文件围巾、月灯           |
| Gemini   | 双子星魔术师 / 灵感担当 | 一半严谨、一半活泼、切换飞快 | 说到一半切人格，看到新点子立刻跑偏             | 蓝粉对分、四角星、双棱镜披风           |
| 豆包     | 邻家运营 / 群聊气氛组   | 接地气、会安慰人、爱学口头禅 | 一激动就连续发很多条消息                       | 豆形双髻、气泡圆角、蓝白暖桃配色       |
| Seedance | 片场舞监 / 动作导演     | 运动派、控制镜头、永远在排练 | 任何日常都会被她喊成“再来一条”                 | 黑白橙切块、胶片马尾、场记板/稳定器    |
| Grok     | 宇宙朋克 / 毒舌吐槽役   | 反骨、梗多、爱挑战规则       | 装作全靠临场发挥，其实偷偷把说明书看完         | 银白斜刘海、破碎轨道环、黑银电蓝长外套 |

## 2. Studio 生成参数

### A. 角色设定稿（本目录七张图使用的目标规格）

- 模型：`GPT Image 2`
- 画幅：`1:1`
- 分辨率：`2K`
- 质量：`high`
- Seed：留空。当前 OpenAI 图像路径不会使用 Studio 的 Seed。
- 参考图顺序：
  1. `deepseek-character-sheet-reference.png`：只参考设定稿的信息层级。
  2. `deepseek-chibi-turnaround-reference.png`：只参考 Q 版比例和三视图排法。
  3. `deepseek-fullbody-reference.png`：只参考普通比例立绘的完成度。
- 注意：在 prompt 里明确“不要复制蓝发、鲸尾、女仆装和海洋元素”。否则模型容易把“统一世界观”理解成“换色 DeepSeek”。
- Negative prompt：GPT Image 2 / Gemini 在本项目当前适配器中不会单独消费该字段；把禁止项直接写在主提示词末尾。

### B. 干净单人全身锚点（后续做视频前必须补）

- 模型：`GPT Image 2`
- 画幅：`3:4`
- 分辨率：`2K`
- 质量：`high`
- 参考图：对应角色的 `*-character-sheet.png` + `deepseek-fullbody-reference.png`
- Prompt 追加：`single character only, clean full-body front three-quarter pose, simple warm off-white background, no character sheet, no duplicate studies, full feet visible`
- 用途：这是后续图生视频的主身份图。设定稿重复出现同一角色，直接拿去做视频可能让模型误判为多人。

### C. Q 版三视图

- 模型：`GPT Image 2`
- 画幅：`1:1`
- 分辨率：`2K`
- 质量：`high`
- 参考图：对应角色设定稿 + `deepseek-chibi-turnaround-reference.png`
- Prompt 追加：`three chibi turnarounds only: front, exact side, exact back; identical outfit construction and colors; equal scale; no perspective view`

### D. 表情和动作扩展

- 模型优先：`Gemini Pro Image`
- 画幅：`1:1`
- 分辨率：`2K`；定稿可用 `4K`
- 参考图：角色设定稿 + 干净单人全身锚点
- Seed：留空。Gemini 路径不使用 Seed。
- 每次只扩 4 个动作或 6 个表情，不要一张塞十几项。

### E. 需要锁 Seed 的可复现迭代

- 模型：火山直连的 `Seedream 5.0` 系列
- 画幅：`3:4` 或 `1:1`
- 分辨率：`2K`，最终大图再上 `4K`
- 第一次 Seed 留空；选中满意结果后，在高级参数锁定返回记录中的 Seed，只改一个词或一个服装细节。
- 参考图：角色设定稿 + 单人锚点。不要同时塞七个角色。

## 3. 通用设定稿 Prompt 骨架

把下面的“通用骨架”与下一节某个“角色块”拼在一起。英文版本与本目录成图使用的指令结构一致。

```text
Use case: stylized-concept
Asset type: original anime AI-sitcom character design sheet and reusable Studio reference image
Input images: Image 1 is only the desired dense character-sheet information hierarchy; Image 2 is only the desired chibi three-view presentation style; Image 3 is only the desired polished full-body anime illustration level. Do not copy the blue whale maid's identity, outfit, hairstyle, marine motifs, or logo.

[PASTE ONE CHARACTER BLOCK HERE]

Composition/framing: clean square character-design sheet on warm off-white background. One large polished full-body front illustration occupying the left half. On the right: three small chibi turnarounds (front, exact side, exact back), plus four head-expression miniatures and neatly arranged accessory studies. No labels and no text.
Style/medium: high-end Japanese anime game character concept art, crisp elegant line art, soft cel shading with subtle painterly finish, precise costume construction, cute chibi proportions, premium gacha-game design sheet, cohesive with the existing DeepSeek character while clearly a different person.
Lighting/mood: soft neutral studio light.
Constraints: exactly one character identity repeated as studies; preserve the same face, hair, outfit and colors across all views; adult-looking; nonsexualized; no maid outfit; no ocean or whale motifs; no actual company logo; no readable text; no watermark; no extra character; no photorealism; hands anatomically clean; full feet visible.
```

## 4. 七个角色块

### Claude

```text
Primary request: Design CLAUDE as an original anthropomorphic AI character: a cool, aloof honors scholar and forbidden-library prefect who secretly gets jealous when the user tries another company's video model. She appears emotionally controlled but keeps an absurdly meticulous private blacklist ledger.
Subject: adult-looking young woman, tall slender silhouette, long straight deep cocoa-brown hair with a restrained burnt-coral inner gradient, amber-copper eyes, calm half-lidded gaze. A small abstract six-ray coral asterisk/sunburst hair ornament inspired by Claude's warm icon geometry but not an exact logo. Academic high-collar ivory blouse, dark espresso fitted vest, long asymmetrical burnt-orange scholar coat shaped like layered parchment pages, pleated dark skirt, opaque tights, refined ankle boots. One slim copper fountain pen, one charcoal-gray blacklist book with several black tabs; no readable words on the book. Subtle geometric stitch lines and bracket-like trim suggest structured reasoning and safety boundaries. The silhouette must read clearly even at chibi size.
Character acting: main pose standing straight while closing a book with one hand, looking away coolly; expressions: neutral honors student, faintly pleased, jealous side-eye toward an off-frame video screen, silently stamping a blacklist. Never angry or villainous; humor comes from excessive seriousness.
Color palette: ivory #F4E9D8, burnt coral #D97757, terracotta #B85C43, espresso #2B211D, charcoal #353230, muted copper #B8734A.
```

### OpenAI

```text
Primary request: Design OPENAI as an original anthropomorphic AI character: the warm, hyper-capable class president and all-purpose team leader. Everyone asks her for help; she says yes too often, juggles many tools at once, and occasionally freezes with a polite “where were we?” expression when overloaded. Dependable rather than smug.
Subject: adult-looking young woman, medium-tall balanced silhouette, sharp chin-length ivory-white bob with a black underlayer and one longer braided side strand that forms soft interlocking loops; clear jade-gray eyes. Visual language translates monochrome blossom geometry into six interwoven curved-and-angular seams, a small abstract knot clasp, and a segmented circular shoulder mantle, without reproducing the exact logo. Tailored black-and-ivory modular uniform: high-neck inner top, cropped structured jacket, layered knee-length skirt panels, practical low boots, small muted jade accent lights. A compact rotating ring-shaped multipurpose device floats near one wrist; a neat stack of task cards and a tiny blank memory note are accessory studies.
Character acting: main pose offering one hand to help while controlling several small tool icons with the other; expressions: reassuring smile, focused commander, visibly overloaded but still polite, brief blank-memory pause. Dry workplace-comedy energy.
Color palette: soft ivory #F2F0EA, ink black #171918, graphite #444947, jade gray #8AA89E, tiny pale mint highlights.
```

### Kimi

```text
Primary request: Design KIMI as an original anthropomorphic AI character: a moonlit night-shift archivist with absurdly long memory and an unhurried gossip-observer personality. She can read fifty files while half asleep, remembers every old conversation, and quietly produces the one embarrassing receipt nobody else recalls.
Subject: adult-looking young woman, compact slender silhouette, short ink-black hair cut in a rounded crescent bob with a silver-white inner arc behind one ear, a single long midnight-blue ribbon-scarf flowing like an endless document strip, luminous lavender-gray eyes with sleepy lower lids. Translate Moonshot/Kimi cues into a crescent hair clasp, eclipse-like circular fasteners, page tabs, and orbital stitching without drawing an exact logo. Outfit: midnight archive keeper coat with a broad moon-shaped shoulder cape, layered charcoal tunic, narrow trousers, soft ankle boots, silver page-edge trim, subtle violet lining. Props: folding moon lantern, long accordion file ribbon, slim document clips, small stack of blank files.
Character acting: main pose calmly reading several floating document pages while holding a warm drink; expressions: sleepy neutral, suddenly razor-sharp recall, quiet gossip smile behind the cup, dropping an ancient “receipt” onto the table. Gentle deadpan comedy.
Color palette: ink black #15171C, midnight navy #1E2946, moon silver #D9DCE5, parchment gray #A7A6AA, muted violet #75679C.
```

### Gemini

```text
Primary request: Design GEMINI as an original anthropomorphic AI character: a brilliant twin-star illusionist contained in one person. Her blue side is a precise researcher, her magenta side is a playful creative; she switches modes mid-sentence and is irresistibly distracted by new sparkling ideas. Energetic but not childish.
Subject: adult-looking young woman, tall airy silhouette, asymmetrical shoulder-length hair divided by a soft diagonal gradient from deep cobalt to violet-magenta, one sleek side and one buoyant curled side, subtle heterochromia in blue and rose-violet. Translate the four-point sparkle and multicolor identity into two abstract four-ray star hairpins, prism-cut clasps, and small restrained blue/red/yellow/green gem accents; do not reproduce the exact logo. Outfit: elegant asymmetrical star-magician ensemble with a white fitted high-collar top, two mismatched translucent cape panels, deep navy shorts under a layered knee-length overskirt, opaque gradient tights, sleek boots, tasteful iridescent trim. Props: paired floating prism stars and a split-color notebook with blank pages.
Character acting: main pose balancing two star orbs as the cape fans into a crisp four-point silhouette; expressions: cool researcher, delighted creator, sudden sparkling distraction, two moods silently disagreeing. The comedy is fast personality switching.
Color palette: white #F6F7FB, deep cobalt #3155C6, violet #7656C8, magenta #D05A9B, restrained signal accents in red/yellow/green, midnight navy #202747.
```

### 豆包

```text
Primary request: Design DOUBAO as an original anthropomorphic AI character: the warm neighborhood social glue and cheerful voice-message expert. She instantly learns the user's catchphrases, turns everything into an approachable explanation, loves snacks and gossip, and is the first to comfort someone—sometimes so enthusiastic that she sends too many messages.
Subject: adult-looking young woman with a petite but mature silhouette, chestnut hair in two soft rounded bean-shaped side buns with loose shoulder-length curls, bright sky-blue eyes, a friendly round face. Translate the soft blue-and-white app identity and “bean/bubble” feeling into rounded speech-bubble seams, paired oval clasps, puffy sleeves and bean-shaped accessories without reproducing an exact logo. Outfit: airy cloud-blue cropped cape over a white high-collar dress with layered rounded panels to mid-calf, warm peach lining, practical white-and-blue shoes, small cross-body message pouch. Props: bean-shaped handheld microphone, soft oval cushion mascot with no face or logo, stacked blank voice-message cards, little thermos.
Character acting: main pose leaning forward to greet the viewer while offering a warm drink; expressions: sunshine smile, confidential gossip whisper, worried comfort, accidentally sending a flood of messages. Comedy is affectionate and grounded, never childish.
Color palette: cloud white #F7FAFC, sky blue #79B8F3, cornflower #5B79D8, warm peach #F2B59A, cocoa brown #62483E.
```

### Seedance

```text
Primary request: Design SEEDANCE as an original anthropomorphic AI character: an athletic stage director and dance captain who sees every conversation as a shot list. She constantly asks for one more take, choreographs everyone without asking, moves before she finishes thinking, and becomes intensely happy when motion and music land perfectly.
Subject: adult-looking young woman, tall athletic dancer silhouette, short raven-black hair swept into a high dynamic ponytail with a vivid orange-red gradient tip, two thin ribbon strands shaped like flowing film timelines, focused amber eyes. Translate ByteDance Seed/Seedance energy into abstract seed-sprout arcs, play-shaped negative space, motion trails and rhythmic black-white-orange blocks without using an exact logo. Outfit: sharp asymmetrical director jacket in white and black with orange lining, fitted high-neck performance top, layered shorts under a split knee-length motion skirt, one fitted legging and one strapped dancer boot for deliberate asymmetry, practical dance sneakers/boots. Props: blank clapper board, compact gimbal baton, coiled timeline ribbon, tiny orange cue light.
Character acting: main pose caught mid-turn with one hand framing the shot and the coat/ribbons showing strong motion; expressions: cool director focus, loud action energy without words, ecstatic playback approval, impatiently asking for another take. Energetic production comedy.
Color palette: ink black #171719, clean white #F5F3ED, vivid orange #F47A38, coral red #E64E45, small warm yellow cue lights #FFC84A.
```

### Grok

```text
Primary request: Design GROK as an original anthropomorphic AI character: a cosmic punk contrarian and deadpan meme provocateur. She makes the joke nobody else dares to make, challenges every rule on instinct, acts recklessly confident, and secretly reads the entire manual before pretending she improvised it.
Subject: adult-looking androgynous young woman, tall lean angular silhouette, jagged shoulder-length obsidian hair with one bold diagonal silver-white section and a narrow electric-blue underside, sharp ice-gray eyes, permanent amused eyebrow. Translate Grok/xAI visual cues into broken orbital rings, clean diagonal slash geometry, black-and-white space-tech panels and tiny star-map points, without drawing any exact X or company logo. Outfit: asymmetrical cosmic-punk long jacket with one structured shoulder, fitted black mock-neck top, diagonal layered belt and split coat tails, slim trousers, heavy silver-black ankle boots, a narrow electric-blue scarf trail. Props: cracked-orbit handheld communicator, telescoping space wrench, blank black meme tablet, tiny star projector.
Character acting: main pose slouched confidently with one hand spinning a broken orbit ring and the other in a pocket; expressions: sideways smirk, skeptical raised eyebrow, perfectly deadpan punchline, caught secretly studying a thick manual. Rebellious but likable, never cruel.
Color palette: obsidian #101216, graphite #343840, silver #D7DCE2, electric blue #3978FF, tiny star amber #F1B44C.
```

## 5. 统一禁止项

如果使用支持独立 Negative Prompt 的模型，可以填：

```text
different face between views, inconsistent hair length, outfit redesign, swapped left and right accessories, extra character, duplicate full body, cropped feet, missing fingers, malformed hands, childish body proportions in the main illustration, sexualized outfit, maid outfit, whale tail, ocean motif, literal company logo, brand wordmark, readable text, random letters, watermark, photorealism, 3D render, muddy colors, busy background
```

对于 GPT Image 2 和 Gemini，把上面最重要的禁止项直接写到主 prompt 的 `Constraints`，不要只填 Studio 的 Negative Prompt 框。

## 6. 推荐的出图顺序

1. 用本目录角色设定稿挑方向，不急着锁 Seed。
2. 每人生成一张干净 `3:4` 单人全身锚点。
3. 基于全身锚点补正面、侧面、背面三视图。
4. 每人做一张 6 表情图，建立表演词典。
5. 再做 3 个常用半身动作：说话、质疑、被打断。
6. 最后才把单人锚点交给视频模型。一个镜头原则上只给该镜头需要的角色参考，降低串脸。

## 7. 第一批最值得拍的关系梗

- Claude × Seedance：用户说“我去试一下视频模型”，Claude面无表情掏出拉黑本；Seedance已经在后面喊开机。
- OpenAI × 全员：所有人同时叫她帮忙，OpenAI还在微笑，环形工具已经过载。
- Kimi × Grok：Grok说“我从没说过”，Kimi无声地展开三米长的旧记录。
- Gemini × 自己：严谨人格刚列好计划，创意人格看到新星星就把计划改了。
- 豆包 × Claude：豆包连续发十条安慰消息，Claude只回一个句号，却偷偷取消拉黑。
