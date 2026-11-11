# 首页 v6 · 素材制作单

> 2026-11-06。owner 在站内跑，挑好的文件放进 `.claude/mockups/home-v6/assets/`（按下面的文件名），我接进小样。
> 一条线：**先定 ANTEI 全身形象**，后面三步都拿它当参考。全部全年龄。
> 提示词用英文（出图更稳），每段下面一句中文说明。参考图「头像」= `.claude/mockups/home-v6/her/her.webp`。

## 谁来跑（11-06 owner 开 ANTEI MCP 给 Claude）

ANTEI 的 MCP 只能出**图片**（`generate`，每次要你亲自点确认），不能挂 LoRA、不能出视频和配音。所以：

| 步骤                    | 谁跑                                     |
| ----------------------- | ---------------------------------------- |
| 1 全身定妆 + 三视图     | Claude 经 MCP 发起，你点确认             |
| 2 角色画风（要挂 LoRA） | 你在 LoRA 台跑                           |
| 3 宣传镜头：首帧        | Claude 经 MCP 发起，你点确认             |
| 3 宣传镜头：视频        | 你在视频台跑（首帧用 Claude 出好的那张） |
| 4 配音                  | 你在配音间跑                             |

前提：头像 `her.webp` 先传进你的素材库（MCP 的参考图只认库里的图）。

---

## 第 1 步 · ANTEI 全身定妆（先跑这一步，定了再往下）

**台**：图片台 · **模型**：GPT Image 2（11-06 首轮比 Gemini 更贴头像、分辨率也够）· **参考图**：头像 · **规格**：3:4 · 2K

> 11-06 首轮（粉白平涂、约 4 头身，图\_2017–2020）owner 评「都不太行」，给了一张鲸鱼女仆三视图当样板。从样板学到的六条：
>
> 1. **头身**：约 2.5 头身，大头小身短腿（首轮 4 头身太「人」）
> 2. **线**：干净、等粗的深色描线，用发色的深色不用黑（首轮几乎没线，糊成一片）
> 3. **上色**：两阶赛璐璐 + 头发高光带 + 多层眼睛高光 + 发梢渐变（首轮平涂，发灰）
> 4. **颜色**：一个色相家族 + 白 + 少量金；裙子用深色压住画面（首轮全是浅粉，没有重心）
> 5. **母题贯穿**：样板的鲸鱼 = 耳鳍 + 尾鳍 + 围裙印花；她的猫要同样出现三处以上（耳、尾带铃铛、围裙猫剪影 + 爪印口袋）
> 6. **剪影与细节密度**：拖到膝的大量卷发 + 呆毛、大号蕾丝头饰、裙摆金色刺绣、层叠蕾丝衬裙、胸针、蝴蝶结

```
Chibi character design of ANTEI, the same girl as the reference image: keep her face, pink hair,
pink cat ears and thin round dark-rose glasses. Super-deformed chibi proportions, about 2.5 heads
tall: big head, small body, short legs.
Clean confident line art in dark rose-brown (not black), even line weight. Polished anime cel
shading in two tones, glossy hair with soft highlight bands, big sparkling rose-pink eyes with
layered highlights, hair fading from soft pink at the top to deeper rose at the tips.
Very long voluminous wavy pink hair reaching her knees, a small ahoge, a big lace-trimmed maid
headband in front of her cat ears with a small pink bow on each side.
Cat motif repeated: pink cat ears with cream inner fur, a cat silhouette embroidered on the apron,
a paw-print pocket, a fluffy pink cat tail with a ribbon bow and a tiny gold bell.
Outfit "little maid": deep rose maid dress with puffed long sleeves and white frilled cuffs, white
collar with a small gold cameo brooch, white frilly apron, layered white lace petticoat under the
hem, thin gold embroidery along the skirt hem, white frilly socks, dark rose Mary Jane shoes with
small bows. She holds a small silver tray with a teacup and a tiny paint palette, gentle smile.
Palette: pinks to deep rose, white, small gold accents. Standing, front view, full body head to toe,
centered, plain white background, no text. All-ages, cute and modest.
```

说明：保留头像的脸、粉发、猫耳、圆眼镜；其余按上面六条改。「小女仆」（owner 11-06 改定，替掉小画师）= 深玫瑰色女仆裙（泡泡长袖 + 白荷叶袖口、金色浮雕胸针、裙摆金线、层叠蕾丝衬裙）+ 白围裙（猫剪影刺绣 + 爪印口袋）+ 大号蕾丝头饰 + 带铃铛的猫尾，手托银色小托盘：一杯茶 + 一块小调色盘（替你打理 + 替你创作）。全年龄、端庄。

**满意后再出一张三视图**（同一组参数，参考图换成选中的全身图，比例 16:9）：

```
Character turnaround sheet of the same girl from the reference: front, side, back views, standing,
same outfit and colors, same flat cel-shaded style, plain white background, evenly spaced, no text.
```

这一步同时就是「画图」卡的演示素材：演示时出这一组 4 张，她挑中你选的那张。

