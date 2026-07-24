# LoRA 装配台（方向 B · 冷瓷灰白）落地任务包 — Opus 4.8 执行

> 状态：**设计门禁 0–6 已过，可实施（2026-07-24）**。执行者 = **Opus 4.8**（owner 因额度充足指定 Opus 4.8 执行，**覆盖默认 Sonnet 执行**这一次）。
> 性质：把已确认的 B 装配台冷瓷高保真**翻译成真代码**——只改皮不改骨、拆 surface 不拆 engine、已有件重宿主。
> 相关 memory：`project-lora-visual-redesign`（决策账本）· `project-lora-search-redesign`（检索/组合功能线现状）。

## 0. 一句话任务

在 `src/app/lora.css` 的 `.domain-lora` 作用域落冷瓷灰白 token（按语义脊柱映射），把 `components/business/studio/lora/**` 的已有件重宿主进「装配台」三栏壳 + 换冷瓷皮，覆盖 Generate / 库 modal / 换底模 modal / 搭配提醒 / 助手 / 移动端 / **训练台**，过 checklist + 真机三验。

## 1. 先读（顺序即依赖）

1. **交付包**（本轮 CD 产出，事实源）：`docs/plans/lora-b-cd-handoff-2026-07/`
   - `lora-cold-porcelain-tokens.md` — **token 落地权威**（四级表面/投影/发丝线/文本 mono/两组语义色/石墨主动作/§8 语义脊柱映射）。
   - `README.md` — 逐屏结构 + 交互 + 状态矩阵 + 托管已有件表 + Train 全状态。
   - `screenshots/*.png` — 每屏渲染实物（像素级对照）。
   - `*.dc.html` — 高保真原型（结构/交互参照，**非可搬代码**）。
2. **设计 brief**：`docs/plans/lora-b-assembly-console-claude-design-brief-2026-07.md`（四轴/IA/三标志组件/§4.1 换底模/§4.2 关键状态/禁区）。
3. **业务契约（不可动）**：`docs/references/domains/lora.md`（§1–8 稳定事实）。
4. **当前代码现状**：`docs/references/pages/lora-workbench.md`（§4.4 底模两层分组 + 现有件锚点）· `src/components/business/studio/lora/**` · `src/constants/lora.ts` / `lora-base-models.ts` · `src/hooks/use-active-lora-stack.tsx`。
5. **工程纪律 memory**：`feedback-full-tsc-required`（全量 tsc ~4min 禁跳过）· `feedback-full-vitest-before-push` · `feedback-no-powershell-source-rewrite`（源码只 Edit/Write）· `feedback-work-on-main-no-branch` · `feedback-no-build-while-dev` · `project-dual-machine-visual-baselines` · `reference-dark-color-scheme` · `reference-tsc-next-routes-race`。

## 2. Lane / 禁改范围

- **只编辑**：`src/app/lora.css`（`.domain-lora` 作用域块）+ `src/components/business/studio/lora/**`。
- **不动脊柱**：`globals.css` 脊柱段 / `@theme inline` / `(main)/layout.tsx` / `AppSidebar` / `MobileTabBar` / `src/components/ui/**` 原语本体（换皮走作用域 token，不改原语）。
- **不新增全局 `@theme` key**；域值只进 `.domain-lora`。
- 要动脊柱/跨域 → 回 front-door（本设计线）仲裁，不私改。

## 3. ⚠ 核心技术要点：浅色岛 in 深色 app（最大风险，先解决）

`.design-sync/NOTES.md` 记：**app 硬编码 `<html class="dark">`**。整站是深色，而 LoRA 域现在是**冷瓷浅色**——这是一座**深色 app 里的浅色岛**。

