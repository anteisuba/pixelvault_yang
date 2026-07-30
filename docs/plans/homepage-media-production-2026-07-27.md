# Task Packet: 首页真实媒体素材生产

## Goal

- 在不改 `home-v3` 现有布局、排版和交互的前提下，把重复占位图替换为可核对来源的图片、真实视频帧和真实 3D 转台结果。

## Non-goals

- 不重做首页 UI，不改 `home-v3.css` 的结构与 page token。
- 除 owner 2026-07-28 明确追加的 LoRA 底模选择器与当前底模卡缩略图外，不改 Studio / Canvas / LoRA / Assets 产品内页。
- 不改 provider、模型目录、价格、计费、API、数据库或登录流程。
- 不把由其他模型伪造的图片标成某个具体模型的输出。

## Task Scene / Type

- `ui-marketing` · 增量媒体维护，不是页面改版。

## Read First

- `AGENTS.md`
- `docs/WORKFLOW.md`
- `docs/scenes/ui-marketing.md`
- `docs/references/pages/home.md` §A
- `docs/plans/homepage-motion-design-2026-07-27.md` §9
- `docs/checklists/ui.md`

## Source of Truth

- 页面：`src/components/business/home-v3/HomeV3*.tsx`
- 媒体映射：`src/constants/home-v3.ts`、`src/constants/homepage.ts`
- 模型目录：`src/constants/models/{image,video,audio,model-3d}.ts`
- 页面媒体：`public/homepage/**`、`public/showcase/**`

## Allowed File Scope

- `public/homepage/production/**`
- `src/constants/home-v3.ts`
- `src/components/business/home-v3/HomeV3Capabilities.tsx`（真实视频到位后）
- `src/components/business/home-v3/HomeV3VideoPlayer.tsx`（真实播放控制）
- `src/components/business/home-v3/HomeV3Motion.tsx`（叠放切片命中层）
- `src/components/business/home-v3/HomeV3ModelRail.tsx` / `HomeV3Rails.tsx`（模型介绍层）
- `src/app/home-v3.css`（仅真实 `<video>` 与原 `<img>` 等尺寸的机械兼容）
- `src/components/business/home-v3/home-v3.test.ts`
- `src/components/business/studio/lora/LoraBaseModelModal.tsx`（仅底模缩略图）
- `src/components/business/studio/lora/LoraWorkbench.tsx`（仅当前底模卡缩略图）
- `src/constants/lora-base-models.ts` / `src/constants/lora-base-models.test.ts`
- `src/proxy.ts` / `src/proxy.test.ts`（本地视频静态资源直通）
- `src/messages/{en,ja,zh}.json`（播放、暂停、进度条可访问名称）
- 本任务包与 `docs/references/pages/home.md`

## Forbidden File Scope

- `src/app/api/**`
- `src/services/**`
- `src/components/business/node/**`
- `prisma/**`
- `src/constants/models/**`

## Intake / 已确认边界

1. 目标：首页每个媒体槽有自己的素材，模型卡不再循环同一小池。
2. 影响：公开首页 `/[locale]` 的首屏、产品自曝、能力演示和模型阵容。
3. 成功：画布演示内部同一故事连续；四模型演示是同 prompt 的真实四次输出；视频为真实可播放文件；3D 四角度来自同一个真实 GLB；模型轨资产能追溯到模型。
4. 禁改：现有 UI、布局、交互、产品内页、provider/API/计费。
5. 证据：资产清单、生成记录/模型名、浏览器截图、视频播放、文件探针、相关测试。
6. Owner 2026-07-28 追加边界：模型卡点击先打开介绍层，四条横轨仅横向滚动；LoRA「换底模」和当前底模卡可以复用首页模型素材补充缩略图。
7. Owner 2026-07-28 移动端反馈：首页产品演示不得把桌面框等比压扁后裁切；手机宽度下必须保持标签可读、视图可操作，并与下一能力段保持清楚边界。

## 素材策略

### 1. 页面叙事

- **同一个演示内部要连续**：画布的角色、场景、镜头、视频必须属于《夜航的信》同一条故事线。
- **不同演示之间要有跨度**：hero、四模型对照、视频、3D、模型轨不再都复用《夜航的信》，避免整页又变成另一种“同一张图”。
- **真实输出优先于 logo**：模型卡主图负责证明输出；官方 logo 只能作为小型来源标识，不替代作品。当前用户要求“不改 UI”，本批不增加 logo 位。

### 2. 真实性规则

