# 工作台地基：盘点与顺序

> 状态：**范围和方向已定，已写进 `ui-spec.md`，代码还没跟**（2026-11-11）。owner 定了只先做地基两步，见「已定」。本文只量现状、提顺序，没有改 `src/` 一行。
> 目标不在本文：工作台长什么样以 [`references/ui-spec.md`](../references/ui-spec.md)（owner 2026-10-24 / 25 确认）为准。本文回答的是「代码离它还差多少、从哪一层补起」。
> 本次没有看任何实际画面：3000 端口的 dev 当时没在跑，下面全部是读代码量出来的。数字能说明「写法有多散」，不能说明「看起来差多少」。

## 怎么用这张表

- 每条结果带一个状态，四种（和 [`home-v6.md`](home-v6.md) 同一套）：
  - **事实**：从代码或文档里量出来的，命令写在「怎么量的」。
  - **owner 说过**：owner 的原话，或 owner 亲手选的。是意愿，不等于决定。
  - **Claude 推断**：Claude 归纳或建议的，owner 没确认过。
  - **未定**：问过或该问，没有答案。
- 只有「已定」里的内容能进 `src/`。「建议的施工顺序」里第 1、2 步的范围 owner 已点头，第 3 步起仍是 Claude 推断，owner 点头前不开工。
- 每讨论一轮，在「讨论记录」加一行，再更新「待定」。owner 对某一项明确点头后移到「已定」，同时更新 [`roadmap.md`](../roadmap.md) 对应条目。⛔ 把「owner 说过」或「Claude 推断」直接当成「已定」。
- 本文不新增设计规则。量出来和规范对不上的，记在「盘点结果」第 6 节，等 owner 定。

## 讨论记录

| #   | 讨论什么                      | 过程                                                                     | 结果                                                                                                                                                                                                                                                                                 | 状态                                                                 |
| --- | ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | 工作台要不要一起做            | owner 在看首页小样 1 时提出（[`home-v6.md`](home-v6.md) 第 11 轮）       | owner：除了首页，工作台也想并行做；应该从底层设计做好。范围和顺序没谈                                                                                                                                                                                                                | owner 说过；范围未定                                                 |
| 2   | 现状离规范差多少              | Claude 自下而上按四层量了一遍：token、原语、工作台共用层与外壳、各台     | token 的值已经对齐；原语换了一半；最大的差距是业务代码绕开原语自己写（裸 `<button>` 858 处对 `<Button>` 276 处）。见「盘点结果」                                                                                                                                                     | 数字是事实；「最大差距」是 Claude 推断                               |
| 3   | 从哪一层做起                  | Claude 按第 2 轮的数字排了顺序                                           | 建议先补齐原语层，再收共用件，再一台一台做；第一个台建议图像台身。见「建议的施工顺序」                                                                                                                                                                                               | Claude 推断，未确认                                                  |
| 4   | 11-02 和 11-10 两句话哪句算数 | Claude 把待定 A 做成一个问题，owner 点选                                 | owner 选「只先做地基」：第 1、2 步现在做，不碰任何一个台的摆法；各台仍按 11-02 定的往后放                                                                                                                                                                                            | 已定                                                                 |
| 5   | 第 1 步做完                   | 独立 worktree 里做，owner 说「合到 main 让我看下」                       | 提交 `5d9865084` 已快进到本地 main，没有 push。`ui/` 里被禁阴影 14 → 8，删了 `card` `tabs` `toggle-group`，新增 `chip` `search-field`。留了 7 处非参数滑杆和 8 处阴影没动。画面没人看过                                                                                              | 事实；等 owner 看                                                    |
| 6   | 这边要做的是定方向            | owner 贴回 11-10 那段审计的原话，指出第 1 步没有回答「整体要成为什么样」 | owner：先定方向。「这个代码库是你的，做成什么样你说了算，以后也是你接着维护。」于是第 2 步共用件先停，改做整屏单变量对比（见「小样」）                                                                                                                                               | owner 说过。方向由 Claude 定、owner 可以否，这一条是授权不是方向本身 |
| 7   | 字号和疏密选哪边              | owner 看了小样 1 的选择说明后点选                                        | owner 点「按 B，继续」：字号 B、疏密 B（只用在舞台和板块之间，输入框那一行药丸保持紧凑）                                                                                                                                                                                             | 已定                                                                 |
| 8   | 色温和材质选哪边              | owner 看了小样 2 的选择说明后点选                                        | owner 点「按这个定」：色温偏暖；材质只让输入框浮起，药丸和图保持平涂                                                                                                                                                                                                                 | 已定                                                                 |
| 9   | 把方向写进规范                | owner 点「开始改规范」，Claude 改 `ui-spec.md`                           | 加了「整体目标」五句；§4 字号十档收成四档（原 14 → 15、12 → 11、10 → 11、500 → 600）；§3.3 素档十二行换成偏暖的值，`panel` / `raise` / `float` 留纯白，暗房不动，对比度实算全部 ≥ 4.5；§5 加疏密的数、台输入框用 `card`；ui-defaults 的两处冲突记进 §0。`globals.css` 和 `src/` 没动 | 事实；规范里的具体数是 Claude 定的                                   |

## 怎么量的

在仓库根目录跑。`rg` 要带 PCRE2（`rg --version` 里有 `+pcre2`）。一律只数 `*.tsx`、不数 `*.test.tsx`。量的时候工作区在 `9f4b31806`（分支 `docs/home-v6-discussion`，`src/` 无未提交改动）。

