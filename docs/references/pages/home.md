# 首页施工图 — marketing home

> **当前基准：v3「Mobbin 式骨架」（2026-07-27，owner 逐轮确认，原型已验收）。**
> 设计过程与全部实测证据在 `docs/plans/homepage-motion-design-2026-07-27.md`（§8 竞品实拆 · §9 结构与动效定稿）。
> 原型（不受设计文档约束，仅作交付参照，**不是可合入代码**）：<https://claude.ai/code/artifact/e45f6dda-6661-4cad-b0f2-cf666957fc67>
> ⚠ 本文件 §A 之后的**全部旧内容（2026-07-13 Haivis 方向）已被推翻**，保留以备追溯。唯一仍有效的旧条款是 §2 登录层（登录/注册入口开 modal），与新骨架不冲突。

---

# A · v3 基准（施工用，改首页只看这一节）

## A0 · 三条不可协商的前提

1. **首屏必须正好一个视口。** 之前内容只到 729px 而视口 854px，画布框的顶边露在折线下，读起来像 bug。用 `min-height:100svh` 的 flex 列，跑马灯坐底。
2. **排版是唯一的强调手段。** 没有插画、没有渐变、没有装饰图形。全部分量来自字号、字重、行高、字距。加任何第三种视觉元素之前先问是不是能用排版解决。
3. **只有两个颜色。** 纯白底 + 纯黑字，灰只做面板底与次要文字，**零品牌色**——页面上所有颜色都来自用户自己的生成结果。

## A1 · 段落顺序

| 段       | 内容                                                           | 关键约束                                                                                |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 顶栏     | 悬浮药丸：`ANTEI` ⟷ 语言 + 登录 + 注册                         | **宽度≈半页**（字标贴左端、控件贴右端）；nav 已删，hero 里不再放第二组登录注册          |
| 首屏     | 等宽统计行 → 大标题两行 → 10 张真实生成结果横条 → 供应商跑马灯 | 恰好 1 个视口                                                                           |
| 产品自曝 | **四视图同高滑动切换**：画布 / 工作台 / LoRA / 素材            | 视图用 CSS radio + 轨道平移，不依赖 JS；四视图等高由 `.views` 的固定宽高比锁定          |
| 能力段   | **钉住舞台**，随下滑换片三个能力，带步进条                     | 文字左 / 演示右**固定不交替**；图片案例的操作与结果说明直接属于左侧文案，右侧只渲染图片 |
| 模型阵容 | 按图片 / 视频 / 音频 / 3D **四类分轨**                         | 此段单独用页面边距，不吃 1360 居中；卡片先开模型介绍层；横轨只允许横向滚动              |
| 页脚     | 黑底，白页圆角收进去                                           | 字标 + 一句话 + 产品/资源/公司三栏 + 版权行                                             |

### A1.1 · 产品演示的手机适配

- 手机宽度不把桌面演示框继续等比压扁；四个视图保持同一移动端高度，切换时页面不跳动。
- App bar 四个标签保持单行，命中区至少 44px；较长语言可以在标签条内部横向浏览，不能逐字竖排。
- Canvas 保持节点卡可读尺寸并在框内横向触摸浏览；Studio 与 LoRA 由桌面左右栏改为
  输入/装配在上、结果在下；Assets 使用 4×5 网格。
- 产品框必须完整参与文档流，任何内部内容都不能覆盖下一能力段；页面根不能出现横向溢出。
- 能力段的 GSAP pin 只在 1001px 及以上启用；更窄屏幕按三段正常文档流展示，
  跨断点时必须完整撤销 pin、透明度/位移、`inert` 与 `aria-hidden`。
- 760px 以下页脚品牌说明独占整行，导航使用两列；说明保持一句短文案，不能与三组
  导航挤在同一行后逐字换行。

## A2 · 视觉令牌

```
--paper #fff   --ink #000   --panel #F2F2F0   --panel2 #E7E7E4
--dim   #767674  --line #E2E2DF   页脚底 #0C0C0C
圆角 16 / 24 / 30 / 999
```

外框垫层一律不要——内容只靠 1px 细线 + 圆角定义自己。

