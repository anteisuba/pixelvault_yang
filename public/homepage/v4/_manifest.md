# v4 资产清单（自动提取自 homepage-slide-v2-2026-08-28.html）

规格版 HTML（base64 已替换为下列路径，可直接浏览器打开）：`docs/plans/prototypes/homepage-slide-v2-SPEC.html`

⚠ **2026-08-28 P1 已把 `asset-NN.*` 全部改成语义名**（映射表见文末）。SPEC HTML 里写的仍是旧的
`/homepage/v4/asset-NN.ext`——**它是历史规格快照，不再更新**；后续批次（P2/P3/P4）引用资产
一律以本文件的语义名为准，或直接读 `src/constants/homepage-v4.ts`。

| 文件                                | 类型       | 大小  | 出现处前文（用于判断归属/重命名）                                                                                                                                                                                            |
| ----------------------------------- | ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hero-01-luna-moth-480.webp          | image/webp | 47KB  | `>保留每一次结果。</span></span></h1>' +       '  </div>' +       '  <div class="op-strip l3" id="op-strip">' + '        <figure><img class="a" src="`                                                                       |
| hero-02-desert-observatory-480.webp | image/webp | 19KB  | `…" alt=""><img class="b" alt=""></figure>' + '        <figure><img class="a" src="`                                                                                                                                         |
| hero-03-black-clay-480.webp         | image/webp | 25KB  | `…" alt=""><img class="b" alt=""></figure>' + '        <figure><img class="a" src="`                                                                                                                                         |
| hero-04-risograph-laundry-480.webp  | image/webp | 78KB  | `…" alt=""><img class="b" alt=""></figure>' + '        <figure><img class="a" src="`                                                                                                                                         |
| hero-05-frost-flower-480.webp       | image/webp | 30KB  | `…" alt=""><img class="b" alt=""></figure>' + '        <figure><img class="a" src="`                                                                                                                                         |
| hero-06-watch-robot-480.webp        | image/webp | 29KB  | `…" alt=""><img class="b" alt=""></figure>' + '        <figure><img class="a" src="`                                                                                                                                         |
| hero-07-snow-train-480.webp         | image/webp | 75KB  | `…" alt=""><img class="b" alt=""></figure>' + '        <figure><img class="a" src="`                                                                                                                                         |
| hero-08-glacial-river-480.webp      | image/webp | 26KB  | `…" alt=""><img class="b" alt=""></figure>' + '        <figure><img class="a" src="`                                                                                                                                         |
| hero-09-ruby-chair-480.webp         | image/webp | 12KB  | `…" alt=""><img class="b" alt=""></figure>' + '        <figure><img class="a" src="`                                                                                                                                         |
| hero-10-cenote-diver-480.webp       | image/webp | 19KB  | `…" alt=""><img class="b" alt=""></figure>' + '        <figure><img class="a" src="`                                                                                                                                         |
| ～～故事素材六件～～                | －         | －    | **已于 2026-08-29 整组退役**：占位故事「夜航的信」换成站内自产的《借伞》，新素材落在 `public/homepage/production/umbrella/`（不在本目录）。映射见文末。                                                                      |
| model-gpt-image-2.jpg               | -          | 140KB | `距景深，海报排版含主标题与三行日程小字，16:9，主体偏右' },         { t:'prompt', p:'杂志内页：三栏排版介绍一座海边小城，含标题与图注' },         { t:'prompt', p:'透明背景的机械怀表产品图，金属细节清晰' } ],       img: ` |
| model-gemini-3-pro-image.jpg        | -          | 402KB | ` gallery: [         { t:'img' },         { t:'prompt', p:'同一间咖啡店，把招牌改成霓虹「ANTEI」，其余保持不变' },         { t:'prompt', p:'黄昏的上海外滩，真实光照与地标' } ],       img:`                                 |
| model-flux-2-pro.jpg                | -          | 269KB | `     gallery: [         { t:'img' },         { t:'prompt', p:'棚拍：一只做旧皮革相机包，柔光箱侧光，商业产品图' },         { t:'prompt', p:'概念设定：晨雾里的悬浮渔船市场' } ],       img:`                                |
| model-seedream-5.jpg                | -          | 390KB | `gallery: [         { t:'prompt', p:'国风茶馆招贴：雨后江南茶馆窗景，水汽氤氲，宋体大标「茶事」与竖排小字对联，暖光，16:9，主体偏右' },         { t:'prompt', p:'一页中文信息图：AI 模型对比表' } ],       img:`             |
| model-recraft-v4-pro.webp           | -          | 89KB  | `      gallery: [         { t:'img' },         { t:'prompt', p:'极简线条风格的金库 LOGO，矢量感，黑白' },         { t:'prompt', p:'品牌名片套装平铺图，含整段可读文字' } ],       img:`                                      |
| model-novelai-v5.webp               | -          | 84KB  | `]],       gallery: [         { t:'img' },         { t:'prompt', p:'四格漫画：两位角色在天台对话，日系分镜' },         { t:'prompt', p:'三人组合立绘，性格鲜明，互不串脸' } ],       img: `                                  |
| model-novelai-v5-b.jpg              | -          | 128KB | `…', mime: 'image/webp', src: 'novelai.net 官方样图', layout: 'wall', mime2: 'image/jpeg', wallImgs: [`                                                                                                                      |
| model-novelai-v5-c.jpg              | -          | 101KB | `…',`                                                                                                                                                                                                                        |
| model-illustrious-xl.webp           | -          | 59KB  | `']],       gallery: [         { t:'img' },         { t:'prompt', p:'银发机械师少女，工装，全身立绘' },         { t:'prompt', p:'同一角色的三视图（正 / 侧 / 背）' } ],       img: `                                         |
| model-illustrious-xl-b.webp         | -          | 30KB  | `…', mime: 'image/webp', src: 'illustriousxl.org 官站展示', layout: 'wall', wallImgs: [`                                                                                                                                     |
| model-illustrious-xl-c.webp         | -          | 43KB  | `…',`                                                                                                                                                                                                                        |
| model-lora-illustrious-xl.webp      | -          | 14KB  | `','图片 API + Runner 双区'],['可调','负面词 · 引导 · 步数 · 种子 · LoRA']],       gallery: [{ t:'prompt', p:'银发机械师少女在工房回眸，挂载自训角色 LoRA，动漫立绘，16:9，主体偏右' }],       img: `                        |
| model-lora-wai-illustrious.webp     | -          | 136KB | `y Runner'],['底系','Illustrious 家族'],['可调','负面词 · 引导 · 步数 · 种子 · LoRA']],       gallery: [{ t:'prompt', p:'甜系动漫少女特写，樱花景深，精致眼瞳，16:9，主体偏右' }],       img: `                              |
| model-lora-anima-pencil-xl.webp     | -          | 70KB  | `Comfy Runner'],['风格','铅笔 · 清线 · 插画'],['可调','负面词 · 引导 · 步数 · 种子 · LoRA']],       gallery: [{ t:'prompt', p:'铅笔清线风少年侧脸，白底速写感，留白构图，16:9' }],       img:`                               |
| model-lora-pony-v6-xl.webp          | -          | 97KB  | `建 Comfy Runner'],['语法','score 系触发词'],['可调','负面词 · 引导 · 步数 · 种子 · LoRA']],       gallery: [{ t:'prompt', p:'奇幻混搭插画：龙与少女，浓彩厚涂，16:9，主体偏右' }],       img: `                             |
| model-lora-sdxl-10.webp             | -          | 64KB  | `'自建 Comfy Runner'],['覆盖','写实 · 设计 · 插画'],['可调','负面词 · 引导 · 步数 · 种子 · LoRA']],       gallery: [{ t:'prompt', p:'黄昏窗边静物写实：旧书与茶杯，柔光，16:9' }],       img: `                              |
| model-lora-anima-dit.webp           | -          | 68KB  | `,'自建 Comfy Runner v4'],['架构','DiT'],['可调','负面词 · 引导 · 步数 · 种子 · LoRA']],       gallery: [{ t:'prompt', p:'雨夜霓虹街头的机能风少女，电影光效，16:9，主体偏右' }],       img: `                               |
| model-seedance.webp                 | -          | 29KB  | `分辨率','720p / 1080p'],['参考','首帧 + 语音克隆 ×3（参考端点）'],['种子','支持（全系 16 条）']],       gallery: [{ t:'prompt', p:'代表帧：海边小城黄昏，镜头缓推向灯塔，胶片颗粒，16:9' }],       img: `                   |
| model-minimax-h3.webp               | -          | 17KB  | `10 秒档'],['分辨率','720p 主档'],['参考','参考端点 ×2 线'],['线路','海外 ×2 + 国内 ×2']],       gallery: [{ t:'prompt', p:'代表帧：两人街头并肩行走的跟拍镜头，自然步态，日光，16:9' }],       img: `                       |
| model-happyhorse-11.webp            | -          | 27KB  | `时长','3 / 5 / 10 秒档'],['分辨率','720p'],['榜单','AA 盲测 top5'],['厂商','Alibaba']],       gallery: [{ t:'prompt', p:'代表帧：清晨街市开档的快节奏蒙太奇，暖光，16:9' }],       img: `                                   |
| model-kling.webp                    | -          | 20KB  | `/ 10 秒档'],['分辨率','1080p'],['参考','O3 线支持 · 3.0 Pro 不接受'],['厂商','快手']],       gallery: [{ t:'prompt', p:'代表帧：雨夜霓虹街道，镜头环绕人物半圈，电影质感，16:9' }],       img:`                             |
| model-fish-audio-s21-pro.jpg        | -          | 134KB | `0,000 字 / 次'],['多说话人','×8'],['采样率','44.1kHz 默认'],['音色','站内音色库 + 参考克隆']],       gallery: [{ t:'prompt', p:'录音棚麦克风特写，暖光，浅景深，声波纹理背景，16:9' }],       img: `                        |
| model-elevenlabs.jpg                | -          | 68KB  | `['计费','SFX 按用量 · Music $0.15 / 秒'],['输出','44.1kHz'],['用法','画面 → 音效 / 配乐']],       gallery: [{ t:'prompt', p:'混音台推子特写，暗厅氛围光，指示灯点点，16:9' }],       img: `                                 |
| model-rodin-gen-25.jpg              | -          | 127KB | `[['参考图','≤5 张'],['源图门槛','≥512px · 比例 ≤2.25'],['输出','GLB 网格'],['厂商','Hyper3D']],       gallery: [{ t:'prompt', p:'灰模转台四视图排版，工作室灯光，16:9' }],       img: `                                     |
| model-trellis-2.jpg                 | -          | 133KB | `1536'],['贴图','1K / 2K / 4K'],['减面','5k – 2M（Web 档 50k）'],['步数','≤50 · 默认 12']],       gallery: [{ t:'prompt', p:'低模到高模三阶对比排版，栅格底，16:9' }],       img: `                                          |
| model-triposr.jpg                   | -          | 89KB  | `易糊'],       specs: [['速度','秒级'],['输出','白模 GLB'],['适用','快速打样'],['厂商','Tripo']],       gallery: [{ t:'prompt', p:'桌面一排小白模手办，浅景深，晨光，16:9' }],       img: `                                  |

