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

### 三张**没有**资产的模型页（SPEC 里 `img: null`，走「提示词水印卡」空态）

`Wan 3.0`（视频）· `Gemini Omni Flash`（视频）· `Hunyuan3D`（3D）——生成任务单见 SPEC 各自的
`gallery[0].p`，在 `src/constants/homepage-v4.ts` 里 `cover: null`。