## A3 · 字体

| 角色                | 字体              | 备注                                  |
| ------------------- | ----------------- | ------------------------------------- |
| 拉丁（正文 + 标题） | **Noto Sans**     | 首页域新增，**不动全站 Geist**        |
| 中文                | **Noto Sans SC**  | `src/i18n/fonts.ts` 已有，400/500/700 |
| 日文                | **Noto Sans JP**  | 同上，已有                            |
| 等宽 / 数字 / 标签  | **IBM Plex Mono** | 首页域新增                            |

栈的写法（关键）：

```css
--cjk: 'Noto Sans SC'; /* html[lang^=ja] 改写为 Noto Sans JP */
--sans: 'Noto Sans', var(--cjk), …; /* 拉丁走本体，CJK 落到 locale 面 */
```

⚠ **拉丁必须排在 CJK 前面。** 反过来的话「一句 prompt，」里的 Latin 会由 SC 内嵌的拉丁绘制，比 Noto Sans 本体松。

⚠ **选面用 `.home-v3[data-locale='ja']`，不要用 `:root[lang^='ja']`。** `<html lang>` 由**根** layout 写，而根 layout 在客户端导航时永不重渲染——顶栏切到日文后 `lang` 还停在旧值，日文被 Noto Sans SC 的简体字形画出来。域根自己带 `data-locale`（`HomeV3Shell` 在 `[locale]` 下，会随语段重渲染），零脚本就对。`<html lang>` 本身的陈旧（影响读屏）由 `src/components/layout/LocaleHtmlSync.tsx` 在 `[locale]/layout.tsx` 里补——那是全站问题，侧栏那个 `LocaleSwitcher` 一样中招。

字重：正文 400 / 500，标题 **700**（不要 800——CJK 只装 400/700，800 会被合成变形）。

## A4 · 中文排版的三个坑（都踩过）

1. **行高 1.0 在中文里两行会重叠。** 那是拉丁的度量；中日韩字身满高。实测 99px 字号下重叠 27px。标题行高 **1.14** 是极限。
2. **`max-width: Nem` 是按容器自己的字号算的**，写在小字号容器上会把大标题挤爆。约束 lede，别约束标题。
3. **中文没有空格，浏览器会在任意两字之间断行。** 必须 `word-break: keep-all; line-break: strict`，否则「创作线」会被从中间劈开。

另：判断中文行距**不要看 `getClientRects`**——它算的是回退字体的完整 ascent+descent，不是墨迹，会误报重叠。

## A5 · 动效（GSAP + ScrollTrigger）

| 时机       | 动作                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 载入       | 统计行上浮 → 标题逐行揭起 → 10 张图依次落位（间隔 .07s，各自从 1.25 倍缩回）                     |
| 进场       | 上浮 70px + 淡入；产品框 110px + 从 .93 放大；模型卡仅透明度错开 .07s                            |
| scrub      | hero 图条视差滞后；模型轨不随页面纵向滚动自动漂移                                                |
| 钉住       | 仅 1001px 及以上：能力段三片交叉换片，步进条同步                                                 |
| 演示框内部 | 四格按序显影 / 播放头走满 + 胶片跟进 + 主画面推近 / 转台四角度依次点亮；只在自己那片在台上时循环 |
| 顶栏       | 滚过 140px 收紧                                                                                  |

全部包在 `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` 里。

全部落在 `src/components/business/home-v3/HomeV3Motion.tsx`：唯一的 client 边界，`useEffect` 里动态 `import('gsap')`，卸载时 `mm.revert()`。`.is-pinned` 由它加类——不加就是三行堆叠，脚本挂掉页面只是没动画。

模型阵容卡片点击后必须先打开响应式介绍层，说明能力、优势、provider、计价与模态；
只有介绍层里的明确 CTA 才进入 Studio。鼠标位于横轨内时，纵向滚轮用于横向浏览，
轨道自身必须 `overflow-y: hidden`，不得吞掉页面的纵向滚动。

### A5.1 五条实现陷阱