- 四模型同题：同一 prompt、同一比例、每个模型一次首轮生成；只有明显失败/违规拦截才重试并记录。
- 模型轨：文件名按 `AI_MODELS` id；不能用 imagegen 生成一张“像某模型风格”的图后标成该模型。
- 视频：页面播放的 mp4/webm 必须来自 PixelVault 的真实 Video Studio 任务。
- 3D：四个角度必须从同一个生成后的 GLB 截取，不能用四张分别生成、形体漂移的图片。

## 已完成母素材（built-in imagegen）

### Hero · 10 张独立作品

最终交付均为 3:4 竖图 WebP，位于
`public/homepage/production/hero/`；prompt set 如下：

| 文件                              | 最终生成主题 / 媒介                         |
| --------------------------------- | ------------------------------------------- |
| `hero-01-luna-moth.webp`          | 雨夜温室玻璃上的月蛾 · 写实自然微距         |
| `hero-02-desert-observatory.webp` | 粉色黎明沙漠中的粗野主义天文台 · 建筑概念   |
| `hero-03-black-clay.webp`         | 老陶艺师双手塑造黑陶碗 · 纪实工艺摄影       |
| `hero-04-risograph-laundry.webp`  | 海边旧城屋顶晾衣 · 蓝/朱红双色 risograph    |
| `hero-05-frost-flower.webp`       | 深蓝窗面的枝状霜花 · 科学微距               |
| `hero-06-watch-robot.webp`        | 微型维修机器人修理怀表 · 触感定格 3D        |
| `hero-07-snow-train.webp`         | 雪中海岸村落的地方列车 · 当代木刻版画       |
| `hero-08-glacial-river.webp`      | 黑色火山沙上的冰川辫状河 · 航拍自然摄影     |
| `hero-09-ruby-chair.webp`         | 钴蓝影棚中的红色铸玻璃椅 · 实验家具产品摄影 |
| `hero-10-cenote-diver.webp`       | 天坑光束下的自由潜水员 · 水下纪实摄影       |

共通约束：无文字、无 logo、无水印；构图在首页窄幅 3:4
`object-fit: cover` 下仍有明确主体；不同作品不共享场景、角色或媒介。

### Canvas ·《夜航的信》

- `public/homepage/production/canvas/night-ferry-character-anchor-v1.png`
  - 角色身份母图；首页使用压缩版 `.webp`。
- `public/homepage/production/canvas/night-ferry-setting-v1.webp`
  - 雨夜渡轮码头空镜。
- `public/homepage/production/video/night-ferry-seedance-first-frame-v1.png`
  - Seedance I2V 上传母图；首页使用压缩版 `.webp`。
- `public/homepage/production/canvas/night-ferry-video-poster-v1.webp`
  - 预演末帧；真实视频生成后由实际视频帧替换。

当前映射已写入 `src/constants/home-v3.ts`：角色 → 场景 → 镜头 → 视频结果形成连续故事；能力段视频 poster 也改用同一首帧。

### 3D · 原创可交互 GLB（已完成）

- 参考立绘：
  `public/homepage/production/model3d/moon-lantern-fox-reference-v1.png`
- 加载 poster：
  `public/homepage/production/model3d/moon-lantern-fox-poster-v1.webp`
- 模型：
  `public/homepage/production/model3d/moon-lantern-fox-v1.glb`
- 可复现生成器：`scripts/generate-homepage-moon-fox.mjs`
- 设计：原创动漫宠物“月灯狐”，青蓝与奶油色、Q 版比例、月牙胸饰和卷尾。
- 模型是 40 个真实 mesh 的自包含 GLB，346,140 bytes；已经用
  `GLTFLoader` 回读，首页 `model-viewer` 可以自动旋转并允许鼠标、触摸和键盘控制。
- 该资产标为 `Moon Lantern Fox · glb`，不冒充 Rodin / Hunyuan / Trellis
  的模型输出。
- `src/proxy.ts` 的静态资源 matcher 已加入 `.glb`；否则多语言代理会把 GLB
  请求改写为首页 HTML。

原收音机参考母图
`public/homepage/production/model3d/vintage-radio-source-v1.png`
继续保留，供后续需要核对 Rodin 真实生成链路时使用。

## 已完成 1 · 在 PixelVault 生成真实视频

### 模型与参数

