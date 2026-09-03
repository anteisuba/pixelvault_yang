# PixelVault 品牌与设计治理 — brand-dna.md

> 状态：**现行规则（2026-07-19 owner 逐项确认；2026-09-03 owner 收紧：字体与 semantic 颜色收回脊柱）**。
> 本文只定义全局品牌脊柱、设计权力边界与品质底线。默认值（字体三槽、颜色脊柱、动效配方、移动端配方、完成定义）在 [`references/ui-defaults.md`](references/ui-defaults.md)，动 UI 先读它。

## 品牌脊柱

PixelVault 是以创作控制为核心的个人 AI 创作工作台：生成、永久归档、资产复用，并允许用户选择性公开作品。

全站共同身份只由以下内容构成：

- PixelVault 名称、Logo 与产品叙事。
- 应用壳、全局导航位置与导航行为。
- 文案语气、术语、图标体系（lucide 单库）和反馈语义。
- **字体三槽**（正文 Geist + Noto Sans CJK · 等宽 Geist Mono · 展示 Fraunces + Noto Serif CJK），全站同一套，域只能选槽不能引字体。
- **semantic 颜色一套**（background / muted / surface-sunken 三层浅底、foreground、primary 纯黑、border、ring、destructive、status、modality 三色），域不得覆盖。
- 可访问性、响应式、状态真实性与交互品质。

PixelVault 的一致性来自“这是同一个产品、拥有同一套可靠行为、同一套字体与颜色语义”；域之间的差异来自结构、比例、信息层级、交互关系和**一个域强调色**，不来自各自的字体和调色板。

## 设计权力分层

```text
全局 primitive
  原始尺度与可用值，不表达页面性格
        ↓
全局 semantic
  状态、文本、表面、边界、焦点等用途语义
        ↓
业务域 token / component variant
  Canvas、LoRA、Image、Video、Audio、Assets、Cards、Prompts、Gallery、Homepage 各自定义
        ↓
页面与关键组件 token
  服务具体工作流、信息层级和交互关系
```

| 层级             | 负责什么                                                                 | 不负责什么                     |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------ |
| Primitive        | 原始色阶、尺寸、间距、字体尺度、时长等可用值                             | 不决定任何页面风格             |
| Semantic         | foreground、surface、border、focus、success、warning、destructive 等用途 | **全站锁死**，域不覆盖         |
| Domain           | 一个业务域的 `--domain-accent` / `--domain-accent-surface`（各一个）、材质、几何、密度、布局、动效性格 | 不定义字体、不改 semantic、不外溢 |
| Page / Component | 页面结构、标志性组件、状态细节和局部覆盖                                 | 不反向绑架其他页面             |

域和页面 token 引用全局 primitive/semantic；可覆盖的只有强调色、材质、几何、密度、布局与动效性格，**字体槽与 semantic 颜色不在可覆盖范围**（2026-09-03）。域 token 写在域根，不写 `:root`。第二个业务域需要同一视觉模式时，先分别验证，再讨论是否提取。

## 共享组件契约

共同组件必须统一：

- 行为、API、状态模型和数据语义。
- 键盘操作、焦点管理、ARIA 和读屏反馈。
- 响应式切换、触屏策略、错误与加载处理。
- disabled、loading、error、selected 等状态优先级。

共同组件不统一：

- 域强调色、材质、圆角、阴影和密度。
- 业务域布局、信息层级和动效性格。
- card、pill、panel chrome 等外观形态。

共同组件**必须**沿用字体三槽与 semantic 颜色；这两项不是域可覆盖的皮肤（2026-09-03）。

共享组件可以提供中性 fallback，但必须允许业务域通过 variant、slot、className、data attribute 和 domain/component token 覆盖外观。原则是：**复用行为和可访问性，不强制复用皮肤。**

## 业务域视觉身份

以下业务域可以形成彼此明显不同的视觉语言：

- Canvas
- LoRA
- Studio Image
- Studio Video
- Studio Audio
- Assets
- Cards
- Prompts
- Gallery
- Homepage

同一业务域内部保持连贯；不同业务域不需要像同一个模板的换色版本。差异来自工作流、结构、比例、信息层级、交互关系和一个域强调色；**不来自换字体或换调色板**。arena 已闲置待删，不再是业务域。

## 全局不规定的内容

本文不规定：

- 域材质主题（米纸、象牙等只作域材质，贴在单件东西上，不铺整页）。
- 统一圆角阶梯、pill、卡片、面板 chrome。
- 装饰性动效语言（时长与曲线 token 是脊柱，用法配方在 `ui-defaults.md`）。
- “AI 产品必须避免/必须使用”的某种流行视觉。