```bash
n() { rg -P -o --no-filename -g '*.tsx' -g '!*.test.tsx' "$1" "${@:2}" | wc -l; }
files() { rg --files -g '*.tsx' -g '!*.test.tsx' "$@"; }

CLS='className='
TEE='(?<![\w-])rounded-(sm|md|lg|xl)(?![\w-])'        # T 恤码圆角：6 / 8 / 10 / 14
NEW='(?<![\w-])rounded-(12|16|20|24)(?![\w-])'        # 10-25 加的四档
BAN='(?<![\w-])shadow-(xs|sm|md|lg|xl|2xl|inner)(?![\w-])'   # Tailwind 默认阴影，规范禁
OWN='(?<![\w-])shadow-(float|node-[a-z-]+|assistant-[a-z-]+|shell-card|sidebar-chip)(?![\w-])'  # 域自有阴影
NINE='(?<![\w-])shadow-(ring|soft|seg|card|lift|pop|bar|media-action|focus)(?![\w-])'           # 规范九种
RAW='<button\b'
BTN='<Button\b'
HOV='(?<![\w-])hover:bg-[a-z]'                        # 自己配的悬停底色
TINT='(?<![\w-])tint-hover(?![\w-])'                  # 规范的悬停叠层
RING='(?<![\w-])focus-visible:ring-2(?![\w-])'        # 旧焦点写法
FOCUS='(?<![\w-])focus-visible:shadow-focus(?![\w-])' # 规范的焦点环
HALF='(?<![\w-])(h|size|min-h)-(4|5|6|7|8|9|10)\.5(?![\w.-])'   # 半档高度：18 / 22 / 26 / 30 / 34 / 38 / 42

UI=src/components/ui
SHELL=src/components/business/studio/shell
SHARED=src/components/business/studio-shared
CHAT=src/features/assistant
S=src/features/studio/components
TAGS=$S/tags
VOICE=$S/voice-bench/VoiceBench.tsx
LORA=src/features/lora
CANVAS=src/features/canvas
imgbody() { files -g '!**/tags/**' -g '!**/voice-bench/**' -g '!StudioVideo*' -g '!Studio3D*' $S; }
video() { echo $S/StudioVideoAssetChip.tsx $S/StudioVideoAudioPanel.tsx $S/StudioVideoPromptInput.tsx $SHARED/chrome/StudioVideoAssetRail.tsx $SHARED/chrome/StudioVideoQueueStrip.tsx; }
three() { echo $S/Studio3DWorkspace.tsx src/components/business/ModelViewer.tsx src/components/business/ModelViewerInner.tsx src/components/business/WireframeModelPreview.tsx; }

# 例：LoRA 台的被禁阴影、图像台身的裸按钮、全仓超过 1000 行的文件
n "$BAN" $LORA
n "$RAW" $(imgbody)
files src | xargs wc -l | awk '$2!="total" && $1>1000' | sort -rn
```

范围怎么划的：

- **图像台身** = `features/studio/components` 去掉 `tags/`、`voice-bench/`、`StudioVideo*`、`Studio3D*`。图像、视频、标签三个台共用这一副（提示词区、舞台、结果图墙、模板面板），所以单列。
- **视频专属** = 上面 `video()` 那 5 个文件；视频台其余部分就是图像台身。
- **对话** = `features/assistant`，白板左半边那一栏。它不是台，但和台是同一块白板。
- 画布、LoRA 另有自己的样式表（`src/app/canvas.css` 1,598 行、`src/app/lora.css` 312 行），里面的圆角和阴影不在 tsx 的计数里。

其余一次性的数字，命令写在所在那一行。

## 盘点结果

### 0. 先说结论

| #   | 结论                                                                                                                                                                                                                       | 状态                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 0-1 | token 的**值**已经对齐规范：颜色 37 个名字对上 36 个、九种阴影和十档圆角全在、两档外观的值逐个核过。剩下的是旧名字没退场                                                                                                   | 事实                                 |
| 0-2 | 原语换了一半：`components/ui` 54 个文件里 19 个按规范换过；`input` `textarea` `card` `tabs` `toggle-group` `sheet` 和 `slider` 的默认外观还是旧的；规范里的药丸、搜索框、头像、视频播放器在 `ui/` 里没有对应文件           | 事实                                 |
| 0-3 | 业务代码大多绕开原语自己写：全仓裸 `<button>` 858 处、`<Button>` 276 处；工作台范围（外壳 + 共用层 + 对话 + 各台）是 640 对 141。悬停自己配色 391 处、用规范叠层 52 处。焦点旧写法 370 处、规范写法 86 处                  | 事实                                 |
| 0-4 | 所以原语换了皮，画面只变了一小部分。「改一处、别处不跟着变」的原因在这里，不在规范不够                                                                                                                                     | Claude 推断                          |
| 0-5 | 台框只有三个台共用：`StudioWorkbenchLayout` 只被图像、标签、视频用；LoRA、3D、配音、画布各写各的台框和输入框                                                                                                               | 事实                                 |
| 0-6 | 「旧圆角约 1,000 处」这个说法要改：`rounded-sm / md / lg / xl` 是 6 / 8 / 10 / 14，都在规范的圆角刻度上，本身不违规。违不违规要看用在什么东西上（按钮和药丸该全圆、图格该 12），这一项用搜索量不出来，得一台一台对着样件看 | 数字是事实；「不违规」是 Claude 推断 |

### 1. token 层（`src/app/globals.css` 对 ui-spec §3.3 / §4 / §5）