| 参数       | 值                                        |
| ---------- | ----------------------------------------- |
| Surface    | Studio Video · image-to-video             |
| Model      | Seedance 2.0 Fast                         |
| Reference  | `night-ferry-seedance-first-frame-v1.png` |
| Duration   | 5s                                        |
| Aspect     | 16:9                                      |
| Resolution | 720p                                      |
| Audio      | 环境雨声 + 低频船机；无对白               |
| Variants   | 第一轮只生成 1 个                         |

### 可直接粘贴的 prompt

```text
5 秒单镜头，保持参考图中同一位女性、同一张脸、湿黑发、深青色雨衣、渡轮甲板、雨夜光线和镜头轴线。

0.0–1.5 秒：中广景，摄影机沿甲板栏杆非常缓慢地向前推；渡轮只有轻微起伏，细雨斜落，远处灯塔光束还未照到人物。她安静望向左侧水面，只做自然呼吸和一次眨眼。
1.5–3.2 秒：保持连续镜头和稳定推近。她低头，用右手从胸前口袋取出一封折成小方块的信，左手接住；动作克制、真实，手指清楚，不遮住脸。
3.2–5.0 秒：镜头停在腰上中景。她双手拿着信重新望向灯塔；灯塔光束从左向右柔和扫过薄雾和她的雨衣，船舱暖光仍在右后方。最后一帧稳定停住。

摄影：35mm 电影镜头，单次缓慢 dolly-in，无剪辑、无变焦、无摇镜、无手持抖动。写实当代电影质感，冷蓝雨夜与暖船舱光平衡，自然皮肤和湿布料纹理。
声音：轻雨、低频船机、远处一次雾笛，无音乐、无对白、无口型。
避免：人物身份漂移、年龄变化、发型或衣服变化、额外人物、手指变形、信件复制、突然转身、夸张表演、镜头跳切、强烈闪光、赛博朋克霓虹、字幕、logo、水印。
```

### 交付文件

生成完成后下载原始文件到：

```text
public/homepage/production/video/night-ferry-seedance-v1-source.mp4
```

Codex 已完成：

1. 转码为静音、5 秒、720p、适合网页循环的 `night-ferry-seedance-v1.mp4`。
2. 提取 6 个真实帧到 `video/night-ferry-seedance-v1-frame-{01..06}.webp`。
3. `HomeV3DemoVideo` 从 `<Image>` 换成同尺寸 `<video muted playsInline loop>`；视觉控制层不变，装饰按钮升级为真实播放控件。
4. `prefers-reduced-motion` 保持 poster 静态终态。

### 2026-07-28 完成记录

- PixelVault 真实生成记录：
  `Generation.id = 131ba4dc-f76c-4cae-a6c4-2320b8972f3f`；
  provider `fal.ai`；model `seedance-2.0-fast`。
- 原始成片保存为
  `public/homepage/production/video/night-ferry-seedance-v1-source.mp4`；
  页面版保存为 `night-ferry-seedance-v1.mp4`。
- 页面版经 `ffprobe` 核对：H.264、1280×720、24fps、5.000 秒、
  `yuv420p`、无音轨，709,652 bytes。
- 6 张 filmstrip 均从页面版真实抽帧，文件为
  `night-ferry-seedance-v1-frame-{01..06}.webp`；第一帧作为视频加载
  poster，第六帧作为 reduced-motion 静态终态与 Canvas 视频结果缩略图。
- `HomeV3DemoVideo` 已播放真实 MP4，保留原控制层和版式；模型标识同步为
  `Seedance 2.0 Fast`。
- 视频区现在由 `HomeV3VideoPlayer` 读取媒体真实时长和进度，支持点击画面或
  中央按钮播放/暂停、拖动时间轴，并让 filmstrip 高亮跟随真实播放头。
- `src/proxy.ts` 的静态资源 matcher 已加入 `.mp4` / `.webm` / `.mov`；
  否则视频请求会进入 locale/Clerk middleware，不能作为媒体文件直接解码。
- 能力段三张滚动切片叠放时，仅当前切片保留 pointer events；隐藏切片同步
  `inert` 并退出可访问树，避免透明的 3D 切片覆盖视频按钮、吞掉点击。

## 下一步 2 · 四模型同题真实输出

### 模型

1. GPT Image 2
2. Gemini 3 Pro Image
3. Flux 2 Pro
4. Seedream 5.0 Pro

`NovelAI V4.5` 已在当前模型目录退役，不能继续出现在“真实可用模型”演示里；接入真实结果时同步把该演示槽替换成 Seedream 5.0 Pro。

### 参数