1. **`scrollLeft` 直接写进 GSAP vars 无效** —— 不是 CSS 属性，未装 ScrollToPlugin 时被 CSSPlugin 静默丢弃。用代理对象 + `onUpdate` 手写。
2. **`scroll-behavior: smooth` 和 scrub 互斥** —— 每帧写值都被浏览器变成一次平滑动画。用 `el.scrollTo({behavior:'instant'})`。
3. **不能在时间轴创建后改 `scrollTrigger.vars.onUpdate`** —— ScrollTrigger 已经缓存了回调。先声明回调变量再赋值。
4. **钉住的是内层盒子，不是被动画的子元素**（`pin: '.capwrap'`）。
5. **自动化标签页里这些动效一律验不出来** —— 后台 tab 的 rAF 完全冻结（实测 1.5s 内 0 帧），钉住、换片、demo 循环全读成「没发生」。`HomeV3Motion` 在 `NODE_ENV !== 'production'` 下挂 `window.__homeV3Motion = { gsap, ScrollTrigger }` 专为此：探针里 `gsap.ticker.lagSmoothing(0)` → 滚动 → `ScrollTrigger.update()` → **`gsap.globalTimeline.time(t + dt)` 推时钟**再读值。⚠ 不要用 `gsap.ticker.tick()` 推——它按真实时间算 elapsed，同步连调多次等于原地不动，会把正常的 scrub 误判成坏的。

### A5.2 两条被否决的方案

- **CSS `animation-timeline: view()`**：`entry 6%→46%` 让动画在元素还在屏幕底部时就演完，正常速度滚动完全看不到。
- **IntersectionObserver**：失败模式不可接受——观察器不触发时所有目标永远停在 `opacity: 0`。GSAP 在运行时设起始态，脚本没跑页面只是没动画，内容不会消失。**这一条是选 GSAP 的决定性理由。**

## A6 · Port 到 `src/` 的五处不可 1:1

|          | 原型                      | 生产                                                                         |
| -------- | ------------------------- | ---------------------------------------------------------------------------- |
| 字体     | base64 子集内联           | **next/font**（内联那套只为绕 artifact CSP，绝不进生产）                     |
| 图片     | base64 内联               | `/public/homepage/archive/*` + `/public/showcase/*` + `next/image`           |
| 文案     | 硬编码中文                | `src/messages/{en,ja,zh}.json` **三文件同步**                                |
| GSAP     | 内联                      | 装依赖，**只准首页域 + 动态导入不进主 chunk**（见 CLAUDE.md 动画库分工条款） |
| 模型阵容 | 手写 24 个型号 + 手写价格 | **`getAvailableModels()` 实时目录**（见下）                                  |

**模型轨必须走真目录，不能抄原型的清单。** 原型列的 Nano Banana 2 Lite / NovelAI V4.5 / Qwen Image / Veo 3.1 / Runway Gen-4 / ElevenLabs v3 / MiniMax Speech 有一半不在 `getAvailableModels()` 里——首页宣传产品跑不了的模型是硬伤，而目录本身每月过审（`docs/references/model-catalog.md`），手抄一份必然腐烂。名称走 `MODEL_MESSAGE_KEYS`，供应商走 `getProviderLabel`，价格走 `HOMEPAGE_MODEL_REFERENCE_PRICES`，缺价的落 `Homepage.models.priceVaries`。

**v2 已清场（2026-07-27）**：17 个 `Homepage*` 组件 + `homepage.css`（1479 行）+ 11 个 message 命名空间已删。三个旧测试（`HomepageHero` / `HomepageHeroCta` / `HomepageFeatureSection`）随组件删除——它们测的是 hero CTA 和 feature rhythm，v3 里这两样都不存在，没有可迁移的断言。替代覆盖 = `src/components/business/home-v3/home-v3.test.ts`（资产存在性 / 四视图数 / 边端点 / 模型轨覆盖全目录），i18n 由 `src/i18n/completeness.test.ts` 兜。

## A8 · 登录 / 注册页（`/sign-in` `/sign-up`）—— 独立域，后续单独设计

**owner 2026-07-27 定：登录页的设计后面单独做，不在首页这条线里。** 这里只记它和首页现在的耦合，免得下一轮再踩。