| #   | 项                 | 规范                                                                     | 代码里                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 状态                                      |
| --- | ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| T1  | 颜色，素 / 暗房    | §3.3 表里 37 个名字                                                      | 36 个的值两档都一致（`:root` 与 `.dark` 逐个对过）                                                                                                                                                                                                                                                                                                                                                                                                               | 事实 · 一致                               |
| T2  | `grid-dot`         | 替换 `--canvas-grid-dot`，`rgba(16,18,24,.14)` / `rgba(255,255,255,.10)` | 没有 `--grid-dot`。画布仍用 `--canvas-grid-dot`，`canvas.css` 里 3 处定值，是暖色的另一组数。`rg -n -e '--(grid-dot\|canvas-grid-dot)\s*:' src -g '*.css'`                                                                                                                                                                                                                                                                                                       | 事实 · 不一致                             |
| T3  | `media-chip`       | 替换 `--overlay-chip`                                                    | 已换，`overlay-chip` 全仓 0 处                                                                                                                                                                                                                                                                                                                                                                                                                                   | 事实 · 一致                               |
| T4  | 字号十档           | §4 表                                                                    | 十档都落在现有类上（`text-3xs` 10 · `text-2xs` 11 · `text-xs` 12 · `text-2sm` 13 · `text-sm` 14 · `text-md` 15 + `leading-reading` 1.7 · `text-lg` 18 · `text-3xl` 30）。任意字号 0 处，`font-bold` 及以上 6 处，应用内 `font-display` 0 处                                                                                                                                                                                                                      | 事实 · 一致                               |
| T5  | 圆角               | 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 24 + 全圆                     | 全有：T 恤码给 6 / 8 / 10 / 14 / 18 / 22，`rounded-12 / 16 / 20 / 24` 是 10-25 加的                                                                                                                                                                                                                                                                                                                                                                              | 事实 · 一致                               |
| T6  | 圆角的重名         | —                                                                        | 另有 4 个域名字指向同样的数：`radius-shell-card` 16、`radius-node` 18、`radius-node-thumb` 12、`radius-node-bar` 16                                                                                                                                                                                                                                                                                                                                              | 事实 · 规范里没有                         |
| T7  | 阴影九种           | §5 表，两档                                                              | 九种的值两档都一致                                                                                                                                                                                                                                                                                                                                                                                                                                               | 事实 · 一致                               |
| T8  | 阴影的多余名字     | ⛔ 自己配阴影                                                            | `@theme` 里一共 22 个 `--shadow-*`，多出 13 个：6 个只是别名（`float`→`lift`、`assistant-overlay`→`pop`、`assistant-card`→`ring`、`node-card`→`card`、`node-chrome`→`float`、`node-menu`→`pop`），7 个有自己的值（`shell-card` `sidebar-chip` `assistant-panel` `assistant-raised` `node-panel` `node-trim-window` `node-card-expanded`）。`canvas.css` 还有 1 个 `--shadow-canvas-menu`。`rg -o -N -e '^\s*--shadow-[a-z0-9-]+' src/app/globals.css \| sort -u` | 事实 · 不一致                             |
| T9  | 阴影的实际写法     | 九种                                                                     | tsx 里一共 30 种写法：九种里用到 8 种（`shadow-lift` 0 处，它的旧名 `shadow-float` 12 处）、`shadow-none`、规范外 21 种（Tailwind 默认档 6 种共 103 处：`sm` 55 · `lg` 18 · `md` 14 · `2xl` 9 · `xs` 6 · `inner` 1；域自有 12 种共 55 处；任意值 3 种共 7 处）                                                                                                                                                                                                   | 事实 · 不一致                             |
| T10 | 规范外的浅底和材质 | 层次只有 `ground → panel → fill → fill-strong`，浮起的 `raise` / `float` | 还接着线的：`surface-workbench`（`#f4f4f1`，`.workbench-ground` / `.workbench-card` 还有 6 个文件在用）、`surface-fill` 三档（tsx 里 255 处，画布占 166）、`surface-glass`（18 处）、`surface-composer`（tsx 0 处，只剩样式表里 20 处）、`assistant-panel` / `-overlay`                                                                                                                                                                                          | 事实 · 规范里没有；该不该退是 Claude 推断 |
| T11 | 域自己的调色板     | 组件不认域、只用 token                                                   | 画布：`canvas.css` 156 个变量，tsx 里 `node-*` 颜色类 267 处。LoRA：`lora.css` 6 个变量，tsx 里 5 处 `shadow-[var(--lora-shadow-panel)]`                                                                                                                                                                                                                                                                                                                         | 事实                                      |
| T12 | CSS 变量总数       | —                                                                        | 486 个不同的名字。`rg -o -N -I -e '^\s*--[a-z0-9-]+\s*:' src -g '*.css' \| sed 's/[ :]//g' \| sort -u \| wc -l`                                                                                                                                                                                                                                                                                                                                                  | 事实                                      |

这一层的值不用再动。T6、T8、T10、T11 里的旧名字，要等用它们的那个台重做时才退得掉，不是单独的一步。

### 2. 原语层（`src/components/ui` 对 ui-spec §9）

54 个文件、9,150 行、`className=` 330 处。哪些换过，先看文件里有没有引用 `ui-spec`：`rg -l 'ui-spec' src/components/ui -g '!*.test.tsx'`（19 个）；`dropdown-menu` `popover` `sonner` 三个没写引用，但类名已经是规范的，下表按已换算。