- 3:4 竖图。
- 不加参考图，不加 LoRA，不手动补绘。
- 每模型首轮 1 张；失败才重试。

### 同题 prompt

```text
雨后的清晨，一座建在退役火车车厢里的小型植物图书馆。车厢门打开，薄雾沿铁轨流过；一位穿芥末黄色工作围裙的老年女管理员站在门边给一盆高大的蕨类浇水。窗玻璃有水珠，车厢内是暖钨丝灯，外面是冷青色晨光。写实编辑摄影，35mm 视角，人物全身可见，真实皮肤和旧布料质感，构图层次清楚，克制的电影色彩。无文字、无 logo、无水印、无额外人物。
```

### 文件名

```text
public/homepage/production/studio/gpt-image-2.webp
public/homepage/production/studio/gemini-3-pro-image-preview.webp
public/homepage/production/studio/flux-2-pro.webp
public/homepage/production/studio/seedream-5.0-pro.webp
```

## 已完成 3 · 真实 3D 实体展示

1. 删除了“同一静物图改四次亮度”的伪转台。
2. `HomeV3DemoTurntable` 复用产品内已有 `ModelViewer`，加载本地
   `moon-lantern-fox-v1.glb`。
3. 保留现有 demo 外框与信息栏；模型区改成单个宽屏实时 3D viewer，支持
   auto-rotate 和 camera controls，AR 在营销页关闭。
4. `ModelViewer` 的 loading copy 改由调用面传入，避免公开首页为了一个
   loading 字符串加载 `Model3DGenerate` 重命名空间；Studio 与资产详情仍传入原有三语文案。
5. 浏览器已观察到正面、侧面和背面实时旋转，不是 poster 帧切换。

## 已完成 4 · 模型阵容轨官方原始素材

### 定位

- owner 最终确认模型轨使用模型方原本的图标或官方模型页素材，不再使用本项目重新设计的抽象能力封面。
- 36 个目录项分别缓存到
  `public/homepage/production/models/<modality>/<AI_MODELS id>.webp`；GPT Image 2
  保留已确认的官方 `gpt-image-2.png` 图标。
- 数量固定为当前公开目录：图片 18、视频 11、音频 2、3D 5。
- 素材来源优先级：模型官方页/官方仓库 → 官方 provider 的模型专属缩略图 →
  Runner 实际安装 checkpoint 的精确 Civitai version 预览。同一底层模型只有接入商不同
  时复用该模型官方素材，不伪造一张“不同模型风格图”。
- 可复现同步器：`scripts/sync-homepage-model-assets.mjs`；来源审计器：
  `scripts/audit-homepage-model-icon-sources.ts`。
- `HomeV3Rails` 已删除 `SHOT_POOL` / cursor 循环，改为
  `getHomeV3ModelCover(model.id, outputType)` 一对一寻址。
- 卡片图片区改成满版、无内边距，模型名、参考价与 provider 保留在图片下方。
- 四条模型横轨不再随页面纵向 ScrollTrigger 自动偏移。鼠标位于横轨内时，
  纵向滚轮转换为该横轨的横向滚动；移出横轨后恢复页面纵向滚动。箭头、触摸和
  trackpad 原生横向手势继续保留。
- OpenAI、Gemini、FLUX、Seedream / Seedance、Recraft、HappyHorse、Kling、
  Hunyuan、Trellis、Tripo 等可识别模型优先使用模型所有方的原始品牌标识；
  fal.ai 只保留为执行 provider 文案，不再作为卡片主视觉。
- 品牌 SVG 固定落盘到 `public/homepage/production/models/brand/`，来源与版本记录在
  同目录 `SOURCES.md`。

## 已完成 5 · 模型介绍层、横轨约束与 LoRA 底模素材复用

- 图片、视频、音频、3D 四类模型卡片统一改为点击打开响应式模型介绍层；介绍层展示
  能力、优势、provider、计价和模态信息，只有明确的 Studio CTA 才进入生成入口，
  点击卡片本身不再直接跳页。
- 四条模型横轨只允许横向滚动：轨道区域内的滚轮输入映射为横向位移，同时显式禁止
  轨道自身纵向滚动。Owner 已于 2026-07-28 在本地页面确认行为正确。
- LoRA「换底模」选择器为全部 11 个底模增加本地缩略图，直接复用首页品牌图标或
  模型作品图；选择、兼容性、禁用状态与底模分组逻辑未改动。
- LoRA Generate 装配栏的当前底模卡与折叠态按钮复用同一个 `coverImage`，切换底模后
  主界面与弹层显示同一张模型素材，不维护第二套映射。