- 文案挂在 `Homepage.auth.*`（`panel.eyebrow/title/description/items.*` = 左栏；`signIn|signUp.eyebrow/title/description` = 右栏；`note` = 底部一句），载体是 `src/components/business/AuthPageShell.tsx`。⚠ **不能删**——两个 route 是 `useTranslations('Homepage')` 再取 `auth.*`，按命名空间 grep 搜不到；v2 清场时差点删掉，是 `completeness.test.ts` 拦下来的。
- 名字已名不副实（它是登录页文案，不是首页的）。**重设计那一轮顺手搬去自己的命名空间**，连带改 `sign-in` / `sign-up` 两个 page。现在不动是因为改动会越过首页的范围。
- 它**不共享** v3 的皮肤：`AuthPageShell` 走全站暗色 token，v3 是独立的 `.home-v3` 浅色域。所以登录页重设计不受 §A 约束，也不要拿 §A 的令牌当答案。
- 已知缺口：登录页**自己没有语言切换器**。用户从邮件深链直接落在 `/en/sign-in` 就换不了语言。首页顶栏已经有了（见 §A1），登录页那一份留给重设计。

## A9 · 仍未决

- 三个演示框的内容目前是**静态构造的假 UI**，不是真组件；要不要接真数据是独立决定。
- **短轨留白**：接真目录后音频只有 2 个模型、3D 只有 5 个，横向轨在 1920 下右边空掉一大半，跟 18 个的图片轨并排看着像坏了。选项＝按组换卡宽 / 短轨居中 / 短轨改成非轨的排布 / 等音频域把模型接上。未拍板。
- 页脚「资源 / 公司」两列的 href 目前是 `#` 占位（`HOME_V3_FOOTER_COLS`），线上是死链。
- 英文 / 日文的实际排版尚未在真机看过（三语文案表已写好，见 §A6 的 messages 迁移）。
- 加了 client 组件后首页**是否仍静态预渲染**（`revalidate = 3600`）没验证过——`usePathname` 在静态渲染里是合法的（只有 `useSearchParams` 会强制 dynamic），但唯一证据是 production build，而验证时 dev server 在跑，没并行 build。停 dev 后跑一次 `npm run build`，看 `/[locale]` 是不是 ●(SSG)。

---

# B · 旧方向（2026-07-13 Haivis）— 已被 A 推翻，保留追溯

> 状态：**方向拍板（2026-07-13）** · **登录 modal 实现已回退**（恢复 path `/sign-in` `/sign-up`）· 首页动态演示（P1+）仍待讨论。  
> 房间：营销首页 `/` · 参考：`docs/references/ui-inspiration/haivis-landing-2026-07.md`  
> 边界：作品优先 / 证据式能力；登录 modal 仅作产品意向，代码未采用。

## 0. 拍板记录（本会话）

| 项           | 拍板                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| 登录         | **一律 modal**（用户主动登录/注册不整页跳转）；OAuth/邮件深链可保留 `/sign-in` `/sign-up` 作 Clerk 回调与兜底 |
| 首页能力演示 | **只要项目 `ready` 的真能力**；效果语法学 Haivis（图上叠交互证据），不是换皮肤                                |
| 不进首页演示 | `object-replace` / `style-transfer` / `text-render`（`availability: hidden`）                                 |
| 与画布关系   | 首页 = 预告与证据；画布 = 兑现。画布对标仍见 `haivis-canvas-2026-07.md` + `node-canvas.md`                    |

## 1. 产品意图（一句话）

未登录用户在**不离开首页**的情况下：被真实生成/编辑证据说服 → 点 CTA → **模态登录** → 进入 Studio/画布做同一件事。

## 2. 登录层（Haivis 01 方法）

### 2.1 体验

```text
当前页保持（首页或其它营销/公开页）
  → 背景压暗 + 轻模糊
  → 居中认证窗（可关 × / Esc / 点遮罩）
  → Clerk 内容：社交优先 + 邮箱
  → 成功 → fallbackRedirect 进 Studio（现有 studio 路径）
```

### 2.2 实现约束