⚠ 第二批（`model-*`）来自模型站数据对象 `img:`/`wallImgs:` 字段——SPEC 里这些字段现在是路径字符串（原代码用 `data:+mime+;base64,+img` 拼接，落地时改为直接用路径当 src）。SPEC 浏览器打开时模型站背景会裂，属预期；视觉对照用 artifact 原版。

---

## asset-NN → 语义名映射表（2026-08-28 · P1 重命名）

后续批次引用资产**以右列为准**。左列只保留给「拿 SPEC HTML 对照」用。

### 开场 op-strip 十格

十张 = `public/homepage/production/hero/hero-01..10-*.webp`（1086×1448）的 **480×640** 压缩版，沿用其语义名 + `-480` 后缀。

| SPEC 里的名字 | 语义名                              | 用在哪                |
| ------------- | ----------------------------------- | --------------------- |
| asset-01.webp | hero-01-luna-moth-480.webp          | 开场作品墙 · 第 1 格  |
| asset-02.webp | hero-02-desert-observatory-480.webp | 开场作品墙 · 第 2 格  |
| asset-03.webp | hero-03-black-clay-480.webp         | 开场作品墙 · 第 3 格  |
| asset-04.webp | hero-04-risograph-laundry-480.webp  | 开场作品墙 · 第 4 格  |
| asset-05.webp | hero-05-frost-flower-480.webp       | 开场作品墙 · 第 5 格  |
| asset-06.webp | hero-06-watch-robot-480.webp        | 开场作品墙 · 第 6 格  |
| asset-07.webp | hero-07-snow-train-480.webp         | 开场作品墙 · 第 7 格  |
| asset-08.webp | hero-08-glacial-river-480.webp      | 开场作品墙 · 第 8 格  |
| asset-09.webp | hero-09-ruby-chair-480.webp         | 开场作品墙 · 第 9 格  |
| asset-10.webp | hero-10-cenote-diver-480.webp       | 开场作品墙 · 第 10 格 |