- 模型卡片入场动画调整为透明度渐入，取消单卡片纵向位移，避免横轨视觉基线被误读为
  高低错位。
- 手机端产品演示不再沿用桌面 `1328 / 640` 的扁平比例：标签保持单行和 44px
  命中区，画布以可读比例在框内横向触摸浏览，Studio / LoRA 改为上下层级，素材网格
  使用 4×5 排布；产品框与下一能力段不再重叠。
- 能力段的钉住换片只在 `min-width: 1001px` 启用；更窄的屏幕保留三段正常文档流，
  窗口跨断点时 GSAP media context 会撤销 pin、inline transform、`inert` 与
  `aria-hidden`，不再让能力文案覆盖产品画布。
- 760px 以下页脚改为品牌说明独占首行、链接两列；三语 tagline 同步收敛为一句，
  避免桌面四列把说明挤成逐字换行并拉长页面。

### 后续真实输出升级

- 若未来希望卡片主图承担“该模型真实输出证明”，必须逐模型用真实任务替换官方素材，
  并保存生成记录；不能仅靠视觉风格推断模型来源。
- 音频真实波形到位后可按同一文件约定覆盖，UI 与映射函数不变。

## Logo / 官方素材决策（owner 已确认）

- 本轮不再原创重绘 logo，也不把一个通用作品池轮换到全部模型。
- 有模型专属官方图标时使用原图；没有独立图标时使用官方模型页的模型专属社交图或
  官方仓库 teaser。模型名称与 provider 信息仍由卡片 UI 明确标注。
- 外部素材在同步时统一裁切为 640×640 WebP 并本地托管，避免第三方追踪、热链失效或
  上游替图静默改变首页。

## Acceptance Criteria

- Canvas 四个图片节点不再来自互不相关的公共图池。
- 四模型对照有四个实际模型输出，模型名与目录一致。
- 视频区域播放真实 5 秒视频，filmstrip 来自该视频。
- 3D 四角度是同一个 GLB 的实际转台。
- 模型轨不再用 `SHOT_POOL[cursor % 14]` 给 36 个模型循环分图。
- 无新增页面结构、颜色或字体；只新增 owner 确认的区域内滚轮横向导航。

## Validation / Evidence

- `npm run typecheck`
- `npm run lint`
- `npx vitest run src/components/business/home-v3/home-v3.test.ts`
- 复用 owner 的 3000 dev server，检查 `/zh`、`/en`、`/ja`。
- 1440px 与 375px 截图；真实视频播放、静音、循环、reduced-motion。
- `ffprobe` 核对视频时长、分辨率、编码和音轨。
- `git diff --check`

### 2026-07-28 已完成证据

- `npm run typecheck`：通过。
- `npx vitest run src/components/business/home-v3/home-v3.test.ts`：11/11
  通过；覆盖真实 GLB 存在、一模型一封面和原有首页结构约束。
- `npx vitest run src/proxy.test.ts`：3/3 通过。
- 首页、ModelViewer 与 proxy 相关文件定向 ESLint：通过。
- 改动文件 Prettier check 与 scoped `git diff --check`：通过。
- 浏览器 `/zh`：
  - 画布 inspector 两张参考图与左侧《夜航的信》角色/场景一致；
  - `Moon Lantern Fox` 从 poster 进入实时 GLB，观察到正面、侧面和背面自动旋转；
  - 36 张模型封面全部一对一加载，图片 18 / 视频 11 / 音频 2 / 3D 5；
  - 未出现本批新增 console error。
- 2026-07-28 模型轨官方素材升级：
  - 36 个本地素材完整：35 张 WebP + 1 张 GPT Image 2 PNG，共 1,273,766 bytes；
  - `npx vitest run src/components/business/home-v3/home-v3.test.ts` 复跑
    11/11 通过；改动文件 Prettier check 与 scoped `git diff --check` 通过；
  - 浏览器实测图片横轨 `scrollLeft 0 → 460`、视频横轨 `0 → 380`、3D 横轨
    `0 → 296`，三次页面纵向位置均保持不变；
  - 鼠标移出横轨后，模型轨位置不变，页面恢复纵向滚动；
  - 未出现本轮新增 console error；仅观察到既有 Clerk/Lit/ModelViewer 开发环境 warning。
  - 后续复跑 `npx tsc --noEmit --pretty false` 与相关文件定向 ESLint 均通过。
