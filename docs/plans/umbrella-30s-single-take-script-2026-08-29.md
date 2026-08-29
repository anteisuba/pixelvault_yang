# 《借伞》30 秒单镜 · 生产脚本（Seedance 2.5）

> 2026-08-29。owner 拍：试 30 秒单镜、要很详细的提示词、要关键帧控制、要镜头语言与人物情绪。
> 本脚本严格按 [BytePlus 官方 Seedance 2.5 提示词指南](https://docs.byteplus.com/en/docs/ModelArk/2607689) 的规矩写。

## 一、为什么不走「关键帧」模式而走「全能参考」

官方把任务分成 **locked / unlocked** 两类：

| 走法                     | role                               | 锁什么                                 | 关键帧数                                                 |
| ------------------------ | ---------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| 首帧 / 首尾帧            | `first_frame` / `last_frame`       | **锁 ratio 必须 adaptive**（跟首帧图） | 只有 1–2 个锚点                                          |
| **多关键帧**（本片采用） | `reference_image` + 提示词首句声明 | **不锁**，时长/宽高比自定              | 任意多个，官方原话「生成画面会**相对严格地对齐**输入图」 |

多关键帧的官方触发方式是**提示词第一句**写：

> "Use Images 1 to N in order as keyframes."

所以模式选**全能参考**，图按顺序上传，靠这句话把它们变成关键帧。30 秒 + 16:9 因此都能保住。

## 二、素材编号与绑定（官方要求逐条显式绑定，不能只靠图里写字）

| 编号      | 内容                              | 角色           |
| --------- | --------------------------------- | -------------- |
| Image 1–5 | 五个节拍的关键帧                  | 关键帧（按序） |
| Image 6   | 雨宮ひなた 角色设定图             | 外观身份锚     |
| Image 7   | 篠原湊 角色设定图                 | 外观身份锚     |
| Audio 1   | ひなた 音色样本（3s，アニメ少女） | ひなた 的音色  |
| Audio 2   | 湊 音色样本（2s，落ち着いた男性） | 湊 的音色      |

> ⚠ 音频绑定只有画布那条路能发（工作台无音频通道，见 findings A 条）。
> 2.5 的音频参考**可独立存在**（`audioRequiresVisual: false`），2.0 不行。

## 三、五个节拍（关键帧 = 每拍的起始画面）

> ⚠ **2026-08-29 owner 改了故事内核**：原设定是「她其实带了伞、插在包侧袋里，假装忘带」。
> 现改为——**她是真的没带伞**，男生帮她撑伞。那把折叠伞整个删掉，包侧袋是空的。
> 连带**题眼也换了**（见下）。

| #   | 时间   | 地点       | 画面                                                 | 镜头语言                       | 情绪                       |
| --- | ------ | ---------- | ---------------------------------------------------- | ------------------------------ | -------------------------- |
| 1   | 0–6s   | 昇降口     | 她被雨困在屋檐下，伸手接雨又收回                     | 中景，固定机位，平视，缓慢推进 | 为难、无奈——今天真的没带伞 |
| 2   | 6–11s  | 昇降口门口 | 湊 撑开深藏青长柄伞走进画面，默默把伞往她那边偏      | 中近景，过肩                   | 他不多问；她愣了一下       |
| 3   | 11–19s | 紫阳花坡道 | 两人共伞走，他右肩湿了一片                           | 全景，跟移（背后跟随）         | 她偷看那片湿掉的肩膀，抿嘴 |
| 4   | 19–26s | 商店街口   | 雨小了，屋檐下停步道别                               | 中景，低角度                   | 想说点什么又只说了再见     |
| 5   | 26–30s | 商店街口   | 她走开几步后回头，看见他走远的背影，右肩那片湿痕还在 | 拉远成全景，固定               | 心里记住了这件事           |

**贯穿符号（题眼）**：**湊 右肩上那片被雨淋湿的深色痕迹**。他一路把伞往她那边偏，
自己半边肩膀在伞外——第 2 拍开始出现，第 3 拍被她看见，第 5 拍最后一眼仍然在。
这是他为她做的事的物证，替换掉原来那把「藏起来的折叠伞」。

## 四、台词（日语 · 官方示例的写法是直接内嵌在时间段描述里）

| 时间 | 说话人 | 台词                         | 中文             |
| ---- | ------ | ---------------------------- | ---------------- |
| 4s   | ひなた | 「あっ……傘、忘れちゃった。」 | 啊……伞，忘带了。 |
| 8s   | 湊     | 「入る?」                    | 要进来吗？       |
| 17s  | ひなた | 「……ありがとう。」           | ……谢谢。         |
| 25s  | 湊     | 「じゃあ、また明日。」       | 那，明天见。     |
| —    | —      | 结尾无台词，只留雨声与脚步声 |                  |

## 五、最终提示词（送进模型的原文）

```
Use Images 1 to 5 in order as keyframes.

Asset bindings: Image 6 is 雨宮ひなた (Hinata) and corresponds to Audio 1; Image 7 is
篠原湊 (Minato) and corresponds to Audio 2. Character appearances must strictly follow
Image 6 and Image 7, remain consistent throughout the entire video, and avoid face changes.

One-sentence summary: On a rainy June afternoon in a Japanese high school, a girl who forgot
her umbrella is walked home under a boy's umbrella, and he keeps it tilted her way until his
own shoulder is soaked — cel-shaded 2D Japanese anime, slow deliberate camera work.

0s-6s: [Medium shot, locked-off camera, eye-level, slow push in] Hinata stands at the edge of
the shoe-locker entrance steps, reaching one hand out past the eaves to catch the rain, then
drawing it back. She has no umbrella with her; her canvas tote bag's side pocket is empty. She
looks out at the rain, brows drawn together, stuck. She says quietly: 「あっ……傘、忘れちゃった。」
Rain falls in dense curtains; water runs off the eaves in thin lines.

6s-11s: [Medium close-up, over-the-shoulder from behind Hinata] Minato walks into frame from
the right, opens a large navy long umbrella, and without asking anything tilts it toward her,
leaving his own right shoulder outside the umbrella. He says: 「入る?」 Hinata blinks, caught
off guard, then steps under.

11s-19s: [Wide shot, tracking from behind, following the two of them] The two walk down a
sloping path lined with blue and purple hydrangeas, sharing the navy umbrella. Minato's right
shoulder is visibly soaked through, a dark wet patch spreading on his white shirt, because he
keeps the umbrella tilted toward her. Hinata glances sideways at that wet shoulder and presses
her lips together, then says softly: 「……ありがとう。」

19s-26s: [Medium shot, low angle] They stop under the awning at the entrance of a covered
shopping arcade. The rain has softened. The dark wet patch on Minato's right shoulder is still
clearly visible. He shakes the water off his umbrella and says: 「じゃあ、また明日。」

26s-30s: [Pull back to wide shot, locked-off camera] Hinata walks a few steps away, then turns
and looks back. Minato is walking off into the distance, and the dark wet patch on his right
shoulder is still there. Warm light breaks through the thinning rain clouds behind him.

Additional notes: Cel-shaded 2D Japanese theatrical anime — flat color fills, clean line art,
two-tone hard-edged shading with no gradients. Not photographic, not photorealistic rendering,
not 3D. Consistent overcast rainy-season daylight throughout. Natural environmental audio only:
rainfall, footsteps on wet ground, water dripping from the umbrella. No BGM. No subtitles.
```

## 六、生成参数

| 项     | 值                                | 依据                                                  |
| ------ | --------------------------------- | ----------------------------------------------------- |
| 模型   | Seedance 2.5 参考（**BytePlus**） | owner 拍板走国际版火山；fal 线贵 2.2×                 |
| 时长   | 30s                               | 2.5 上限；`VIDEO_GENERATION.MAX_DURATION` 已放开到 30 |
| 分辨率 | 720p                              | owner 定                                              |
| 宽高比 | 16:9                              | 走参考通道不锁 ratio，可自定                          |
| 预估   | 30 × $0.231 ≈ **$6.93**           | 与切五段等价                                          |

## 七、关键帧的出图设定（owner 2026-08-29 定）

- **模型 = OpenAI GPT Image 2**（owner：「生图模型选择 gpt 吧，那边生成的质量更好」）。
  先用 Seedream 5.0 Pro（BytePlus）试过一版，出的是**照片写实**质感；换 GPT 后
  才拿到真正的赛璐璐。
- **风格 = 赛璐璐 2D 日本动画**：扁平色块上色、干净描线、两段式硬边界阴影。
  提示词里要**显式否定**「不是照片，不是写实渲染，不是 3D」，否则会往写实漂。
- 规格 16:9 · 2K。
- **每张关键帧都要挂 KF1 当风格锚**，保证五张内部统一；角色设定图只用来锁外观特征。
- ⚠ **必须显式点名「浅蓝色发卡」**：不点名时模型会漏掉它，而它是角色识别锚点之一。
- ⚠ **必须显式写「包侧袋是空的、不要画任何伞」**：因为 ひなた 的角色设定图上还带着
  那把旧设定里的折叠伞，不否定就会被带出来。

⚠ **湿肩要说两遍才画得出来**：第一次只写「右肩露在伞外、已被雨打湿成深色」，出图里
衬衫基本是干的、伞还罩着他。补一段「再强调一次」——① 伞柄明显向左倾、他右半边身体
完全在伞的覆盖之外；② 湿痕颜色明显比周围深、边缘不规则、布料贴在皮肤上——才做出来。
**新题眼比旧题眼更难画**，因为它是材质变化而不是一个物件。

⚠ **风格锚会连构图和场景一起带过来**（KF3 第一次失败的原因）：把 KF2 挂上当「画风参照」，
结果生成出来的 KF3 **连昇降口的鞋柜背景和过肩构图都照抄了**，提示词里写的紫阳花坡道、
背后跟移全部没生效。多参考图时，最后挂上去的那张成品图权重压过了文字描述。
**修法 = 在提示词里显式隔离**：写明「参考图4 **只**提供画风与两位角色的长相，
**不要**照抄它的构图与场景」，并且把新场景**正面加否定**一起写死
（「场景必须是紫阳花坡道；画面里不要出现鞋柜、昇降口、校舍」）。

## 八、待办

- [x] KF1 定稿（昇降口，中景，发卡在、包侧袋空）— 图片工作台 · GPT Image 2
- [x] KF2 定稿（过肩，伞左倾、右肩湿痕清晰）— 图片工作台
- [x] KF3 定稿（紫阳花坡道，背后跟移，共伞同行）— **画布镜头图节点**
- [x] KF4 定稿（商店街拱廊，低角度，面对面道别）— 画布
- [x] KF5 定稿（拉远，她回头，他走远，暖光破云）— 画布
- [x] 在画布视频节点上挂 **5 张关键帧 + 2 条音色**，填提示词，跑一次
- [x] **成片已出**（2026-08-29，单次运行，未重跑）

## 十、成片

`https://cdn.anteisuba.com/generations/5769e1e2-d2b5-4a15-9d0d-f9cd10a60bcd/video/2026-08-29_844be669ac2d6d7349bd7876.mp4`

| 量到的值       | 结果                                                                 |
| -------------- | -------------------------------------------------------------------- |
| 时长           | **30.04 秒**                                                         |
| 分辨率         | **1280 × 720**                                                       |
| 宽高比         | 16:9                                                                 |
| 音轨           | **有**（`webkitAudioDecodedByteCount` = 484,581）                    |
| 送进模型的素材 | 详情面板显示 **7 inputs · 0 dropped** —— 挂的 7 个全部生效，无一被丢 |
| 渲染耗时       | 约 18 分钟                                                           |

**逐拍抽帧核对（五拍全部按序落地）**

| 时间 | 画面                                           | 对不对                  |
| ---- | ---------------------------------------------- | ----------------------- |
| 0–6s | 昇降口鞋柜走廊，她伸手接雨，发卡在、包侧袋空   | ✓                       |
| ~9s  | 过肩镜头，她背影在前景，黑框眼镜男孩撑深藏青伞 | ✓                       |
| ~15s | 紫阳花坡道，两人背对镜头共伞往深处走           | ✓                       |
| ~20s | 商店街拱廊入口，两人面对面                     | ✓（比要求的低角度略平） |
| ~29s | 夕照街道，她在近处，他背影在远处变小           | ✓                       |

⚠ 详情面板把两条音色标成「音1 · 旁白 / 音2 · 旁白」，没有按角色映射；
角色归属只靠提示词里那句「音频1 是女孩的音色，音频2 是男孩的音色」承载。
成片里两人的声音是否真的分开，需要**听**一遍才能判定——目检看不出来。

## 九、实际送进模型的配置（2026-08-29 单次运行）

| 项       | 实际值                                          |
| -------- | ----------------------------------------------- |
| 模型     | **Seedance 2.5 · BytePlus**                     |
| 图片用途 | **全能参考**（多关键帧走参考通道，见第一节）    |
| 规格     | **720p / 30 秒 / 16:9**                         |
| 素材     | **图 5 · 音 2 · 视频 0，总额 7/50**             |
| 提示词   | **788 / 2000 字**，五个时间段齐、四句日语台词齐 |

**角色设定图没有单独挂**——五张关键帧本身已经把两人的样子锁死了，且都是赛璐璐成品；
再挂设定图（写实线稿风）反而可能把画风拉走。音色改成直接挂 `音频`（composer 的
`+ → 音频`），比接角色卡少两跳，效果等价。

⚠ **提示词是分两次写进去的**（先写抬头、后补分镜），中间因为坐标系搞错，
第一次的分镜误追加到了 **KF3 镜头图节点**的提示词里 —— 那个节点的提示词现在是
「KF3 出图提示词 + 30 秒分镜」的混合体。KF3 的图早已生成，不影响成片；
但**若日后重新生成 KF3，先把它的提示词清干净**。

**KF3–KF5 改在画布做**（owner：「图片生成这边也可以在画布中做，这样也能检查画布里面
设计不足的地方」）。画布的出图能力本身没问题，撞到的交互问题记在
`generation-capability-findings-2026-08-29.md` N–T 条。