- **先核实**：LoRA workbench 当前是否渲染在 `.dark` 之下（查 layout / html class）。
- `.domain-lora` 必须：① 定义 `--lora-*` → ② 把语义槽重映射到它们（覆盖 `.dark` 在本作用域内的值，机制 = `.node-card-paper` 已验证的容器级覆盖，`.domain-lora` 更深更具体故胜）→ ③ **显式 `color-scheme: light`**（否则原生滚动条/表单控件仍用深色，见 `reference-dark-color-scheme` 反向：深 app 里的浅岛要 `color-scheme:light`）。
- **这是三真机验里「域切换 color-scheme 反色」的正主**——从深色页进 LoRA、再退出，两侧原生控件都不能反色。

## 4. Token 层落地（S1 的核心，按 tokens.md §8）

`.domain-lora` 内：先声明 `--lora-*`（§1–6 全值），再映射语义槽：

```
.domain-lora {
  color-scheme: light;
  /* --lora-* 定义（page/well/panel/overlay/scrim/shadow-*/hairline*/ink*/muted/faint/ok*/warn*/primary*/ring）见 tokens.md */
  --background: var(--lora-page);
  --card: var(--lora-panel);  --popover: var(--lora-overlay);
  --muted: var(--lora-well);
  --foreground: var(--lora-ink);  --muted-foreground: var(--lora-muted);
  --border: var(--lora-hairline);  --input: var(--lora-hairline);
  --ring: oklch(0.565 0.04 250 / 0.6);
  --primary: var(--lora-primary);  --primary-foreground: #fff;
  /* 半径沿用全站 --radius；不覆盖 */
}
```

域内 shadcn 原语（`bg-card`/`border-border`/`text-muted-foreground`/`bg-primary`…）零改自动换皮。scoped-arbitrary 合法（`.domain-lora` 内可写字面值）；全局散落仍禁。

## 5. 切片计划（顺序即依赖；每片独立过闸门）

| 片                     | 内容                                                                                                                                                                                                                             | 关键验收                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1 Token 层**        | `.domain-lora` 全套 `--lora-*` + 语义槽映射 + `color-scheme:light`（§3/§4）                                                                                                                                                      | ≥3 处 `bg-card`/`border`/`text-muted-foreground` 实测读到冷瓷值；装配台整体变浅色冷瓷、非深炭；原生滚动条不反色                              |
| **S2 装配台主态**      | 三栏壳（`300px minmax(0,3fr) minmax(0,2fr)`，一屏锁高、各栏内滚）；重宿主：底模卡 / LoRA 栈（拖拽柄+封面聚焦+兼容点+权重条+启停+×）/ 触发词 / 参考图 / 参数 disclosure / 来源图带 / Prompt+补全 / 搭配提醒条 / 出图键 / 结果监视 | 对照 `装配台-不兼容主态.png`；60/40、浮起纸面、石墨出图键、mono 数值；**栈上限别写死 5**（待后端调查，读现有容量逻辑）                       |
| **S3 库 modal**        | `＋添加 LoRA` 唤起；Civitai/HF/我的 tab + 搜索 + 分类横排 + 底模横排 + 双源同卡 + 分页；**安全模式开关（tokens.md §7，非两案）**                                                                                                 | 对照 `库-modal-NSFW两案.png`（但落**开关**版）；重宿主 `LoraLibraryCard`/`ContentTypeChipRow`/`FamilyChipRow`；即筛即挂回装配栏              |
| **S4 换底模 modal**    | 底模卡唤起；`getCompatibleBases` 兼容约束 + 「仅显示兼容」开关 + 两层分组（云端 API / Runner·SDXL系/DiT系）+ 忠实/快 chip + 版本选择器 + 选中石墨勾 + Anima 只 Runner 静态标                                                     | 对照 `换底模-modal.png`；由 `lora-workbench.md §4.4` 分组 Select → modal                                                                     |
| **S5 搭配提醒 + 助手** | 搭配提醒条原位展开变更审阅卡（diff/触发词/保留/应用石墨·撤销）；助手 dock 380px 挤压/覆盖阈值 900、变更卡「加入搭配提醒」不直接出图                                                                                              | 重宿主 `LoraCollocationStatusBar` / `LoraAssistantDock`                                                                                      |
| **S6 来源配方 modal**  | 左大图+样例条 / 右结构化配方（全 mono，每 LoRA 读自己配方）/ 做同款进搭配提醒                                                                                                                                                    | 对照 `配方-modal.png`；重宿主 `LoraSourceRecipeModal`                                                                                        |
| **S7 移动端**          | 单列 + 底部常驻出图条；装配/库/换底模/助手 = 近全屏 sheet；软键盘遵 `isTouchPrimary`                                                                                                                                             | 对照 `移动端-主屏与装配sheet.png`；桌面 60/40 不外推                                                                                         |
| **S8 训练台**          | README §3 全状态（空态/组建[6 预设+上传 N/50·≥5+配置]/提交摘要/排队/训练中/完成仪式/失败）；重宿主 `useLoraTraining`/`PresetGrid`/`EmptyState`/`SubmitSummaryCard`/`CompletionCelebration`/`MobileTrainingSheet`                 | 对照 `训练台-组建.png`/`训练台-完成.png`；⚠ Train **未走完整设计门禁**（owner 2026-07-24 同意一起做），以 README §3 为 spec，出入向 owner 报 |