- GLB 346,140 bytes；网页 poster 68,390 bytes。2.1 MB 参考立绘只用于生产，
  不进入首屏加载。
- 2026-07-28 真实视频接入：
  - 页面版 MP4 经 `ffprobe` 核对为 H.264、1280×720、24fps、5.000 秒、
    `yuv420p`、无音轨；
  - 6 张 filmstrip 均由同一 MP4 抽帧，`HomeV3DemoVideo` 已改为真实
    `<video muted playsInline loop>`；
  - `npx tsc --noEmit` 与首页 / proxy 相关文件定向 ESLint 均通过；
  - 首页与 proxy 定向 Vitest 20/20、三语 completeness 5/5 通过；
  - 全量 Vitest 跑完后仅有 2 个既有 Canvas connection matrix 用例失败，
    位于本任务未修改的 `use-cast-ingest.test.ts`，与首页视频无文件交集；
  - Chrome `/zh` 实测媒体 `readyState=4`、5 秒、无媒体错误；点击播放后
    0.7 秒内 `currentTime` 推进约 0.66 秒，点击暂停后 0.7 秒漂移为 0，
    直接点击画面也能恢复播放；
  - 三张能力切片实测只有 `data-active="true"` 的切片为
    `pointer-events:auto`，其余切片为 `pointer-events:none` 且 `inert`。
- 2026-07-28 模型介绍层与 LoRA 底模缩略图：
  - `npx vitest run src/constants/lora-base-models.test.ts src/components/business/home-v3/HomeV3ModelRail.test.tsx src/components/business/home-v3/home-v3.test.ts --reporter=dot`
    运行 3 个测试文件，33/33 通过；
  - `npx eslint src/components/business/studio/lora/LoraBaseModelModal.tsx src/constants/lora-base-models.ts src/constants/lora-base-models.test.ts`
    通过；
  - 浏览器分别用 OpenAI GPT Image 2、Seedance 2.0 Fast、Fish Audio S2 Pro、
    Rodin Gen-2.5 验证四种模态介绍层；卡片点击后 URL 不变，Studio CTA 与关闭按钮可用；
  - `/zh/studio/lora?section=generate` 的「换底模」弹层共渲染 11 张缩略图，
    均加载完成且具有有效自然尺寸，原有分组、选择与禁用状态保持不变。
- 2026-07-28 首页移动端与当前底模卡：
  - `npx vitest run src/components/business/studio/lora/LoraWorkbench.test.tsx -t "defaults an empty LoRA stack" --reporter=dot --pool=threads --maxWorkers=1`
    通过，验证 Anima Base 默认卡显示对应本地封面；
  - `npx eslint src/components/business/studio/lora/LoraWorkbench.tsx src/components/business/studio/lora/LoraWorkbench.test.tsx e2e/mobile.spec.ts`
    通过；
  - `npx playwright test e2e/mobile.spec.ts --project=mobile -g "homepage product preview" --reporter=line`
    3/3 通过；375px 下标签为单行 44px 命中区、产品框与能力段不重叠，画布只在产品框内
    横向浏览。
  - `npx playwright test e2e/mobile.spec.ts --project=mobile -g "renders home without horizontal overflow" --reporter=line --workers=1`
    6/6 通过；375 / 390 / 430 / 820px 均无页面级横向溢出或运行时错误。
- 2026-07-28 能力段覆盖与页脚高度修复：
  - `npx playwright test e2e/mobile.spec.ts --project=mobile -g "homepage (product preview|keeps capability)" --reporter=line --workers=1`
    4/4 通过；600px 下 capability stage 不进入 pin 状态，页脚品牌区宽度超过父容器
    90%，说明文字高度低于 72px；
  - `npx playwright test e2e/mobile.spec.ts --project=mobile -g "375px.*renders home" --reporter=line --workers=1`
    3/3 通过，375px 页面无横向溢出或运行时错误；
  - 600 / 820px 在全宽度批次中通过；375px 批次首次受 dev server 旧 Turbopack
    chunk 热更新错误干扰，预热后独立复跑通过；
  - `npx eslint src/components/business/home-v3/HomeV3Motion.tsx e2e/mobile.spec.ts`
    与 `npx tsc --noEmit --pretty false` 通过。

## Documentation Sync

- 任务进行中：本文件是唯一媒体生产清单。
- 完成后：把稳定素材契约沉淀到 `docs/references/pages/home.md` §A，随后删除或归档本任务包；`docs/status.md` 只在整个素材切片完成时覆盖更新。