### 「借伞」故事素材（功能页 04 / 05 / 06 共用一套）

⚠ **2026-08-29 换素材**：SPEC 时期的占位故事「夜航的信」（`night-ferry-*`，SPEC 里的
`asset-11`～`asset-16`）已整组删除，换成站内自产的《借伞》——日本高中梅雨季，女孩忘带伞，
男孩把伞往她那边偏、自己右肩淋湿。**新素材不在本目录**，落在
`public/homepage/production/umbrella/`（与 `hero/` 同级，走「站内产物按题材归档」那条线）。

| 文件                        | 分镜         | 用在哪                                                                   |
| --------------------------- | ------------ | ------------------------------------------------------------------------ |
| umbrella-kf1-entrance.webp  | KF1 昇降口   | fn04 参考胶囊缩略图 · fn05 画布节点「分镜 01 · 昇降口」                  |
| umbrella-kf2-shared.webp    | KF2 过肩共伞 | fn05 画布节点「分镜 02 · 共伞」· fn06 库格                               |
| umbrella-kf4-arcade.webp    | KF4 商店街   | fn05 画布节点「分镜 03 · 商店街」· fn06 库格                             |
| umbrella-kf3-hydrangea.webp | KF3 紫阳花坡 | fn04 `img.anchor-src`「角色锚-她」· fn06 回流参考槽 · **开场轮换备胎 ①** |
| umbrella-kf5-farewell.webp  | KF5 夕照离别 | fn04 成片 `<video poster>` · fn06 库首格封面 · **开场轮换备胎 ②**        |
| umbrella-film-30s.mp4       | 成片 30s     | fn04 成片 · fn05 画布成片节点（同一条 src）                              |