| #   | 规范里的组件                         | 代码里                                                                                                                      | 现状                                                                                                                                                                                                     | 状态            |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| P1  | 按钮、图标键                         | `button.tsx`                                                                                                                | 已换（全圆、黑实心 / 白药丸、`tint-hover`、`shadow-focus`）                                                                                                                                              | 事实 · 已换     |
| P2  | 开关、提示、转圈、空状态、复制、收藏 | `switch` `tooltip` `spinner` `empty-state` `copy-button` `favorite-bookmark`                                                | 已换                                                                                                                                                                                                     | 事实 · 已换     |
| P3  | 弹窗、删除确认                       | `dialog` `alert-dialog` `confirm-dialog`                                                                                    | 已换（`scrim`、`pop`、宽 420 / 340）                                                                                                                                                                     | 事实 · 已换     |
| P4  | 菜单                                 | `dropdown-menu` `select` `popover` `command`                                                                                | 已换（`rounded-12 bg-popover shadow-pop`）                                                                                                                                                               | 事实 · 已换     |
| P5  | 图格、库拼图、挑选框、拖放层、黑条   | `media-tile` `library-kit` `library-picker` `drop-overlay` `sonner`                                                         | 已换                                                                                                                                                                                                     | 事实 · 已换     |
| P6  | 切换条                               | `liquid-segmented.tsx`（已换，48 处在用）                                                                                   | 另有两套旧的还活着：`toggle-group.tsx` 的 `segmented`（黑色滑块，3 个文件）和 `tabs.tsx`（1 个文件）                                                                                                     | 事实 · 换了一半 |
| P7  | 滑杆                                 | `slider.tsx`                                                                                                                | 规范的胖条是 `look="bar"`，要调用方自己写；默认仍是细条 + 圆钮 + `shadow-sm`。15 处 `<Slider>` 里只有 2 处写了 `bar`                                                                                     | 事实 · 换了一半 |
| P8  | 药丸                                 | `ui/` 里没有。长相是 `studio-shared/primitives/tool-surface.tsx` 里的一组类名常量                                           | 20 个文件引用（图像台身 8、标签台 2、配音与视频各 1、LoRA 4、共用层 3、对话 1），画布 0。`rg -l 'studioOutlineChip\|useStudioChipClasses\|studioColumnChipClass\|studioToolTriggerClass' src -g '*.tsx'` | 事实 · 没有原语 |
| P9  | 搜索框                               | `ui/` 里只有 `library-kit` 的 `LibrarySearch`（12 个文件在用）                                                              | 库以外的搜索框各写各的；带放大镜图标或 `type="search"` 的文件 32 个                                                                                                                                      | 事实 · 没有原语 |
| P10 | 头像                                 | `ui/` 里没有                                                                                                                | 5 套，见第 5 节                                                                                                                                                                                          | 事实 · 没有原语 |
| P11 | 视频播放器                           | `ui/` 里没有                                                                                                                | 3 套自写 + 7 处浏览器自带控件，见第 5 节                                                                                                                                                                 | 事实 · 没有原语 |
| P12 | 文本输入框（填字的框）               | `input.tsx`（28 个文件在用）、`textarea.tsx`（12 个）                                                                       | 都是没换过的旧样子：`rounded-md` + 描边 + `shadow-xs`。配 key 弹窗里那个框是手写的 `<input>`（`QuickSetupDialog.tsx:395`），没走这个原语。规范只写了搜索框、标签框和对话输入框，没写普通填字框长什么样   | 事实；长相未定  |
| P13 | 规范里没有的旧原语                   | `card.tsx`（1 个文件在用）、`badge.tsx`（2）、`sheet.tsx`（5）、`drawer.tsx`（10）、`sidebar.tsx`（4）、`progress.tsx`（1） | 没换。`card` 是 `rounded-xl border shadow-sm`，`sheet` 是 `shadow-lg`                                                                                                                                    | 事实 · 没换     |
| P14 | `ui/` 自己的被禁阴影                 | —                                                                                                                           | 14 处，分在 12 个文件里（`sidebar` 3 处，`input` `textarea` `card` `tabs` `sheet` `slider` `toggle-group` `prompt-input` `mention-input` `image-compare` `audio-player` 各 1）                           | 事实 · 不一致   |

### 3. 工作台共用层与外壳

外壳 `studio/shell` 8 个文件 2,734 行；共用层 `studio-shared` 33 个文件 10,047 行。

| #   | 东西                           | 写在哪                                                          | 谁在用                                                                                                                 | 状态                      |
| --- | ------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| S1  | 白板、左栏、板头、换台         | `shell/StudioShell.tsx` 等                                      | 所有台。白板已是 `rounded-20` + `shadow-ring`；外壳里被禁阴影 0、域自有阴影 0、焦点新写法 10 对旧写法 1                | 事实 · 基本对齐           |
| S2  | 台框（舞台在上、输入框在下）   | `chrome/StudioWorkbenchLayout.tsx`                              | 只有图像、标签、视频。LoRA 的输入框写在 `LoraWorkbench.tsx:4290`，配音的写在 `VoiceBench.tsx:271`，3D 和画布各有自己的 | 事实 · 没共用             |
| S3  | 药丸和药丸弹层                 | `primitives/tool-surface.tsx`（478 行）                         | 见 P8                                                                                                                  | 事实 · 在共用层不在原语层 |
| S4  | 模型选择器                     | `pickers/ModelPickerPopover.tsx`（1,505 行）+ `MainModelPicker` | 图像、标签、视频、3D、画布。对话有自己的 `StudioOperatorModelChip`（459 行），LoRA 的底模是 `LoraBasePill`（215 行）   | 事实 · 三套               |
| S5  | 规格药丸（比例、清晰度、张数） | `spec/SpecChip.tsx`（594 行）                                   | 图像、LoRA、画布                                                                                                       | 事实 · 共用               |
| S6  | 生成键                         | `workflow/StudioGenerateButton.tsx`                             | 图像、标签、LoRA。文件里有 2 处被禁阴影                                                                                | 事实 · 部分共用           |
| S7  | 生成进度（边即进度）           | `primitives/StudioGeneratingProgress.tsx`                       | 图像、LoRA、画布、对话                                                                                                 | 事实 · 共用               |
| S8  | 就地配 key                     | `setup/QuickSetupDialog.tsx`                                    | 全站                                                                                                                   | 事实 · 共用               |
| S9  | 修图台                         | `editor/ImageEditSurface.tsx`（1,047 行）                       | 图像、画布                                                                                                             | 事实 · 共用               |
| S10 | 共用层自己的旧写法             | —                                                               | 被禁阴影 6、裸 `<button>` 35 对 `<Button>` 14、悬停自己配色 14 对叠层 7、焦点旧 16 对新 6                              | 事实                      |

### 4. 各台

列的含义见「怎么量的」里的变量名。「裸 : 原语」是 `<button>` 对 `<Button>`；「悬停」是自己配色对规范叠层；「焦点」是旧写法对规范写法。