本文**已规定**（2026-09-03 收紧，旧口径作废）：应用默认浅色，`.dark` 只给媒体观看面；字体三槽全站一套；semantic 颜色全站一套。

渐变、玻璃、强色、无彩、拟物、极简等都不是全局禁令或答案。是否使用由域级工作流和已确认的设计方向决定，并接受可读性、性能和可访问性验证。

## 全局品质底线

- 键盘可达、焦点可见、ARIA 完整；状态不能只靠颜色表达。
- 正常文本对比度至少 4.5:1，大字和 UI 边界至少 3:1。
- fine pointer 紧凑控件目标不小于 32px、常规控件不小于 36px；coarse pointer/touch 不小于 44px；任何目标不得低于 WCAG 2.2 AA 24px，除非满足 spacing/equivalent 例外并验证。
- 尊重 `prefers-reduced-motion`；动效必须服务状态、连续性或反馈。
- **交互与动效脊柱**见 [`references/interaction.md`](references/interaction.md)：跟手、场景分档惯性、时长 token、工程页仅 Motion、GSAP 仅营销首页。
- ResponsiveOverlay 行为、触屏软键盘策略与 focus return 不得破坏。
- 新用户可见文案 en/ja/zh 同步。
- loading、empty、error、disabled、success 等状态真实、清楚且可恢复。
- 不支持的能力不渲染，不用死按钮、假数据或静默失败伪装完成。
- 每条路由有移动端等级（完整 / 降级 / 不做），375px 主路径可完成；等级表见 `ui-defaults.md §6`。

## 域级设计确认流程

1. 明确业务域负责什么、不负责什么，以及最高频任务。
2. 明确页面对象、信息架构、关键状态和与其他域的边界。
3. 定义该域的设计性格、三个标志性视觉组件和明确禁区。
4. 提出三个结构明显不同的概念方向，不以换色充当差异。
5. owner 选择后只做一个关键界面切片。
6. 真机验证辨识度、易用性、响应式和交互态。
7. 确认后写入 `references/pages/<page>.md`，再进入完整实现。
8. 至少两个真实页面证明共享价值后，才反向提取视觉组件或 token。

当前代码、历史页面、`archive/`（已删 2026-08-07，见 git 历史）和 UI inspiration 只提供实现事实或参考证据，不能自动成为新设计方向。

## 工程气质

1. **长期建模优先**：属性归属性，结构正确优先于局部省事。
2. **失败大声暴露**：冲突与失败明确呈现，不静默成功。
3. **代码即事实源**：代码定义现状；文档记录代码读不出的契约、决策和验证。
4. **复用成熟行为**：改之前先查 exports 与调用方；复用不等于复制皮肤。
5. **确定性交给代码，判断交给模型**：路由、状态、重试和转换写成可测试代码。
6. **完成必须可核对**：报告改动、验证、手动步骤和未验证边界。

⚠ 上面六条是**做事的态度**。**架构层面的八条硬原则**（不留向后兼容 / 最简实现 / 先端到端跑通 / 模块化 / 优先成熟库 / 先翻已有依赖 / 决策往长了做 / 先看成熟产品怎么解）在 `CLAUDE.md` 的 **Engineering Principles**，与 Hard Rules 同级，冲突时以那份为准。

## 历史方向

旧 v1 双面模式、“工坊宅邸”、“工作手记”、暖纸炭墨、颜料纪律、手写字体地基和统一圆角/pill 均已废止为视觉规则。原始证据文档（`archive/design/` 四份）已于 2026-08-07 文档清理时删除，需要时从 git 历史取回。

它们不得作为新 UI 的生成或验收依据，也不要求对当前运行代码立即返工。

## Source of Truth

- 品牌与设计治理：本文。
- 技术实现事实与 token/组件边界：`references/frontend.md`。
- UI 执行流程：`scenes/ui-page.md`、`scenes/ui-marketing.md`。
- UI 默认值与完成定义：`references/ui-defaults.md`（日常任务入口 `templates/ui-request.md`）。
- UI 质量底线：`forbidden.md`、`checklists/ui.md`（8 项）。

## Last Verified

- 2026-09-03 · owner 拍板：字体三槽与 semantic 颜色收回品牌脊柱，域只留一个强调色；应用默认浅色；移动端等级进底线；arena 待删。默认值移交 `references/ui-defaults.md`。
- 2026-07-19 · owner 逐项确认：薄品牌脊柱、业务域视觉身份、共享行为不共享皮肤、旧视觉规则整体退役、逐域确认后实施。