| 约束 | 说明                                                                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 入口 | 首页主 CTA、Header 登录/注册、Bottom CTA、侧栏未登录入口等 **用户可见登录动作** 一律开 modal                                                                                |
| 组件 | Clerk `SignIn` / `SignUp` `routing="virtual"` 或 `SignInButton mode="modal"` + 统一 `clerkAppearance`（modal 卡片皮）                                                       |
| 外观 | 小窗、高对比主按钮、低 chrome；**不**复制 Haivis 彩线稿；不做成整页 `AuthPageShell` 双栏                                                                                    |
| 深链 | 保留 `/sign-in` `/sign-up`：middleware 强制、OAuth return、邮件魔法链；可选「打开即 modal 样式全屏卡」或重定向回 referrer+modal——实现阶段二选一，默认 **path 页可继续工作** |
| 禁改 | 不改 Clerk 策略密钥与 credit；不把 modal 逻辑塞进 API                                                                                                                       |

### 2.3 验收

- 未登录点「开始创作」：仍在 `/`（locale 保留），遮罩 + 窗出现。
- 登录成功：进 Studio，窗关闭。
- Esc/× 关窗后首页可继续滚动演示。
- 直接访问 `/sign-in` 不 404。
- 三语 Clerk localization 仍生效。

## 3. 首页动态证据（学 Haivis 03–06 的语法）

### 3.1 原则

1. **作品是舞台**；选区 / 滑杆 / 笔刷 / 层描边是状态层。
2. **一屏一件事 + 一个 CTA**（进对应 Studio/画布能力，未登录先 modal）。
3. Demo **不调生成 API**（预烘焙资产 + 前端动效）；CTA 才进真产品。
4. `prefers-reduced-motion: reduce` → 静态终态或一步切帧，不循环炫技。
5. 文案短：标题 + ≤3 行 + CTA；媒体权重大于文案。

### 3.2 能力映射（以 `canvas-image-edit-capabilities.ts` 为准）

| 首页章节（建议 id）     | Haivis 对位语法                    | 真能力                                                                                          | Demo 做法（前端）                                                    | CTA 去向（登录后）          |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------- |
| `demo-decompose`        | 元素拆分：对象轮廓/层浮出          | `decompose` ready                                                                               | 一张成图 → 预烘焙多图层依次浮起/可 hover 高亮；元数据条 Image · 尺寸 | 画布/图层分解工作流         |
| `demo-compare`          | 同位 before/after 滑杆             | 用 **ready** 结果对：优先 `remove-background` 或 `upscale`（**不用** hidden 的 object-replace） | 单图坐标内拖动分隔线；左右为 before/after 资产                       | 去背景或超分任务页/画布工具 |
| `demo-extract`          | 近场「点选/抽出」感                | `extract-element` ready                                                                         | 成图上高亮一主体 → 侧出透明抠图缩略（预烘焙）                        | 元素提取                    |
| `demo-inpaint`          | 魔法擦除：笔迹叠在作品上           | `inpaint` ready                                                                                 | 循环：笔刷蒙版轨迹 → 切到擦除后帧（或短 loop 视频）                  | 局部重绘                    |
| （可选）`demo-outpaint` | 画布外扩                           | `outpaint` ready                                                                                | 画框外扩动画                                                         | 扩图                        |
| （可选）多模型图墙      | 证据墙（非 Haivis 四段，属本产品） | 多模型生成                                                                                      | 现有 contact + model chip                                            | Studio 出图                 |

**明确不上首页演示（hidden）**

- `object-replace` — 无可用模型，禁止写成「一键换装/换元素」产品承诺。
- `text-render` — 无文字图层产品，禁止「改字即画面响应」产品 CTA。
- `style-transfer` — 同上。

若以后要「像 Haivis 换装滑杆」：**先能力 `ready`，再上首页**；滑杆组件可先为去背/超分服务。

### 3.3 章节节奏（建议 IA）

```text
Hero（作品墙 + 单一主 CTA → modal 或 Studio）
  ↓
产品全景一帧（可选：Studio/画布真实 UI 截帧，有外框收成一体）
  ↓
demo-compare     （滑杆 · 最易懂 · 先做）
  ↓
demo-inpaint     （笔刷擦除）
  ↓
demo-decompose   （图层浮出）
  ↓
demo-extract     （抽出元素）
  ↓
多模型 / 视频 / 音频 / 画布 / 模型阵容（现有段可收敛，避免再堆半成品条）
  ↓
Bottom CTA → modal
```