### 功能页 03「配音间」的九条语音（2026-08-29 补齐）

⚠ SPEC 时期这一页的播放键是**画的**（`<span>` + ▶），波形高度是手打的数组，**一个字节音频都没有**。
2026-08-29 换成真能播：**三句台词 × 三语 = 9 条**，全部走站内 `/api/generate-audio` → Fish Audio
**S2.1 Pro（免费档 `s2.1-pro-free`）**生成，落在 `public/homepage/production/voice/`（与 `umbrella/`
同级）。文件规格 **mp3 · 64kbps · 单声道 · 44.1kHz**（生成时就按这个要，没有二次转码）。

音色**按 locale 各挑各的母语音色**——同一个人物在三语里是三个 `reference_id`：中文音色念英文会带口音，
而每位访客只看得到自己那一门语言，母语发音比「跨语言同一把嗓子」重要。全部取自 Fish 公共音色库，
刻意避开真人/IP 名字的克隆音色（丁真、蔡徐坤、Emma Watson、Paddington 这类），只用描述性通用音色。

| 文件              | 人物 · 页面身份    | Fish `reference_id`                | 音色名               | 时长  | 大小 |
| ----------------- | ------------------ | ---------------------------------- | -------------------- | ----- | ---- |
| voice-qing-zh.mp3 | 晴 · Fish 温柔女声 | `faccba1a8ac54016bcfc02761285e67f` | 温柔动听女声         | 2.30s | 18KB |
| voice-lei-zh.mp3  | 磊 · Fish 少年音   | `a3f45887d97a43c3ab02cd55ab3b963d` | 清朗少年音           | 2.01s | 16KB |
| voice-ke-zh.mp3   | 旁白 · 克隆音色    | `6910bc3ba4284e31b49be252faf3601b` | 旁白                 | 3.08s | 24KB |
| voice-qing-ja.mp3 | 晴 · やさしい女声  | `0089dce5fefb4c6ba9b9f2f0debe1ddc` | 落ち着いた女性       | 2.12s | 17KB |
| voice-lei-ja.mp3  | 磊 · 少年声        | `ed07fac0ac144ba6b7f6b208d57ace05` | 元気な少年           | 2.72s | 21KB |
| voice-ke-ja.mp3   | ナレーション       | `363cf1c02bbf404b8239d5cb7a6ccced` | 30代男性ナレーション | 3.08s | 24KB |
| voice-qing-en.mp3 | Qing · soft female | `2a9605eeafe84974b5b20628d42c0060` | Female Voice         | 2.19s | 17KB |
| voice-lei-en.mp3  | Lei · young male   | `3d208bc3930245468ff4f69d346d7618` | Lively Young Male    | 2.98s | 23KB |
| voice-ke-en.mp3   | Narrator           | `3601068c6aea43d5a45b06462528e806` | 47 narration         | 3.79s | 30KB |