依赖：S1 先行（token 是所有片的地基）；S2 依赖 S1；S3/S4/S6 是 S2 唤起的浮层；S5/S7/S8 相对独立。

## 6. 每片闸门（一个不能省）

- `lint` + **全量 `tsc`**（~4min，后台跑 + 显式捕获 exit code，判绿 = `src/` 零错误，别被 `.next/.../routes.d.ts` 幻影错误骗，见 `reference-tsc-next-routes-race`）。
- **全量 `vitest`**（声称绿/提交/推送前必跑，~4.5min）。
- `e2e/visual.spec.ts` 视觉基线**按 OS 分套**（`-win32`/`-darwin` 各提交一套）。
- claude-in-chrome 真机实跑关键交互（owner dev 实例；owner dev 跑着时**不 build**、不另起 dev）。
- `i18n-check`：新增可见文案 en/ja/zh 三语同步（安全模式/装配栏/结果监视/换底模/忠实·快/训练台系 等）。

## 7. 三真机验（收尾必过）

1. **浅色误用观感**：冷瓷浅色是否被误当"没设计好/半成品"——靠浮起纸面纵深 + mono 数据感 + 石墨主动作立住专业感。
2. **NSFW 浅底**：安全模式开=降档（blur14+压暗）+ 琥珀角标 + 详情揭示；关=直显。浅底不裸露、不刺眼。
3. **域切换 color-scheme 反色**（§3 正主）：深色页 ↔ LoRA 浅岛来回，两侧原生控件不反色。

## 8. 不做 / 别踩

- 不重写已实现功能结构（多挂/配方/双源库/danbooru/runner/训练 都在，**重宿主 + 换皮**，别重造）。
- 不写死 LoRA 栈上限 5（读现有容量逻辑；README 已警）。
- NSFW 落**单一安全模式开关**（tokens.md §7），**不做两案并排**（README §2「两案」是旧文案）。
- 不动脊柱/不新增全局 `@theme` key/不外溢其它域。
- Anima DiT 不伪造 fal 通道。
- 源码只 Edit/Write（保 UTF-8 中文注释，PS 默认编码会毁）。

## 9. Commit 纪律

- 直接在 **main** 上改（不自动开分支）。
- **owner 点头才 commit**；push main = 生产部署，先过 `docs/checklists/release.md`。
- 建议按切片小 commit；owner dev 跑着时不并行 build。

## 变更记录

| 日期       | 变更                                        | 谁                 |
| ---------- | ------------------------------------------- | ------------------ |
| 2026-07-24 | 建包：CD 冷瓷交付 → Opus 4.8 落地切片 S1–S8 | Claude（4.8 前门） |
