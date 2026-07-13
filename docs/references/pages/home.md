# 首页施工图 — marketing home

> 状态：**方向拍板（2026-07-13）** · **P0 登录 modal 已落地** · 首页动态演示（P1+）仍待讨论。  
> 房间：营销首页 `/` · 参考：`docs/references/ui-inspiration/haivis-landing-2026-07.md`  
> 边界：作品优先 / 证据式能力 / 登录模态；**不**抄 Haivis 纯黑页、大衬线品牌皮、假能力 demo。

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

## P0 实现摘要（登录 modal）

| 入口                                          | 行为                                |
| --------------------------------------------- | ----------------------------------- |
| 首页 Hero / Header「开始创作」、Bottom CTA    | `AuthModalTrigger` sign-up modal    |
| 首页 Header「登录」、侧栏 / 移动轨 / Tab 登录 | sign-in modal                       |
| Cards / Assets 未登录 CTA                     | `AuthModalCtaButton`                |
| `/sign-in` `/sign-up` path                    | **保留**（OAuth、邮件、middleware） |

组件：`AuthModalTrigger` · `AuthModalCtaButton` · `clerkModalAppearance`。

## Last Verified

- 2026-07-13 · owner 拍板：登录一律 modal；首页动态演示按 ready 能力做 Haivis 式证据。
- 2026-07-13 · P0 代码落地：用户可见登录入口改 modal；path 页保留。