⚠ 三条 `wave` 数组（`HOME_V4_FN_AUDIO_LINES[].wave`）**仍是手打的**，没有按真音频重算包络——柱子数
还兼着入场编排的节拍，而波形是按「行」存的、音频是按「行 × 语言」的，要对齐得先改数据形状。已知缺口。

⚠ 气泡右侧的秒数标签是 `src/messages/*.json` 里的**静态字符串**（`lines.<id>.duration`），不等
`loadedmetadata`——`preload="none"` 时那里什么都还没加载。2026-08-29 已按实测时长把三语的值各自
校准过一遍（同一行在三语里可以不一样，因为音频本来就不一样长）；**换音频记得同步改它**。

⚠ `HOME_V4_STORY` 的三个 `shot*` 键名（`shotDeck` / `shotDeparture` / `shotPullback`）是
**页面上的槽位**，沿用自上一版占位故事，**不描述画面内容**——每个槽实际演什么以上表和
`src/messages/*.json` 的标签为准。

### 模型站背景图（`m-bg`；`-b` / `-c` 是 `wall` 三联的第 2 / 3 张）

| SPEC 里的名字 | 语义名                          | 站 · 模型                         |
| ------------- | ------------------------------- | --------------------------------- |
| asset-17.jpg  | model-gpt-image-2.jpg           | 图片 · GPT Image 2                |
| asset-18.jpg  | model-gemini-3-pro-image.jpg    | 图片 · Gemini 3 Pro Image         |
| asset-19.jpg  | model-flux-2-pro.jpg            | 图片 · FLUX 2 Pro                 |
| asset-20.jpg  | model-seedream-5.jpg            | 图片 · Seedream 5.0               |
| asset-21.webp | model-recraft-v4-pro.webp       | 图片 · Recraft V4 Pro             |
| asset-22.webp | model-novelai-v5.webp           | 图片 · NovelAI V5（wall ①）       |
| asset-23.jpg  | model-novelai-v5-b.jpg          | 图片 · NovelAI V5（wall ②）       |
| asset-24.jpg  | model-novelai-v5-c.jpg          | 图片 · NovelAI V5（wall ③）       |
| asset-25.webp | model-illustrious-xl.webp       | 图片 · Illustrious XL（wall ①）   |
| asset-26.webp | model-illustrious-xl-b.webp     | 图片 · Illustrious XL（wall ②）   |
| asset-27.webp | model-illustrious-xl-c.webp     | 图片 · Illustrious XL（wall ③）   |
| asset-28.webp | model-lora-illustrious-xl.webp  | LoRA · Illustrious XL（底模户口） |
| asset-29.webp | model-lora-wai-illustrious.webp | LoRA · WAI-Illustrious            |
| asset-30.webp | model-lora-anima-pencil-xl.webp | LoRA · Anima Pencil-XL            |
| asset-31.webp | model-lora-pony-v6-xl.webp      | LoRA · Pony Diffusion V6 XL       |
| asset-32.webp | model-lora-sdxl-10.webp         | LoRA · SDXL 1.0                   |
| asset-33.webp | model-lora-anima-dit.webp       | LoRA · Anima（DiT）               |
| asset-34.webp | model-seedance.webp             | 视频 · Seedance                   |
| asset-35.webp | model-minimax-h3.webp           | 视频 · MiniMax H3                 |
| asset-36.webp | model-happyhorse-11.webp        | 视频 · HappyHorse 1.1             |
| asset-37.webp | model-kling.webp                | 视频 · 可灵                       |
| asset-38.jpg  | model-fish-audio-s21-pro.jpg    | 声音 · Fish Audio S2.1 Pro        |
| asset-39.jpg  | model-elevenlabs.jpg            | 声音 · ElevenLabs                 |
| asset-40.jpg  | model-rodin-gen-25.jpg          | 3D · Rodin Gen-2.5                |
| asset-41.jpg  | model-trellis-2.jpg             | 3D · Trellis 2                    |
| asset-42.jpg  | model-triposr.jpg               | 3D · TripoSR                      |

### ~~三张**没有**资产的模型页~~ → **2026-08-29 已全部补齐，`cover: null` 现在一个不剩**