| 范围         | 文件 | 行      | `className=` | T 恤码圆角 | 12–24 | 被禁阴影 | 域自有阴影 | 裸 : 原语 | 悬停     | 焦点     | 半档高度 | 超 1,000 行 |
| ------------ | ---- | ------- | ------------ | ---------- | ----- | -------- | ---------- | --------- | -------- | -------- | -------- | ----------- |
| 原语 `ui`    | 54   | 9,150   | 330          | 53         | 11    | 14       | 1          | 21 : 10   | 19 : 12  | 18 : 12  | 3        | 1           |
| 外壳         | 8    | 2,734   | 72           | 7          | 1     | 0        | 0          | 11 : 0    | 4 : 3    | 1 : 10   | 4        | 0           |
| 共用层       | 33   | 10,047  | 450          | 46         | 6     | 6        | 1          | 35 : 14   | 14 : 7   | 16 : 6   | 3        | 2           |
| 对话         | 60   | 20,324  | 1,051        | 172        | 7     | 1        | 13         | 134 : 9   | 68 : 3   | 88 : 6   | 12       | 3           |
| 图像台身     | 28   | 9,345   | 463          | 52         | 1     | 6        | 1          | 34 : 24   | 13 : 0   | 15 : 0   | 2        | 3           |
| 视频专属     | 5    | 1,455   | 85           | 17         | 0     | 0        | 0          | 13 : 2    | 3 : 0    | 2 : 0    | 1        | 0           |
| 标签台       | 24   | 8,594   | 449          | 53         | 1     | 4        | 1          | 53 : 3    | 21 : 0   | 38 : 0   | 15       | 0           |
| 3D 台        | 4    | 3,312   | 257          | 42         | 0     | 6        | 0          | 15 : 19   | 4 : 0    | 3 : 0    | 0        | 1           |
| 配音台       | 1    | 570     | 35           | 0          | 2     | 0        | 0          | 7 : 4     | 2 : 2    | 1 : 2    | 1        | 0           |
| LoRA 台      | 55   | 22,497  | 1,471        | 130        | 10    | 16       | 2          | 150 : 41  | 41 : 3   | 50 : 9   | 17       | 2           |
| 画布         | 136  | 43,787  | 1,636        | 233        | 5     | 8        | 30         | 201 : 25  | 131 : 0  | 88 : 0   | 51       | 9           |
| **全 `src`** | 647  | 176,581 | 8,891        | 1,010      | 67    | 103      | 55         | 858 : 276 | 391 : 52 | 370 : 86 | 149      | 26          |

`className=` 按目录：`components/ui` 330，`components/business` 1,365，`features` 6,896（后两项合计 8,261）。工作台范围（外壳、共用层、对话、`features/studio`、LoRA、画布）的被禁阴影是 47 处，`ui/` 14 处，其余 42 处在首页、画廊、角色、设置等页面。

逐台补充：

| #   | 台       | 读代码看到的                                                                                                                                                                                                                                                                                            | 状态                           |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| B1  | 图像台身 | 施工单记 10-25「图片台台面」已做（#416）。看大图仍走旧弹窗 `ImageDetailModal` → `MediaDetailViewer`，没并进统一查看器。3 个文件超 1,000 行：`StudioTemplatesPanel` 1,106、`StudioPromptArea` 1,103、`GenerationPreview` 1,046                                                                           | 事实                           |
| B2  | 标签台   | 施工单把它排在各台细修的第一个，没开始。53 处裸 `<button>` 对 3 处 `<Button>`，规范的悬停叠层和焦点环 0 处                                                                                                                                                                                              | 事实                           |
| B3  | 视频台   | 专属的只有 5 个文件 1,455 行，其余跟着图像台身走                                                                                                                                                                                                                                                        | 事实                           |
| B4  | 3D 台    | 整个台是一个文件 `Studio3DWorkspace.tsx` 2,824 行，外加一份 227 行的 `Studio3DWorkspace.module.css`（里面自己写了 7 处圆角、1 处阴影）。新圆角档 0 处、九种阴影 0 处。施工单 `u-audit-skeleton` 记它是「旧表单」                                                                                        | 事实                           |
| B5  | 配音台   | 一个文件 570 行，11-02 新写的（`git log --diff-filter=A -- src/features/studio/components/voice-bench/VoiceBench.tsx`）。T 恤码圆角 0、被禁阴影 0，是离规范最近的一个台                                                                                                                                 | 事实；「最近」是 Claude 推断   |
| B6  | LoRA 台  | 施工单记 10-25 已做（#406）。`LoraWorkbench.tsx` 仍有 5,933 行，是全仓最大的文件；`LoraTrainingDialog.tsx` 1,317 行。被禁阴影 16 处，是各台里最多的。看样图走自己的 `LoraRecipeViewer`                                                                                                                  | 事实                           |
| B7  | 画布     | 最大：136 个文件 43,787 行，9 个文件超 1,000 行（`EditDeskTimeline` 2,671、`NodeWorkbenchV4` 2,425、`ImageNodeV4` 1,684、`VideoNodeV4` 1,479、`ShellSidePanels` 1,385、`AudioNodeV4` 1,324、`ShotTable` 1,216、`CanvasV4` 1,150、`EditDesk` 1,106）。有自己的调色板（T11），规范的悬停叠层和焦点环 0 处 | 事实                           |
| B8  | 对话     | `StudioOperatorPanel.tsx` 3,514 行、`StudioOperatorDock.tsx` 1,316 行、`StudioOperatorMessageBody.tsx` 1,011 行。134 处裸 `<button>` 对 9 处 `<Button>`。另一条线正在拆它的前端（助手优化第三批），现在动它会撞车                                                                                       | 事实；「会撞车」是 Claude 推断 |

### 5. 重复的组件家族

文件名里带这个词的 tsx 个数：`rg --files -g '*Chip*.tsx' -g '!*.test.tsx' src | wc -l`，换词即可。Chip 28、Card 36、Dialog 17、Menu 17、Panel 16、Picker 12、Viewer 11、Rail 10、Row 8、Avatar 7、Grid 7、Popover 7、Tile 5、Sheet 5、Modal 4、Player 4、Pill 3。文件名同词不等于重复，下面只列读过代码、确认是同一件东西的。