左右交替；**每段必有 CTA**。禁止再上「无标题无 CTA 的纯条带」。

### 3.4 资产目录（建议）

```text
public/homepage/demos/
  compare/{before,after}.webp
  inpaint/{source,mask-preview,result}.webp  或 short.webm
  decompose/{base,layer-1..n}.webp
  extract/{source,cutout}.webp
```

缺资产时：用现有 `showcase` / `homepage/imageEditing` 配对占位，**标 TODO**，不挡结构。

## 4. 视觉边界（防二次翻车）

| 要                                                  | 不要                                  |
| --------------------------------------------------- | ------------------------------------- |
| 象牙白画廊底 + 编辑衬线标题（Fraunces）+ 无衬线正文 | 奶油脏底 + 全站 Caveat/楷体手写当标题 |
| 作品发色；状态色只在选区/滑杆/笔刷                  | 紫蓝渐变、霓虹、能力图标墙            |
| 窄文案列 + 大媒体                                   | 长文案抢戏、砍掉 CTA                  |
| chrome 退后                                         | 假 3D、娱乐全页动效                   |

手写字体若再试：仅品牌小点缀，**不得**替换章节主标题体系（见上次回归）。

## 5. 实现分期

| Phase  | 内容                                                                                       | 依赖                        |
| ------ | ------------------------------------------------------------------------------------------ | --------------------------- |
| **P0** | 登录一律 modal：共享 `AuthModal` / Clerk modal 入口；改 Homepage/Header/Sidebar 等用户入口 | Clerk appearance modal 变体 |
| **P1** | `HomepageBeforeAfter` 滑杆组件 + compare 段（去背或超分资产）                              | 一对 webp                   |
| **P2** | inpaint 笔刷/循环 demo 段                                                                  | 源+结果帧                   |
| **P3** | decompose 层浮出 + extract 抽出                                                            | 多层资产                    |
| **P4** | 收敛旧段节奏、可选产品全景、三语 copy、e2e/visual                                          | P0–P3 稳                    |

每次只交一个 Phase；禁止再「整页 moodboard 一次改完」。

## 6. 禁改范围

- 默认不动 `src/app/api/**` / `prisma/**` / `src/services/**` / credit 政策。
- 首页 demo **禁止**为演示调用真实 decompose/inpaint（成本与稳定性）。
- 画布近场工具条改造走 canvas 施工图，不与本页绑成一次 PR。

## 7. 验收清单

- [ ] 未登录主路径：首页 → modal → 登录 → Studio
- [ ] 无 hidden 能力出现在首页文案/CTA
- [ ] 每个 demo 段：证据可感知 + 一 CTA + reduced-motion 安全
- [ ] 三语 Homepage 键齐
- [ ] lint + 相关 unit/e2e；visual 有意更新时注明

## Source of Truth

- 灵感：`docs/references/ui-inspiration/haivis-landing-2026-07.md`
- 能力：`src/constants/canvas-image-edit-capabilities.ts`
- 画布兑现：`docs/references/pages/node-canvas.md` · `docs/plans/canvas-image-edit-convergence-2026-07.md`
- 场景流：`docs/scenes/ui-marketing.md`（本拍板后：**允许**为 modal 登录改 Clerk **前端呈现**，仍不改密钥与策略）

## P0 登录 modal

| 项       | 状态                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| 产品意向 | 仍希望 Haivis 式页内窗（见 §2）                                              |
| 代码     | **已回退**：用户入口恢复 `Link` → `/sign-in` `/sign-up` 整页 `AuthPageShell` |
| 原因     | 两轮实现均未达标；owner 要求退回                                             |

再次开工前需对照截图/录屏确认验收，再开 PR。

## Last Verified

- 2026-07-13 · owner 拍板：登录一律 modal；首页动态演示按 ready 能力。
- 2026-07-13 · P0 尝试后 **整段回退**，恢复 path 登录。