`Wan 3.0`（视频）· `Gemini Omni Flash`（视频）· `Hunyuan3D`（3D）三页原本走「提示词水印卡」
空态。这一轮按「素材一律走站内自产」补完，**25 页现在张张有图**：

| 模型              | 新文件                                     | 怎么来的                                                                             | 徽标                        |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------- |
| Wan 3.0           | `model-wan-30.jpg`（1280×720）             | Wan 3.0 出 2s/720p 片 → 抽第 1.93s 帧。1280×720 是**视频原生分辨率**，没放大         | 站内生成 · Wan 3.0 代表帧   |
| Gemini Omni Flash | `model-gemini-omni-flash.jpg`（1536×1024） | ⚠ **不是该模型出的**——它在本仓库恒 501（台账 Z 条），owner 拍板改用 GPT Image 2 代画 | **站内生成 · GPT Image 2**  |
| Hunyuan3D         | `model-hunyuan3d.jpg`（1600×900）          | GPT Image 2 出源图 → Hunyuan3D v3.1 Pro 出 GLB → `@google/model-viewer` 渲染         | 站内生成 · Hunyuan3D 渲染帧 |

⚠ **`cover: null` 现在零个**，`HomeV4Model.test.tsx` 里验空态的那条测试因此改成用**合成 fixture**
而不是从真实目录捞记录——空态的代码路径还在，只是目录里不再有活样本。

### 两组厂商官方样图已换成站内自产（2026-08-29）

| 模型           | 文件                                                | 换成谁出的                    | 旧徽标 → 新徽标                                            |
| -------------- | --------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| NovelAI V5     | `model-novelai-v5.webp` / `-b.jpg` / `-c.jpg`       | **NovelAI Diffusion V5** 自己 | `novelai.net 官方样图` → `站内生成 · NovelAI Diffusion V5` |
| Illustrious XL | `model-illustrious-xl.webp` / `-b.webp` / `-c.webp` | **Illustrious XL** 自己       | `illustriousxl.org 官站展示` → `站内生成 · Illustrious XL` |

**文件名与扩展名逐一沿用**（常量里写死了路径），尺寸与被替换的原图**逐像素一致**，不动版式。
⚠ 上面第 28 / 31 行表格里那两句 `src: 'novelai.net 官方样图'` / `'illustriousxl.org 官站展示'`
是**从 SPEC HTML 抽出来的历史快照**，描述的是当时的取值，不再是现状——别照它判断。

⚠ **还剩 6 页不是站内自产**（`flux` · `fish` · `eleven` · `rodin` · `trellis` · `tripo`）。
（2026-08-29 是 10 页；视频幕那 4 页已于 08-30 收掉，见下。）

### 视频幕四页：放的是**视频本身**，不是代表帧（2026-08-30）

owner：「视频这边放视频素材，并且可以播放。」所以 `seedance` / `minimax` / `horse` / `kling`
四页的背景是真 `<video>`，`muted` + `loop` + `playsInline`，只有**当前那一页**会播
（复用牌组已有的 `isLive && index === hIdx`，即 `inert` 用的同一个条件）。

| 页         | 视频（源文件，**未转码**）                  | 时长 · 实到分辨率 | poster                              | 线路                              |
| ---------- | ------------------------------------------- | ----------------- | ----------------------------------- | --------------------------------- |
| `seedance` | `models/video/model-seedance.mp4`（1.18MB） | 4.04s · 1280×720  | `model-seedance.webp` 1280×720      | **BytePlus**（比 fal 省约 2.14×） |
| `minimax`  | `models/video/model-minimax.mp4`（5.77MB）  | 4.46s · 2560×1440 | `model-minimax-h3.webp` 2560×1440   | MiniMax 国内直连                  |
| `horse`    | `models/video/model-horse.mp4`（1.21MB）    | 3.04s · 1280×720  | `model-happyhorse-11.webp` 1280×720 | fal.ai                            |
| `kling`    | `models/video/model-kling.mp4`（5.72MB）    | 3.04s · 1920×1080 | `model-kling.webp` 1920×1080        | fal.ai                            |
| `wan30`    | `models/video/model-wan30.mp4`（5.60MB）    | 2.00s · 1280×720  | `model-wan-30.jpg` 1280×720         | fal.ai                            |

⚠ **五页有视频，不是四页**：`wan30` 08-30 补上（源 mp4 从库里按 generationId 取回，
未转码）。第六页 `gomni` 没有——它在本仓库跑不了（恒 501，台账 Z）。