| #   | 家族       | 规范要几个                             | 现在几套                                                                                                                                                                                                                                                                                                      | 状态          |
| --- | ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| F1  | 查看器     | 1 个（`viewer/InPlaceViewer.tsx`）     | 4 套：`InPlaceViewer`（只有素材和画廊在用）· `ImageDetailModal` + `MediaDetailViewer`（图像台的 `GenerationPreview`、`CompareGrid`，以及 `ImageCard`）· `LoraRecipeViewer`（LoRA 台、LoRA 详情页）· `StudioOperatorLightbox`（对话）。LoRA 另有两个看图弹窗 `LoraSourceRecipeModal`、`LoraCoverPreviewDialog` | 事实 · 没合完 |
| F2  | 视频播放器 | 1 个，⛔ 浏览器自带控件                | 自写 3 套：`business/VideoPlayer.tsx`（图像台、旧大图弹窗、画廊详情）· 画布 `nodes/v4/video/VideoPlayer.tsx` · `LoraViewerVideo.tsx`。浏览器自带控件 7 处，统一查看器自己的 `ViewerMedia.tsx` 也在内。`rg -n -g '*.tsx' -g '!*.test.tsx' -P '^\s*controls\s*$\|<audio[^>]*\bcontrols\b' src`                  | 事实 · 没合   |
| F3  | 头像       | 1 个                                   | 5 套：`ProfileAvatar` · `VoiceAvatar` · `TimelineAvatar` / `AssistantTimelineAvatar` · `AssistantAvatarGlyph` · `AvatarDisc`                                                                                                                                                                                  | 事实 · 没合   |
| F4  | 药丸       | 台上、画布卡、助手确认卡同一颗         | 两套：`tool-surface.tsx` 的类名常量（20 个文件）· 画布 `nodes/v4` 下 8 个 `*Chip.tsx` + `ChipPopover.tsx` 自成一套                                                                                                                                                                                            | 事实 · 没合   |
| F5  | 切换条     | 1 个                                   | 3 套，见 P6                                                                                                                                                                                                                                                                                                   | 事实 · 没合完 |
| F6  | 模型选择器 | 1 个                                   | 3 套，见 S4                                                                                                                                                                                                                                                                                                   | 事实 · 没合   |
| F7  | 台输入框   | 台上和对话里一样                       | 至少 5 处各写各的：`StudioWorkbenchLayout`（图像 / 标签 / 视频）· LoRA · 配音 · 3D · 画布；对话和首页另有自己的                                                                                                                                                                                               | 事实 · 没合   |
| F8  | 图格       | 1 个（`ui/media-tile.tsx`）            | 10 个文件引用（素材、角色、提示词、音色、LoRA 库与 LoRA 台面）。图像台身和画布 0 引用                                                                                                                                                                                                                         | 事实 · 没接完 |
| F9  | 弹窗       | 只许三种用途：配 key、删东西、从图读串 | `<Dialog>` 19 处 + `<ResponsiveDialog>` 24 处，共 43 处；其中 `LoraTrainingDialog.tsx` 是 1,317 行的表单                                                                                                                                                                                                      | 事实          |
| F10 | 卡         | 柔影白卡一种外框 + 画布节点卡          | 文件名带 Card 的 36 个（对话 10 个）。没有逐个读，哪些是同一件没量                                                                                                                                                                                                                                            | 未量          |

### 6. 和现有文档对不上的地方

| #   | 哪里对不上                                                                                                                                                                                         | 状态                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| C1  | （11-10 已定，见「已定」第 1 条）做不做、什么时候做：施工单「下一个」第 5 条记着 owner 11-02 定「UI / UX 优化整体往后放，功能全部做完再调，放到本地做」；owner 11-10 说工作台要和首页并行做        | 已定：只先做地基                 |
| C2  | 画布节点卡：ui-spec §9 写 `panel` 底、圆角 12、`pop`；ui-defaults §3.1 写圆角 18（`rounded-node`）、两层阴影、米纸材质。线上是后一种（`rounded-node` 22 处）。ui-spec §0 的冲突表没列这一条        | 事实；以哪份为准未定             |
| C3  | 普通填字框（`Input` / `Textarea`）规范没写长相；ui-spec §11 要求样件没画的先问 owner                                                                                                               | 事实；长相未定                   |
| C4  | 施工单把图片台、LoRA 台记成 10-25 已做，把后面的叫「细修」。量下来图像台身的规范悬停叠层和焦点环都是 0 处，LoRA 台的被禁阴影是各台最多（B1、B6）。10-25 那一轮做的是台面摆法，没有把裸元素换成原语 | 数字是事实；后半句是 Claude 推断 |
| C5  | `globals.css` 里 `--shadow-float` 的注释写「那几块各自照规范重做时换成九种的名字，换完删掉这一行」。现在 `shadow-float` 12 处，`shadow-lift` 0 处                                                  | 事实                             |
| C6  | 弹窗的用途（F9）：规范说只用在三件事上，⛔ 用弹窗做表单页。ui-spec §11 同时写着「LoRA 台生成 / 训练怎么切还没定，⛔ 写死」                                                                         | 事实；轮到 LoRA 台再问           |

## 建议的施工顺序

顺序是 Claude 排的。owner 11-10 点头的只有一件事：第 1、2 步现在做（见「已定」）。第 3 步起仍是 **Claude 推断**。它不取代施工单；和施工单的关系写在每一步后面。

顺序的道理只有一条：下面一层没做完，上面一层每做一个台都要重新发明一遍。token 层已经做完，所以从原语层开始。