交回：4 张全部（`antei-full-1..4.png`，选中的那张另存 `antei-full.png`）、`antei-turnaround.png`（三视图）

---

## 第 2 步 · 「角色」卡：同一个她，换画法

演示时依次出 8 格：先是现有 LoRA 四格（`lora-body-1..4`，不用重跑），再是 ANTEI 四种画风。

**台**：LoRA 台 · **底模**：Anima（同 `lora-body` 那组）· **参考图**：`antei-full.png`，参考强度 0.45 · **规格**：3:4 · 每种 2 张挑 1
**画风 LoRA**：从你库里挑 4 把差异最大的（例如水彩 / 赛璐璐 / 厚涂 / 铅笔清线），权重 1.0 起，不像就往 1.4 调

```
ANTEI, chibi girl with very long pink wavy hair, cat ears, round glasses, deep rose maid dress, white frilly
apron, lace maid headband, cat tail with a bell, holding a small tray with a teacup, full body, standing, smiling, simple background
```

交回：`antei-style-1..4.png` + 一行说明每张挂的是哪把 LoRA（过程行只写「LoRA 台」，不写模型名）

---

## 第 3 步 · 「视频」卡：宣传镜头（保留镜头感）

每个镜头两段：先在**图片台**出首帧（参考图 `antei-full.png`，16:9 · 2K），再到**视频台**用 **Seedance 2.0**（首帧 = 这张图）出 5 秒、1080p、静音。挑 3–4 个最好的，首页按顺序轮播。

| #   | 镜头            | 首帧提示词                                                                                                           | 视频提示词（运镜）                                                                                                                                |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 推镜 · 回头     | `ANTEI from behind, painting at an easel in a bright white studio full of pastel drawings, morning light, wide shot` | `Slow dolly-in toward her; she turns around, looks at the camera and smiles; hair and cat ears sway gently`                                       |
| 2   | 环绕 · 颜料成光 | `ANTEI standing in the center of a white studio, holding a paintbrush up, medium shot`                               | `Camera orbits half a circle around her; she flicks the brush and pink paint drops turn into floating sparkles`                                   |
| 3   | 低机位跟拍      | `ANTEI in her maid dress running along a pastel city street carrying a small tray, low angle, golden hour`           | `Low tracking shot following her run, the teacup wobbles but never spills, wind in her hair and apron, cat ears bouncing, shallow depth of field` |
| 4   | 俯冲 · 天台     | `ANTEI on a rooftop at sunset waving, city below, wide aerial view`                                                  | `Fast aerial swoop down from the sky to her; she waves at the camera`                                                                             |
| 5   | 特写拉远        | `Close-up of ANTEI's round glasses reflecting a colorful drawing`                                                    | `Pull back from the glasses reflection to reveal her sitting in front of a wall covered with her artworks`                                        |
| 6   | 收尾定格        | `ANTEI facing the camera, centered, plain white background, holding her tray with a teacup`                          | `She gives a small salute and a wink, camera slowly pushes in, ends on a still frame`                                                             |

交回：`antei-shot-1..6.mp4`（只交挑中的）+ 各自首帧 `antei-shot-N.png`

---

## 第 4 步 · 「配音」卡：多条台词

**台**：配音间 · **模型**：Fish Audio S2.1 · 每条三语各一条（zh / ja / en），mp3 64kbps 单声道
**ANTEI 的声音**：在音色库挑一把「温柔、元气、年轻女声」，三语各挑母语音色（同 v4 做法）；挑好后告诉我音色名

| #   | 谁               | zh                                     | ja                                                     | en                                                   |
| --- | ---------------- | -------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| 1   | ANTEI            | 嗨，我是 ANTEI。想做什么，跟我说就好。 | やっほー、ANTEI だよ。作りたいもの、なんでも言ってね。 | Hi, I'm ANTEI. Tell me what you want to make.        |
| 2   | ANTEI            | 画好啦，第二张的光最好看！             | できたよ！二枚目の光がいちばんきれい！                 | Done! The light in the second one is the best.       |
| 3   | ANTEI            | 欢迎回来，今天也辛苦啦。               | おかえりなさいませ。今日もお疲れさまでした。           | Welcome back. You worked hard today.                 |
| 4   | 旁白（低沉男声） | 很久很久以前，有一只会画画的猫……       | むかしむかし、絵を描く猫がいました……                   | Once upon a time, there was a cat who could paint... |
| 5   | 元气少年         | 好，出发啦！                           | よし、出発だ！                                         | Alright, let's go!                                   |

演示时每次点「配音」卡随机放一条（ANTEI 的三条优先），头像跟着说话的人换。

交回：`voice-<#>-<zh|ja|en>.mp3`，以及每条用的音色名

---

## 交回之后我做的

1. 素材放进小样，四张卡按上面换掉；过程行只写台名
2. 「画图」卡封面换成 `antei-full.png`，演示出 `antei-full-1..4`
3. 量体积：视频转 720p webm、图片转 webp，首屏只加载封面