⚠ ⭐ **`.m-bg video` 必须与 `.m-bg img` 共用同一条 CSS 规则**（`width/height:100%` +
`object-fit:cover`）。08-30 首次接视频时漏了这条，`<video>` 按自身固有尺寸渲染、右下露出
大片白底——**而 tsc 与全部测试都是绿的**，只有真机目检看得出来。往 `.m-bg` 里加任何新的
媒体元素，都要一起加进那个选择器。

⭐ **`preload="none"` 是这四条重量的全部答案**：进不到视频站就一个 mp4 字节都不下载
（实测请求数 0）。有一条测试专门锁这个属性——**掉了的话每个模型页首屏就开始拉几 MB**。

⚠ **视频与 poster 都是原始清晰度，不许再压**（owner 2026-08-30：「作为背景的素材都不要
压缩清晰度」）。四条 mp4 与源文件 md5 逐字节一致；poster 是从源视频按原分辨率重抽的
`quality:100` WebP（因此从 17–29KB 涨到 191–410KB，这是对的，不是失误）。

⚠ 上面第 39–42 行表格里那四行的 `29KB/17KB/27KB/20KB` 是 **SPEC 时期的历史快照**，
早已不是现状——别照它判断。

⚠ 两个模型名在旧文案里就是错的，08-30 一并纠正：`Kling O3` → 实跑 **3.0 Pro**；
`Seedance 2.0` → 实跑 **2.0 Fast** 档。

### LoRA 幕六张底模封面：方图改竖图（2026-08-30）

原来六张全是 **640×640 方图**，而 `side` 版式要的是「一张完整的**竖图**立在右侧」——方图塞进
竖槽，主体撑不满，右半边显空。`model-lora-illustrious-xl.webp` 更只有 14KB，细节已被压没。

重出后：**竖版 3:4、主体占满画面、每张由它自己那个底模出**（徽标是「站内底模封面」，
这一页卖的就是这个底模长什么样）。

| 文件                              | 出自                             | 尺寸     | 字节   |
| --------------------------------- | -------------------------------- | -------- | ------ |
| `model-lora-illustrious-xl.webp`  | Replicate `delta-lock/noobai-xl` | 768×1024 | 619KB  |
| `model-lora-wai-illustrious.webp` | Runner `waiIllustriousSDXL_v150` | 864×1152 | 821KB  |
| `model-lora-anima-pencil-xl.webp` | Runner `animaPencilXL_v500`      | 864×1152 | 344KB  |
| `model-lora-pony-v6-xl.webp`      | Runner `ponyDiffusionV6XL`       | 864×1152 | 1322KB |
| `model-lora-sdxl-10.webp`         | Runner `sdXL_v10VAEFix`          | 864×1152 | 753KB  |
| `model-lora-anima-dit.webp`       | Runner `animaBase_v10`（DiT）    | 864×1152 | 891KB  |

⚠ **无损 WebP，逐像素与源产物一致**——不许再压（owner 2026-08-30）。上面第 33–38 行表格里
那六行的 `14KB…68KB` 与「16:9」提示词描述都是 **SPEC 时期的历史快照**，早已不是现状。

⚠ `model-lora-pony-v6-xl.webp` 画的是「龙角少女 + 肩上小龙」，**不是**提示词原本要的
「龙与少女」两个主体——Pony V6 五次尝试都把龙并进角色。读作「奇幻混搭」成立，
读作两个主体不成立。另有一版纯龙头（generation `78bcfac6`）可作备选。

### ⭐⭐ `cover` 版式的真实可用区（2026-08-30 实测，出图前必读）

以前这里只写「16:9 满幅、主体偏右」，**一个数字都没有**——代价是 GPT 那张连废两版
（一版排版块 874px 塞不进 864px 的窗口，一版真机上标题被切掉一半）。实测口径：

| 减法          | 数值                                                       | 来源                     |
| ------------- | ---------------------------------------------------------- | ------------------------ |
| **纵向裁切**  | `object-fit: cover` 在 1920×855 视口下**只留中间 73.3%**   | 图是 16:9、窗口更扁      |
| **左侧压暗**  | `linear-gradient(96deg, rgba(0,0,0,.34), transparent 52%)` | `.m-bg .veil`            |
| **左侧遮挡①** | 身份板 `.m-glass` 约 500×230                               | `width: min(500px, 62%)` |
| **左侧遮挡②** | 强弱条 `.m-strip` 约 500×233                               | ⚠ 以前没人提过这一块     |