| 步  | 做什么                                                                                                                                                                                                                                       | 多大                                                                           | 为什么排在这                                                                         | 和施工单的关系                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 0   | 和 owner 对齐。A 已定（11-10）；B 在第 3 步之前要，C 在第 1 步之后要                                                                                                                                                                         | —                                                                              | ui-spec §11 和 AGENTS「新模块开工先对齐」都要求                                      | —                                                                       |
| 1   | **第一刀：补齐原语层里规范已经写明的那一半。** 药丸从 `tool-surface.tsx` 提成 `ui/` 里的原语；加搜索框原语；滑杆默认改成规范的胖条；`toggle-group` 的黑滑块和 `tabs` 并进 `liquid-segmented`；删掉或换掉 `card`；清掉 `ui/` 里 14 处被禁阴影 | 小。`ui/` 一共 54 个文件，动 10 个左右；调用方要跟着改的约 25 个文件           | 最底下还没做完的一层。动的全是规范写明的，不需要 owner 先做视觉决定                  | ui-spec §11「先公共组件」的续作；10-25 第 1 个地基 PR 做了前一半        |
| 2   | 共用件收成一份：查看器（F1）、视频播放器（F2）、头像（F3）、台框和输入框（F7）                                                                                                                                                               | 中。每一样一个 PR，共 4 个                                                     | 这四样每个台都要用。先合好，后面每个台只是换上去                                     | 查看器是 `u-viewer`（10-25）没做完的部分；输入框对应 `u-audit-composer` |
| 3   | 第一个台：**图像台身**，接着标签台、视频专属。把裸元素换成原语，再逐屏对样件 E                                                                                                                                                               | 中。图像台身 28 个文件 463 处 `className=`；标签 24 个 449 处；视频 5 个 85 处 | 三个台共用这一副，做一遍动三个台；施工单本来就把标签台排第一，而标签台就坐在这一副上 | 等于施工单「各台按样件 E 细修」的标签台、视频两项，前面多做了台身       |
| 4   | 配音台、3D 台                                                                                                                                                                                                                                | 配音小（1 个文件 570 行）；3D 中（1 个文件 2,824 行，要先拆）                  | 配音几乎已经对齐，顺手收掉。3D 接到共用台框上                                        | 施工单「视频 / 3D、配音间」；`u-audit-skeleton` 的 3D 那一项            |
| 5   | LoRA 台                                                                                                                                                                                                                                      | 大。55 个文件 1,471 处 `className=`，其中一个文件 5,933 行                     | 要先定 C6（训练放哪）                                                                | 施工单记为已做，见 C4                                                   |
| 6   | 画布                                                                                                                                                                                                                                         | 最大。136 个文件 1,636 处 `className=`，有自己的调色板                         | 要先定 C2（节点卡圆角和材质）。施工单也把它排最后                                    | 施工单「画布」                                                          |
| —   | 对话                                                                                                                                                                                                                                         | 大。60 个文件 1,051 处 `className=`                                            | 不排进上面的顺序：助手优化那条线正在拆它的前端，等那边做完再接                       | `u-audit-message`、`u-audit-composer`                                   |

**为什么第一刀是第 1 步，不是直接挑一个台做：**

1. 它是最底下还没做完的一层。token 的值已经对齐，再往下没有东西可做。
2. 它小，而且边界清楚：只动 `components/ui` 和直接引用它的文件。
3. 它不需要 owner 先看图做决定。这一步动的每一样规范里都有一段明确的话；唯一没写的填字框（C3）不在这一刀里。
4. 后面每个台都要用药丸、搜索框、切换条、滑杆。不先做，第 3 步做图像台身时还得在台里再写一遍，就是现在这个局面的来历。
5. 它能当场验证「改一处、全站跟着变」这件事成不成立：滑杆默认外观一换，13 处没写 `bar` 的 `<Slider>` 应该一起变。

**每个台做到什么算完**（Claude 推断，全部来自规范已有的条文，不是新规则）：第 4 节那张表里这一台的「被禁阴影」「域自有阴影」「半档高度」到 0；「悬停」和「焦点」左边那个数到 0；裸 `<button>` 只剩说得出理由的；然后开着 dev 逐屏对样件 E。超过 1,000 行的文件拆不拆只是手段，规范没要求。

**顺手可以加的检查**（Claude 推断）：ui-defaults §3 已经写了 ⛔ `shadow-md` / `shadow-lg`，§9 列着几条「待落地」的机器门。第 1 步做完后给 `ui/` 加一条和 `typography.contract.test.ts` 同类的检查，被禁阴影再出现就红。这是给已有的禁令配检查，不是加规则。

## 待定

每一条都写了 owner 可以看什么。A 已定，移到下面。B、C 影响第 2、3 步；D、E 轮到那一步再问。

| #   | 问题                                                                                                 | 看什么                                                                                                                                                                                       | 现在的倾向                 | 什么时候要  |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------- |
| B   | 这两周你自己开得最多的是哪个台？                                                                     | 第 4 节那张表。Claude 建议的第一个台是图像台身，理由是三个台共用；如果你最常用的不是这三个，顺序可以换                                                                                       | 图像台身                   | 第 3 步之前 |
| C   | 普通填字的框长什么样？规范没写                                                                       | 线上两处并排看：任何一个库页顶上的搜索框（浅灰、没边、全圆），和点一个没配 key 的模型弹出来的配 key 框里那个输入框（细描边、小圆角）。问题只有一个：填字框是跟搜索框一家，还是保留现在的描边 | 无。规范说样件没画的要问你 | 第 1 步之后 |
| D   | 画布节点卡用哪一种：圆角 12 的白卡（ui-spec §9），还是现在线上的圆角 18 加米纸（ui-defaults §3.1）？ | 线上 `/studio/node` 随便一张节点卡，对规范页 <https://claude.ai/artifact/JwpTLS2kmP69GA5piJPwW1> 里「画布节点 NodeCard」那张卡                                                               | 无                         | 第 6 步之前 |
| E   | LoRA 训练现在是一个弹窗里的长表单。规范说弹窗不做表单页，同时说训练怎么切还没定                      | 线上按 ⌘K 打开的 LoRA 训练弹窗（`LoraTrainingDialog.tsx`）                                                                                                                                   | 无                         | 第 5 步之前 |

## 已定