两块板加起来吃掉左栏**约 55% 的高度**。所以出图的构图规矩是：

- **所有要被看见的内容放右侧 55%**，左侧 45% 只放氛围 / 负空间
- **上下各 14% 会被裁掉**——文字、印章、角标必须完整落在**中间 72%** 的高度内
- 三张新封面都按这个做的，并用 `C:/tmp/img-covers/mask.mjs` 按真实几何**逐像素重放**验过
  （预测位置与真机实测误差 ≤7px）。这个脚本值得固化成校验工具。

### ⭐⭐ 全站图片的加载闸（2026-08-30，必读）

模型站 29 个图片文件合计 **约 16 MB**，而**二十五个模型页从首屏就全部挂载**，普通
`<img src>` 是 eager 的——**一进首页就会把这 16 MB 全拉下来**。

素材本身不许压（见上），所以闸开在加载策略上，与视频那条 `preload="none"` 同源：

```
near = |pageIndex − vIdx| ≤ 1 && |index − hIdx| ≤ 1
src  = near ? cover : undefined     // poster 同理
```

实测：刚进首页 **模型图请求数 0**；走到模型站时只加载「当前页 + 各方向一步」共 4 张。

⛔ **别把这条改成 `loading="lazy"`**：牌组用 transform 移动页面而不是滚动，浏览器的视口
启发式会认为二十五页全在屏内，等于没有闸。`HomeV4Model.test.tsx` 有一条测试专门锁它——
这条闸掉了**不会有任何可见症状**，只是首页悄悄开始拉 16 MB。

### 功能页 02 · LoRA 的四格出图（2026-08-30）

`public/homepage/production/lora/lora-body-1..4.webp`，864×1152 / 3:4 / WebP，78–94KB。

⭐ **四张只有两把画风 LoRA 的权重不同**，其余一切相同——同一套五把挂载、同一个 seed
`412887301`、同一张参考图、同一条提示词。页面上每格的角标印的就是那两个数字。

| 格  | Flatline | Anime Figure | generationId                           |
| --- | -------- | ------------ | -------------------------------------- |
| 1   | **2.0**  | 0.1          | `5603d898-8e96-4a35-8ec9-34bfae8887ed` |
| 2   | 1.4      | 0.7          | `7265c6e7-0253-49d1-8006-24d1aaeb6258` |
| 3   | 0.7      | 1.4          | `fce7f616-8e2a-49f8-98b7-cb9e9cb0bf27` |
| 4   | 0.1      | **2.0**      | `1c67e714-8a47-4639-a9c5-05f1a348fe05` |

底模 **Anima Base v1.0**（`anima-dit-runner`，Comfy Runner / RunPod）· 参考图是 owner 原创
角色的全身立绘，走 img2img，`referenceStrength 0.45` · 另三把 LoRA 四张不动（姿势 0.3 /
细节 0.6 / 光效 0.4）。**2.0 与 0.1 就是产品的整个量程**（`loraScale {min:0.1, max:2}`）。

⚠ 参考图上传前**左右补白到精确 3:4**：runner 的 img2img 是 `ImageScale(crop:'center')`，
941×1672 直接进 3:4 会上下各切 208px 把头顶和靴子切掉（台账 BC）。

### 功能页 03 · 声音的九条语音与三个头像（2026-08-29 / 30）

- `voice-{qing,lei,ke}-{zh,ja,en}.mp3` —— 3 句 × 3 语，Fish Audio S2.1（`s2.1-pro-free`），
  64kbps 单声道，16–30KB，合计 194KB。⭐ **每个 locale 只加载自己那三条**，且
  `preload="none"`：没点播放键的访客下载 **0 字节**。
- `avatar-{qing,lei,ke}.webp` —— 256×256，12–14KB，GPT Image 2 出的赛璐璐大头像。
  ⚠ 显示尺寸只有 38px（气泡）/ 30px（音色选择器），所以构图必须是正面大头 + 单色背景；
  **三张各自的主色对应原来那套渐变色相**（粉紫 / 蓝 / 金），「颜色 = 谁在说」这层编码没断。
- ⚠ 页面第三条气泡写的是「旁白 · **克隆音色**」，而实际用的是 Fish **音色库**里的旁白音，
  不是克隆产物。owner 2026-08-29 明确定为不改文案，此处只留记录（另见台账 Z 条末尾）。