| #   | 定了什么                                                                                                                                                     | 怎么定的                                                                                                                                                   | 边界                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **只先做地基两步**：第 1 步（补齐原语层里规范写明的那一半）和第 2 步（共用件收成一份）现在可以做。各台（第 3 步起）仍按施工单「下一个」第 5 条，功能做完再调 | owner 2026-11-10 在待定 A 的两个选项里点了「只先做地基」。原问题：11-10「工作台并行做」是取代 11-02「UI 往后放」，还是只指地基那两步、不碰任何一个台的摆法 | ⛔ 借这两步改任何一个台的摆法。第 2 步里「台框和输入框」那一项如果必须动某个台的摆法才合得起来，先停下来问。owner 点的是范围，没有逐条看过第 1、2 步的内容清单；清单里的每一样都得在 ui-spec 里有明文，没有明文的（填字框，待定 C）先问 |
| 2   | **字号拉开、疏密放开**。字号只留四档 20 / 15 / 13 / 11，字重只用 400 和 600；舞台内距、板块之间、图与图之间放开到 16–32，输入框里那一行药丸不变              | owner 2026-11-11 点「按 B，继续」（小样 1）                                                                                                                | 这是方向，还没写成规范。它和 ui-spec §4 有出入（那里字重是 400 / 500 / 600、标题是 14）。落地前先改 ui-spec §4 / §5 对应的行，再进 `src/`；⛔ 跳过规范直接改代码                                                                        |
| 3   | **色温偏暖；只有输入框浮起**。底、面、浅底块、字的明度不变，灰里带一点暖；台输入框从一圈细边换成柔影白卡；药丸仍是浅灰无边、图格仍没边没影                   | owner 2026-11-11 点「按这个定」（小样 2）                                                                                                                  | 同样是方向。色温要改 ui-spec §3.3 约十个颜色值，暗房那一档另算，每一对都要重算对比度（≥ 4.5:1）；小样里的色值只是示意，⛔ 直接抄进 `globals.css`。输入框浮起用九种阴影里已有的一种，⛔ 新配阴影                                         |

施工单还没跟着改：「下一个」第 5 条要补一句「地基两步除外（11-10）」，随第 1 步的 PR 一起改。

## 目标五句话

工作台整体要成为什么样。放在所有组件规则之上，以后拿它验收。第 2 到 5 句来自「已定」第 2、3 条；第 1 句是 Claude 归纳的，owner 没单独确认过。

1. 一屏只有一个主角：台上是出的图，对话里是她说的话，其余都往后退。（Claude 推断）
2. 字只有四档、两种字重，标题一眼能找到，次要的字一眼能略过。（已定 2）
3. 板块之间留得开，工具那一行收得紧。（已定 2）
4. 底色是带一点暖的灰白，和首页看起来是同一个产品。（已定 3）
5. 只有要你动手的那一处浮起来，别的都是平的。（已定 3）

## 小样

用来定方向，不是开工。放 `.claude/mockups/workbench-direction/`，按 `CLAUDE.md`「demo / 原型是例外」不受现有 token 约束。⛔ 进 `src/`。做法照 11-10 那段审计的建议：拿一个真实的屏，每次只改一个维度，在同一个位置来回切。

| #   | 做什么                                                                      | 只变哪一项                                                                                                                                                 | Claude 选哪边                                                                                                                       | 状态             |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | 图像台一屏（四张橘猫图 + 输入框，宽屏带对话栏）。A 是现在的写法，B 是改过的 | **字号**：A 六档挤在 10–16、几乎全是 500；B 只留四档（20 / 15 / 13 / 11）、字重只用 400 和 600。**疏密**：A 间距都在 12 以内；B 放开到 16–32               | 字号选 B。疏密选 B，但只用在舞台和板块之间，输入框里那一行药丸保持 A 的紧凑                                                         | owner 11-11 定 B |
| 2   | 同一屏，字号和疏密已按 B                                                    | **色温**：A 现在的冷灰；B 同样明度、灰里带一点暖。**材质**：A 平涂（灰药丸、输入框一圈细边、图没有影）；B 浮起（白药丸加柔影、输入框换成柔影白卡、图带影） | 色温选 B。材质只取 B 的一样：输入框浮起来；药丸和图保持 A，因为 ui-spec ㉕ 和 ⑪ 是 owner 逐条确认过的（药丸浅灰无边、图格没边没影） | owner 11-11 定   |

小样 1 在 `.claude/mockups/workbench-direction/compare-1.html`，起着 `mockup-server` 时打开 <http://localhost:8899/mockups/workbench-direction/compare-1.html>。顶上黑条两组开关各管一项，键盘 1 / 2 切字号、3 / 4 切疏密。按 680 宽和 1280 宽各看过一遍，不横向溢出。小样 2 在同目录 `compare-2.html`，<http://localhost:8899/mockups/workbench-direction/compare-2.html>，键盘 1 / 2 切色温、3 / 4 切材质。

## 相关文件

- [`references/ui-spec.md`](../references/ui-spec.md)：目标。§3.3 token、§4 字、§5 尺寸圆角阴影、§9 组件、§11 施工。
- [`references/ui-defaults.md`](../references/ui-defaults.md)：字体槽、动效、移动端、完成定义；§3.1 是画布节点卡例外（C2）。
- [`roadmap.md`](../roadmap.md)：「下一个」第 3、5 条；「各台」表里「视频 / 3D、配音间、画布按样件 E 细修」；「UI 调查待改」的 `u-audit-*` 八组；「UI 地基与外壳」已完成的 `u-menu` `u-composer` `u-viewer` `u-css-split`。本文没有改施工单。
- [`home-v6.md`](home-v6.md)：讨论记录第 11 行、待定 I 是本文的来历。
- 规范页 <https://claude.ai/artifact/JwpTLS2kmP69GA5piJPwW1>、样件 E <https://claude.ai/artifact/9Y9G5i7XueWrKiiDGTo1Di>：owner 的私有页，逐屏对照时用。本次没有打开。

## Last Verified

- 2026-11-11 · 方向写进 `ui-spec.md`（讨论记录第 9 行）。
- 2026-11-11 · owner 定色温偏暖、只有输入框浮起；加「目标五句话」。
- 2026-11-11 · owner 定字号 B、疏密 B；加小样 2（色温、材质）。
- 2026-11-11 · 记第 1 步完成并合进本地 main；owner 说先定方向并把方向交给 Claude 定；加「小样」一节和小样 1。
- 2026-11-10 · owner 定了「只先做地基」，记进讨论记录第 4 行和「已定」。
- 2026-11-10 · 首版。全部数字当日在 `9f4b31806` 上用「怎么量的」里的命令量过。没有启动 dev，没有看画面，没有打开规范页和样件 E。「逐个核过」的范围：`globals.css` 的 `:root` / `.dark` 对 ui-spec §3.3、§5 两张表；`components/ui` 的 54 个文件只读了和长相有关的类名，没有逐行读完。
