# LoRA 独立域 — 线框集（实现对照用）

> 配套任务包 [`docs/plans/lora-domain-split-2026-06.md`](../../plans/lora-domain-split-2026-06.md)。每张线框含：**用途 + 关键规格（映射真 token/组件）+ 源码（可直接渲染看效果）**。
> ⚠ 线框里的 `--color-*` 是占位 token，仅供看结构；**实现用 v1「暗房工坊」真 token**（深色面 `--background` oklch 14.5% / `--card` 20.5% / `--secondary` 26.9%；反相 CTA；`--surface-composer` ivory 纸；圆角 panel `rounded-2xl`·card `rounded-xl`·input `rounded-lg`·pill `rounded-full`；小字 `text-2xs`/`text-3xs`+`tracking-nav`）。
> 动效规范见任务包 §4.5。本文随设计推进**及时更新**。

---

## 1. 架构总览

**用途**：一图说明"拆 surface 不拆 engine + 统一资产层"。
**规格**：Image Studio（移除 LoRA）+ /studio/lora（生成/训练/库[公开|我的]）两个 surface → 同一执行引擎 → Generation（`sourceSurface` 区分）落素材。

```svg
<svg width="100%" viewBox="0 0 680 410" role="img"><title>LoRA 独立域架构</title><desc>Image Studio 移除 LoRA，/studio/lora 独立域含生成训练库三区，二者共享同一执行引擎并写入统一 Generation 资产层，用 sourceSurface 区分入口。</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<g class="c-gray"><rect x="40" y="64" width="180" height="120" rx="12"/>
<text class="th" x="130" y="104" text-anchor="middle">Image Studio</text>
<text class="ts" x="130" y="126" text-anchor="middle">纯图片生成台</text>
<text class="ts" x="130" y="146" text-anchor="middle">移除全部 LoRA 入口</text></g>
<rect class="box" x="250" y="52" width="390" height="146" rx="12"/>
<text class="th" x="268" y="74">/studio/lora · LoRA 独立域</text>
<text class="ts" x="268" y="90">发现 · 训练 → 我的 → 生成</text>
<g class="c-purple"><rect x="266" y="98" width="96" height="38" rx="8"/>
<text class="th" x="314" y="114" text-anchor="middle">训练</text>
<text class="ts" x="314" y="128" text-anchor="middle">产出新 LoRA</text></g>
<g class="c-purple"><rect x="266" y="146" width="96" height="38" rx="8"/>
<text class="th" x="314" y="162" text-anchor="middle">公开库</text>
<text class="ts" x="314" y="176" text-anchor="middle">发现 · 收藏</text></g>
<g class="c-purple"><rect x="398" y="120" width="104" height="44" rx="8"/>
<text class="th" x="450" y="139" text-anchor="middle">我的 LoRA</text>
<text class="ts" x="450" y="154" text-anchor="middle">收藏 + 训练</text></g>
<g class="c-purple"><rect x="524" y="120" width="104" height="44" rx="8"/>
<text class="th" x="576" y="139" text-anchor="middle">生成</text>
<text class="ts" x="576" y="154" text-anchor="middle">还原 / 定制</text></g>
<line x1="362" y1="118" x2="396" y2="134" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/>
<line x1="362" y1="164" x2="396" y2="150" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/>
<line x1="502" y1="142" x2="522" y2="142" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/>
<line x1="130" y1="184" x2="158" y2="234" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/>
<line x1="576" y1="164" x2="482" y2="234" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/>
<text class="ts" x="112" y="216" text-anchor="middle">image-studio</text>
<text class="ts" x="556" y="212" text-anchor="middle">lora-workbench</text>
<g class="c-teal"><rect x="40" y="236" width="600" height="52" rx="12"/>
<text class="th" x="60" y="260">共享执行引擎（不复制）</text>
<text class="ts" x="60" y="278">submit-image → Worker → provider（hosted / runner）→ R2</text></g>
<line x1="340" y1="288" x2="340" y2="314" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/>
<g class="c-teal"><rect x="180" y="316" width="320" height="52" rx="12"/>
<text class="th" x="340" y="338" text-anchor="middle">Generation · 统一资产层</text>
<text class="ts" x="340" y="356" text-anchor="middle">outputType=IMAGE · sourceSurface 分流</text></g>
<rect class="c-gray" x="150" y="385" width="12" height="12" rx="3"/><text class="ts" x="168" y="395">普通生成台</text>
<rect class="c-purple" x="272" y="385" width="12" height="12" rx="3"/><text class="ts" x="290" y="395">LoRA 独立域</text>
<rect class="c-teal" x="408" y="385" width="12" height="12" rx="3"/><text class="ts" x="426" y="395">共享 / 结果层</text>
</svg>
```

---

## 2. 生成 — 壳子 + recipe-first

**用途**：生成模块外壳 + recipe-first 布局。
**规格**：顶 三模块 tab（生成/库/训练）；常驻「当前 LoRA / 底模」脊柱条（底模=被 LoRA 家族约束的扁平选择器，标"忠实 runner / 快 hosted"）；下两栏=左「配方源图 + 还原/精修模式 chip」右「结果 + 可编辑 prompt（身份块锁）+ scale/seed + 出图」。映射：脊柱条复用 active-lora-stack 概念；底模选择器=新 LoraBaseModel 目录（见任务包 §2.2/§3）。

```html
<div style="font-family: var(--font-sans);">
  <div style="text-align:center; margin-bottom:6px;">
    <span
      style="font-size:11px; color:var(--color-text-tertiary); letter-spacing:0.12em;"
      >/STUDIO/LORA · 暗房工作台</span
    >
  </div>
  <div style="display:flex; justify-content:center; margin-bottom:14px;">
    <div
      style="display:inline-flex; gap:4px; background:var(--color-background-secondary); padding:4px; border-radius:var(--border-radius-lg);"
    >
      <span
        style="font-size:13px; padding:6px 18px; border-radius:var(--border-radius-md); background:var(--color-background-primary); border:0.5px solid var(--color-border-secondary); font-weight:500;"
        >生成</span
      >
      <span
        style="font-size:13px; padding:6px 18px; border-radius:var(--border-radius-md); color:var(--color-text-secondary);"
        >库</span
      >
      <span
        style="font-size:13px; padding:6px 18px; border-radius:var(--border-radius-md); color:var(--color-text-secondary);"
        >训练</span
      >
    </div>
  </div>
  <div
    style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:9px 12px; background:var(--color-background-secondary); border-radius:var(--border-radius-lg); margin-bottom:14px;"
  >
    <span style="font-size:11px; color:var(--color-text-tertiary);"
      >当前 LoRA</span
    >
    <span
      style="font-size:12px; padding:4px 9px; background:var(--color-background-primary); border:0.5px solid var(--color-border-tertiary); border-radius:999px;"
      >WAI-Character v2 · ×0.8 ✕</span
    >
    <span
      style="font-size:12px; padding:4px 9px; border:0.5px dashed var(--color-border-secondary); border-radius:999px; color:var(--color-text-secondary);"
      >+ 加 LoRA</span
    >
    <span style="flex:1;"></span>
    <span style="font-size:11px; color:var(--color-text-tertiary);">底模</span>
    <span
      style="font-size:12px; padding:5px 11px; background:var(--color-background-primary); border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-md);"
      >WAI-Illustrious v16 · 忠实 (runner) ▾</span
    >
  </div>
  <div style="text-align:right; margin:-8px 2px 14px 0;">
    <span style="font-size:11px; color:var(--color-text-tertiary);"
      >仅显示与 LoRA 家族兼容的底模</span
    >
  </div>
  <div style="display:grid; grid-template-columns:5fr 7fr; gap:12px;">
    <div
      style="border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg); padding:12px;"
    >
      <div
        style="display:flex; justify-content:space-between; margin-bottom:10px;"
      >
        <span style="font-size:13px; font-weight:500;">配方源图</span
        ><span
          style="font-size:11px; color:var(--color-text-success); background:var(--color-background-success); padding:2px 8px; border-radius:var(--border-radius-md);"
          >忠实还原可用</span
        >
      </div>
      <div
        style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:14px;"
      >
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md); border:0.5px solid var(--color-border-info);"
        ></div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
      </div>
      <div
        style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
      >
        还原模式
      </div>
      <div style="display:flex; gap:6px; margin-bottom:12px;">
        <span
          style="font-size:12px; padding:4px 11px; border-radius:999px; background:var(--color-text-primary); color:var(--color-background-primary);"
          >忠实还原</span
        ><span
          style="font-size:12px; padding:4px 11px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
          >半身</span
        ><span
          style="font-size:12px; padding:4px 11px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
          >全身</span
        >
      </div>
      <div
        style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
      >
        精修模式
      </div>
      <div style="display:flex; gap:6px;">
        <span
          style="font-size:12px; padding:4px 11px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
          >去漂移</span
        ><span
          style="font-size:12px; padding:4px 11px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
          >风格强化</span
        ><span
          style="font-size:12px; padding:4px 11px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
          >批量 A·B</span
        >
      </div>
    </div>
    <div
      style="border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg); padding:12px; display:flex; flex-direction:column; gap:10px;"
    >
      <div
        style="aspect-ratio:4/3; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      ></div>
      <div
        style="background:var(--color-background-primary); border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-md); padding:9px 11px;"
      >
        <div style="display:flex; gap:5px; margin-bottom:7px;">
          <span
            style="font-size:11px; padding:2px 8px; border-radius:999px; background:var(--color-background-info); color:var(--color-text-info);"
            >身份块（锁）</span
          ><span
            style="font-size:11px; padding:2px 8px; border-radius:999px; background:var(--color-background-secondary); color:var(--color-text-secondary);"
            >服装</span
          ><span
            style="font-size:11px; padding:2px 8px; border-radius:999px; background:var(--color-background-secondary); color:var(--color-text-secondary);"
            >构图</span
          >
        </div>
        <div style="font-size:12px; color:var(--color-text-secondary);">
          1girl, &lt;trigger&gt;, masterpiece, standing, detailed background…
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:11px; color:var(--color-text-tertiary);"
          >scale</span
        ><input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value="0.8"
          style="flex:1;"
        /><span style="font-size:12px; font-weight:500;">0.8</span
        ><span style="font-size:11px; color:var(--color-text-secondary);"
          >固定 seed</span
        >
      </div>
      <button
        style="width:100%; font-size:13px; font-weight:500; padding:9px; border-radius:var(--border-radius-md); background:var(--color-text-primary); color:var(--color-background-primary); border:none;"
      >
        出图
      </button>
    </div>
  </div>
</div>
```

---

## 3. 生成 — 提示词「自己搭配」魔导书

**用途**：提示词构建的「自己搭配」tab（词库）。「推荐」tab 基本现成（recipe 驱动，复用 `LoraSourceRecipeStrip`），故不单画。
**规格**：推荐/自己搭配 tab（推荐默认）；booru 自动补全（热度排序 + 分类颜色点 + 别名，中文检索英文入库）；功能分类 chip（NSFW 锁）；标签格（颜色点 + 中/英 + 热度，留缩略图位）；智能词条 stamp（概念→一捆标签，本地存/导入后置）；已选托盘（权重 + 负向 + 按底模质量组）。引擎复用 `prompt-tag-search`/`prompt-tag-compiler`/`use-prompt-tag-stack`（见任务包 §6.1）。

```html
<div
  style="font-family:var(--font-sans); border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg); padding:12px;"
>
  <div
    style="display:flex; gap:4px; background:var(--color-background-secondary); padding:3px; border-radius:var(--border-radius-md); width:fit-content; margin-bottom:12px;"
  >
    <span
      style="font-size:12px; padding:5px 14px; border-radius:var(--border-radius-md); color:var(--color-text-secondary);"
      >推荐</span
    >
    <span
      style="font-size:12px; padding:5px 14px; border-radius:var(--border-radius-md); background:var(--color-background-primary); border:0.5px solid var(--color-border-secondary); font-weight:500;"
      >自己搭配</span
    >
  </div>
  <div style="margin-bottom:8px;">
    <div
      style="display:flex; align-items:center; gap:8px; border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-md); padding:8px 11px;"
    >
      🔍 <span style="font-size:13px;">blue e</span><span style="flex:1;"></span
      ><span style="font-size:11px; color:var(--color-text-tertiary);"
        >规范英文入库 · 中文检索</span
      >
    </div>
    <div
      style="border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-md); margin-top:4px;"
    >
      <div
        style="display:flex; gap:8px; padding:6px 11px; background:var(--color-background-secondary);"
      >
        <span
          style="width:8px;height:8px;border-radius:50%;background:#378ADD;"
        ></span
        ><span style="font-size:12px;">蓝眼</span
        ><span style="font-size:11px;color:var(--color-text-tertiary);"
          >blue_eyes</span
        ><span style="flex:1;"></span
        ><span style="font-size:11px;color:var(--color-text-tertiary);"
          >2.1M</span
        >
      </div>
      <div style="display:flex; gap:8px; padding:6px 11px;">
        <span
          style="width:8px;height:8px;border-radius:50%;background:#378ADD;"
        ></span
        ><span style="font-size:12px;">蓝色连衣裙</span
        ><span style="font-size:11px;color:var(--color-text-tertiary);"
          >blue_dress</span
        ><span style="flex:1;"></span
        ><span style="font-size:11px;color:var(--color-text-tertiary);"
          >340K</span
        >
      </div>
    </div>
  </div>
  <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; background:var(--color-text-primary); color:var(--color-background-primary);"
      >发型</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >质量</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >主体</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >角色</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >眼睛</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >表情</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >服装</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >姿势</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >构图</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >背景</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >光照</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
      >风格</span
    >
    <span
      style="font-size:11px; padding:3px 9px; border-radius:999px; border:0.5px dashed var(--color-border-secondary); color:var(--color-text-tertiary);"
      >🔒 NSFW</span
    >
  </div>
  <div
    style="display:grid; grid-template-columns:repeat(2,1fr); gap:6px; margin-bottom:14px;"
  >
    <span
      style="display:flex; align-items:center; gap:7px; font-size:12px; padding:6px 9px; border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-md);"
      ><span
        style="width:26px;height:26px;border-radius:4px;background:var(--color-background-secondary);"
      ></span
      ><span
        style="width:7px;height:7px;border-radius:50%;background:#378ADD;"
      ></span
      >长发<span style="font-size:10px;color:var(--color-text-tertiary);"
        >long_hair · 3.9M</span
      ></span
    >
    <span
      style="display:flex; align-items:center; gap:7px; font-size:12px; padding:6px 9px; border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-md);"
      ><span
        style="width:26px;height:26px;border-radius:4px;background:var(--color-background-secondary);"
      ></span
      ><span
        style="width:7px;height:7px;border-radius:50%;background:#378ADD;"
      ></span
      >双马尾<span style="font-size:10px;color:var(--color-text-tertiary);"
        >twintails · 1.2M</span
      ></span
    >
    <span
      style="display:flex; align-items:center; gap:7px; font-size:12px; padding:6px 9px; border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-md);"
      ><span
        style="width:26px;height:26px;border-radius:4px;background:var(--color-background-secondary);"
      ></span
      ><span
        style="width:7px;height:7px;border-radius:50%;background:#378ADD;"
      ></span
      >银发<span style="font-size:10px;color:var(--color-text-tertiary);"
        >white_hair · 980K</span
      ></span
    >
    <span
      style="display:flex; align-items:center; gap:7px; font-size:12px; padding:6px 9px; border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-md);"
      ><span
        style="width:26px;height:26px;border-radius:4px;background:var(--color-background-secondary);"
      ></span
      ><span
        style="width:7px;height:7px;border-radius:50%;background:#378ADD;"
      ></span
      >呆毛<span style="font-size:10px;color:var(--color-text-tertiary);"
        >ahoge · 720K</span
      ></span
    >
  </div>
  <div
    style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
  >
    智能词条（概念→一捆标签）
  </div>
  <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">
    <span
      style="font-size:12px; padding:4px 11px; border-radius:999px; background:var(--color-background-secondary);"
      >雨夜</span
    >
    <span
      style="font-size:12px; padding:4px 11px; border-radius:999px; background:var(--color-background-secondary);"
      >黄金时刻</span
    >
    <span
      style="font-size:12px; padding:4px 11px; border-radius:999px; background:var(--color-background-secondary);"
      >我的质量前缀</span
    >
    <span
      style="font-size:12px; padding:4px 11px; border-radius:999px; border:0.5px dashed var(--color-border-secondary); color:var(--color-text-secondary);"
      >+ 存为词条</span
    >
    <span
      style="font-size:12px; padding:4px 11px; border-radius:999px; border:0.5px dashed var(--color-border-secondary); color:var(--color-text-secondary);"
      >导入词包（后置）</span
    >
  </div>
  <div
    style="border-top:0.5px solid var(--color-border-tertiary); padding-top:10px;"
  >
    <div
      style="display:flex; justify-content:space-between; margin-bottom:7px;"
    >
      <span style="font-size:11px; color:var(--color-text-tertiary);">已选</span
      ><span
        style="font-size:11px; padding:2px 8px; border-radius:var(--border-radius-md); background:var(--color-background-info); color:var(--color-text-info);"
        >质量组：Illustrious（随底模）</span
      >
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:6px;">
      <span
        style="font-size:12px; padding:4px 9px; border-radius:999px; background:var(--color-background-secondary);"
        >long_hair ×1.0</span
      >
      <span
        style="font-size:12px; padding:4px 9px; border-radius:999px; background:var(--color-background-secondary);"
        >blue_eyes ×1.2</span
      >
      <span
        style="font-size:12px; padding:4px 9px; border-radius:999px; background:var(--color-background-secondary);"
        >masterpiece, best quality</span
      >
      <span
        style="font-size:12px; padding:4px 9px; border-radius:999px; background:var(--color-background-warning); color:var(--color-text-warning);"
        >− bad_hands 负向</span
      >
    </div>
  </div>
</div>
```

---

## 4. 库 — 封面网格 + 精简详情

**用途**：库主视图，治"空白多 + 信息复杂"。
**规格**：顶 `公开|我的` 切换 + 一行控件（搜索/家族/排序/分级默认安全）；封面优先密集网格（5–6 列填满宽，卡=封面+名字+角标家族+♥ 浮层）；详情=**按需抽屉**（不常驻），配方/源图/试用词移到生成。删旧提示句。映射：卡复用 `LoraAssetCard` 改造；详情走 ResponsiveOverlay。

```html
<div style="font-family:var(--font-sans);">
  <div
    style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px;"
  >
    <div
      style="display:inline-flex; gap:3px; background:var(--color-background-secondary); padding:3px; border-radius:var(--border-radius-md);"
    >
      <span
        style="font-size:12px; padding:4px 12px; border-radius:var(--border-radius-md); background:var(--color-background-primary); border:0.5px solid var(--color-border-secondary); font-weight:500;"
        >公开</span
      >
      <span
        style="font-size:12px; padding:4px 12px; border-radius:var(--border-radius-md); color:var(--color-text-secondary);"
        >我的</span
      >
    </div>
    <span style="flex:1;"></span>
    <span
      style="font-size:12px; padding:5px 10px; border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-md); color:var(--color-text-tertiary); min-width:130px;"
      >🔍 搜索 LoRA…</span
    >
    <span
      style="font-size:12px; padding:5px 10px; border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-md);"
      >家族 ▾</span
    >
    <span
      style="font-size:12px; padding:5px 10px; border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-md);"
      >推荐 ▾</span
    >
    <span
      style="font-size:12px; padding:5px 10px; border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-md);"
      >安全 ▾</span
    >
  </div>
  <div
    style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:18px;"
  >
    <div>
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span
          style="position:absolute; top:5px; left:5px; font-size:10px; padding:1px 6px; border-radius:999px; background:rgba(0,0,0,0.55); color:#fff;"
          >SDXL</span
        ><span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
      <div style="font-size:12px; margin-top:5px;">Detail Tweaker</div>
    </div>
    <div>
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span
          style="position:absolute; top:5px; left:5px; font-size:10px; padding:1px 6px; border-radius:999px; background:rgba(0,0,0,0.55); color:#fff;"
          >Pony</span
        ><span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
      <div style="font-size:12px; margin-top:5px;">Incase Style</div>
    </div>
    <div>
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span
          style="position:absolute; top:5px; left:5px; font-size:10px; padding:1px 6px; border-radius:999px; background:rgba(0,0,0,0.55); color:#fff;"
          >SD1.5</span
        ><span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
      <div style="font-size:12px; margin-top:5px;">墨心 MoXin</div>
    </div>
    <div>
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span
          style="position:absolute; top:5px; left:5px; font-size:10px; padding:1px 6px; border-radius:999px; background:rgba(0,0,0,0.55); color:#fff;"
          >IL</span
        ><span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
      <div style="font-size:12px; margin-top:5px;">佩丽卡</div>
    </div>
    <div>
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span
          style="position:absolute; top:5px; left:5px; font-size:10px; padding:1px 6px; border-radius:999px; background:rgba(0,0,0,0.55); color:#fff;"
          >Pony</span
        ><span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
      <div style="font-size:12px; margin-top:5px;">Rossi 洛茜</div>
    </div>
  </div>
  <div
    style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
  >
    点任意卡 → 详情抽屉（精简版，不再常驻占 1/3）
  </div>
  <div
    style="border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-lg); padding:12px; display:flex; gap:12px;"
  >
    <div
      style="width:78px; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
    ></div>
    <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
      <div>
        <div style="font-size:14px; font-weight:500;">Detail Tweaker XL</div>
        <div style="font-size:11px; color:var(--color-text-tertiary);">
          SDXL 1.0 · w4r10ck
        </div>
      </div>
      <div
        style="font-size:12px; padding:4px 9px; border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-md); width:fit-content;"
      >
        触发词 Detail ⧉
      </div>
      <div style="display:flex; gap:8px;">
        <button
          style="font-size:13px; font-weight:500; padding:7px 16px; border-radius:var(--border-radius-md); background:var(--color-text-primary); color:var(--color-background-primary); border:none;"
        >
          去生成</button
        ><button
          style="font-size:13px; padding:7px 14px; border-radius:var(--border-radius-md); border:0.5px solid var(--color-border-secondary); background:transparent;"
        >
          收藏
        </button>
      </div>
      <div
        style="font-size:11px; color:var(--color-text-tertiary); border-top:0.5px solid var(--color-border-tertiary); padding-top:7px;"
      >
        配方 · 源图 · 试用提示词 → 移到「生成」里展开，库只管"挑"
      </div>
    </div>
  </div>
</div>
```

---

## 5. 我的 — 空态 / 稀疏态

**用途**：我的 LoRA 在"完全空"和"只有几个"时不留黑屏。
**规格**：状态 A 完全空=居中上手引导（去公开库收藏 / 训练第一个）+ "猜你想收藏"封面条；状态 B 稀疏=已有放上面 + "推荐你收藏"封面条（带 ♥）填满。共用"推荐收藏"回填机制。

```html
<div style="font-family:var(--font-sans);">
  <div
    style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
  >
    状态 A · 完全空（首次：没收藏、没自训）
  </div>
  <div
    style="border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg); padding:20px 16px; margin-bottom:18px;"
  >
    <div style="text-align:center; margin-bottom:16px;">
      <div style="font-size:14px; font-weight:500;">还没有 LoRA</div>
      <div
        style="font-size:12px; color:var(--color-text-secondary); margin-top:2px;"
      >
        从公开库收藏一个，或训练你自己的
      </div>
      <div
        style="display:flex; gap:8px; justify-content:center; margin-top:12px;"
      >
        <button
          style="font-size:13px; font-weight:500; padding:7px 16px; border-radius:var(--border-radius-md); background:var(--color-text-primary); color:var(--color-background-primary); border:none;"
        >
          去公开库收藏</button
        ><button
          style="font-size:13px; padding:7px 14px; border-radius:var(--border-radius-md); border:0.5px solid var(--color-border-secondary); background:transparent;"
        >
          训练第一个
        </button>
      </div>
    </div>
    <div
      style="border-top:0.5px solid var(--color-border-tertiary); padding-top:12px;"
    >
      <div
        style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:8px;"
      >
        猜你想收藏
      </div>
      <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px;">
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
      </div>
    </div>
  </div>
  <div
    style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
  >
    状态 B · 只有几个（稀疏：屏幕下半别留黑）
  </div>
  <div
    style="border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg); padding:14px;"
  >
    <div
      style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:14px;"
    >
      <div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div style="font-size:11px; margin-top:4px;">佩丽卡</div>
      </div>
      <div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div style="font-size:11px; margin-top:4px;">Rossi 洛茜</div>
      </div>
      <div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div style="font-size:11px; margin-top:4px;">明日方舟</div>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
      <span style="font-size:12px; color:var(--color-text-secondary);"
        >推荐你收藏</span
      ><span
        style="flex:1; height:0.5px; background:var(--color-border-tertiary);"
      ></span
      ><span style="font-size:11px; color:var(--color-text-tertiary);"
        >去公开库 →</span
      >
    </div>
    <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px;">
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
      <div
        style="position:relative; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      >
        <span style="position:absolute; top:4px; right:5px; color:#fff;"
          >♥</span
        >
      </div>
    </div>
  </div>
</div>
```

---

## 6. 库详情 — 授权 gating（两态）

**用途**：详情抽屉按单 LoRA 授权 gate（见任务包 §4.4）。卡片保持干净，授权细节全在抽屉。
**规格**：完整授权（含 Rent+Image）=去生成可用 + 可商用徽标 + 创作者链接；受限（无 Rent / allowNoCredit=false）=去生成**禁用** + 个人使用 + 需署名 + 去 Civitai，仍可复制触发词/收藏，封面角标小锁。

```html
<div style="font-family:var(--font-sans);">
  <div
    style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
  >
    详情抽屉 · 完整授权（allowCommercialUse 含 Rent + Image）
  </div>
  <div
    style="border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-lg); padding:12px; display:flex; gap:12px; margin-bottom:16px;"
  >
    <div
      style="width:74px; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
    ></div>
    <div style="flex:1; display:flex; flex-direction:column; gap:7px;">
      <div>
        <div style="font-size:14px; font-weight:500;">佩丽卡 · Perlica</div>
        <div style="font-size:11px; color:var(--color-text-tertiary);">
          Illustrious · 创作者 obuyb404 ↗
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <span
          style="font-size:11px; padding:2px 8px; border-radius:var(--border-radius-md); background:var(--color-background-success); color:var(--color-text-success);"
          >可商用</span
        ><span
          style="font-size:11px; padding:2px 8px; border-radius:var(--border-radius-md); background:var(--color-background-secondary); color:var(--color-text-secondary);"
          >触发词 Perlica ⧉</span
        >
      </div>
      <div style="display:flex; gap:8px;">
        <button
          style="font-size:13px; font-weight:500; padding:7px 16px; border-radius:var(--border-radius-md); background:var(--color-text-primary); color:var(--color-background-primary); border:none;"
        >
          去生成</button
        ><button
          style="font-size:13px; padding:7px 14px; border-radius:var(--border-radius-md); border:0.5px solid var(--color-border-secondary); background:transparent;"
        >
          收藏
        </button>
      </div>
    </div>
  </div>
  <div
    style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
  >
    详情抽屉 · 受限（无 Rent，allowNoCredit=false）
  </div>
  <div
    style="border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-lg); padding:12px; display:flex; gap:12px;"
  >
    <div
      style="position:relative; width:74px; aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
    >
      <span
        style="position:absolute; top:4px; left:4px; color:#fff; background:rgba(0,0,0,0.5); border-radius:4px; padding:1px 4px;"
        >🔒</span
      >
    </div>
    <div style="flex:1; display:flex; flex-direction:column; gap:7px;">
      <div>
        <div style="font-size:14px; font-weight:500;">某画师风格 LoRA</div>
        <div style="font-size:11px; color:var(--color-text-tertiary);">
          Pony · 创作者 xxxx ↗
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <span
          style="font-size:11px; padding:2px 8px; border-radius:var(--border-radius-md); background:var(--color-background-warning); color:var(--color-text-warning);"
          >个人使用</span
        ><span
          style="font-size:11px; padding:2px 8px; border-radius:var(--border-radius-md); background:var(--color-background-secondary); color:var(--color-text-secondary);"
          >需署名</span
        ><span
          style="font-size:11px; padding:2px 8px; border-radius:var(--border-radius-md); background:var(--color-background-secondary); color:var(--color-text-secondary);"
          >触发词 ⧉</span
        >
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button
          disabled
          style="font-size:13px; font-weight:500; padding:7px 16px; border-radius:var(--border-radius-md); background:var(--color-background-secondary); color:var(--color-text-tertiary); border:none;"
        >
          去生成</button
        ><button
          style="font-size:13px; padding:7px 14px; border-radius:var(--border-radius-md); border:0.5px solid var(--color-border-secondary); background:transparent;"
        >
          去 Civitai ↗</button
        ><button
          style="font-size:13px; padding:7px 12px; border-radius:var(--border-radius-md); border:0.5px solid var(--color-border-secondary); background:transparent;"
        >
          ♥
        </button>
      </div>
      <div style="font-size:11px; color:var(--color-text-tertiary);">
        创作者未授权在第三方平台生成（缺 Rent）
      </div>
    </div>
  </div>
</div>
```

---

## 7. 库详情抽屉 — 浮层效果（含动效）

**用途**：说明抽屉怎么出现。
**规格**：Desktop=点卡 → 网格不动保持满宽，背后 scrim ~42%，详情面板从右滑入 ~360–400px / 320ms / ease-standard；关闭点 scrim/Esc/X 反向。Mobile=底部 sheet 上滑（Vaul / ResponsiveOverlay），可拖拽下滑关闭。详见任务包 §4.5。

```html
<div style="font-family:var(--font-sans);">
  <div
    style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
  >
    点卡片 → 详情从右滑入（桌面端浮层，网格不被推开）
  </div>
  <div
    style="position:relative; border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg); overflow:hidden; min-height:320px;"
  >
    <div
      style="padding:12px; display:grid; grid-template-columns:repeat(5,1fr); gap:8px;"
    >
      <div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div style="font-size:11px; margin-top:3px;">Detail Tweaker</div>
      </div>
      <div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div style="font-size:11px; margin-top:3px;">墨心 MoXin</div>
      </div>
      <div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div style="font-size:11px; margin-top:3px;">佩丽卡</div>
      </div>
      <div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div style="font-size:11px; margin-top:3px;">Rossi 洛茜</div>
      </div>
      <div>
        <div
          style="aspect-ratio:3/4; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
        ></div>
        <div style="font-size:11px; margin-top:3px;">明日方舟</div>
      </div>
    </div>
    <div style="position:absolute; inset:0; background:rgba(0,0,0,0.42);"></div>
    <div
      style="position:absolute; top:0; right:0; bottom:0; width:248px; background:var(--color-background-primary); border-left:0.5px solid var(--color-border-secondary); padding:14px; display:flex; flex-direction:column; gap:9px;"
    >
      <div style="display:flex; justify-content:space-between;">
        <span style="font-size:13px; font-weight:500;">详情</span
        ><span style="color:var(--color-text-tertiary);">✕</span>
      </div>
      <div
        style="aspect-ratio:4/3; background:var(--color-background-secondary); border-radius:var(--border-radius-md);"
      ></div>
      <div style="font-size:13px; font-weight:500;">佩丽卡 · Perlica</div>
      <div style="display:flex; gap:5px;">
        <span
          style="font-size:11px; padding:2px 8px; border-radius:var(--border-radius-md); background:var(--color-background-success); color:var(--color-text-success);"
          >可商用</span
        ><span
          style="font-size:11px; padding:2px 8px; border-radius:var(--border-radius-md); background:var(--color-background-secondary); color:var(--color-text-secondary);"
          >IL</span
        >
      </div>
      <button
        style="width:100%; font-size:13px; font-weight:500; padding:8px; border-radius:var(--border-radius-md); background:var(--color-text-primary); color:var(--color-background-primary); border:none;"
      >
        去生成
      </button>
    </div>
  </div>
  <div
    style="font-size:11px; color:var(--color-text-tertiary); margin-top:10px;"
  >
    移动端 → 同一详情改为底部 sheet 上滑（Vaul /
    ResponsiveOverlay），可拖拽下滑关闭。
  </div>
</div>
```

---

## 8. 训练

**用途**：训练模块（向导基本沿用，套新壳 + 视觉对齐 + 减少空白）。
**规格**：左表单（① 类型 角色/风格/物体 ② 素材 dropzone 5–30 张 + 自动打标 ③ 参数 触发词/底模 FLUX 先行）+ 右（提交卡：预计 credits + 开始训练 + "完成进我的"；训练任务列表：排队/训练中%/完成→去我的）。复用 `LoraTrainingForm` + `LoraTrainingHistorySidebar`。

```html
<div style="font-family:var(--font-sans);">
  <div style="display:flex; justify-content:center; margin-bottom:14px;">
    <div
      style="display:inline-flex; gap:4px; background:var(--color-background-secondary); padding:4px; border-radius:var(--border-radius-lg);"
    >
      <span
        style="font-size:13px; padding:6px 18px; border-radius:var(--border-radius-md); color:var(--color-text-secondary);"
        >生成</span
      >
      <span
        style="font-size:13px; padding:6px 18px; border-radius:var(--border-radius-md); color:var(--color-text-secondary);"
        >库</span
      >
      <span
        style="font-size:13px; padding:6px 18px; border-radius:var(--border-radius-md); background:var(--color-background-primary); border:0.5px solid var(--color-border-secondary); font-weight:500;"
        >训练</span
      >
    </div>
  </div>
  <div style="display:grid; grid-template-columns:7fr 5fr; gap:12px;">
    <div
      style="border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg); padding:14px; display:flex; flex-direction:column; gap:14px;"
    >
      <div>
        <div
          style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
        >
          ① 类型
        </div>
        <div style="display:flex; gap:6px;">
          <span
            style="font-size:12px; padding:5px 14px; border-radius:999px; background:var(--color-text-primary); color:var(--color-background-primary);"
            >角色</span
          ><span
            style="font-size:12px; padding:5px 14px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
            >风格</span
          ><span
            style="font-size:12px; padding:5px 14px; border-radius:999px; border:0.5px solid var(--color-border-secondary);"
            >物体</span
          >
        </div>
      </div>
      <div>
        <div
          style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
        >
          ② 素材（5–30 张高质量图）
        </div>
        <div
          style="border:1px dashed var(--color-border-secondary); border-radius:var(--border-radius-md); padding:18px; text-align:center; margin-bottom:8px;"
        >
          <div style="font-size:12px; color:var(--color-text-secondary);">
            ⬆ 拖入或点击上传 · 自动打标可编辑
          </div>
        </div>
        <div
          style="display:grid; grid-template-columns:repeat(6,1fr); gap:5px;"
        >
          <div
            style="aspect-ratio:1; background:var(--color-background-secondary); border-radius:4px;"
          ></div>
          <div
            style="aspect-ratio:1; background:var(--color-background-secondary); border-radius:4px;"
          ></div>
          <div
            style="aspect-ratio:1; background:var(--color-background-secondary); border-radius:4px;"
          ></div>
          <div
            style="aspect-ratio:1; background:var(--color-background-secondary); border-radius:4px; display:flex; align-items:center; justify-content:center; color:var(--color-text-tertiary);"
          >
            ＋
          </div>
          <div></div>
          <div></div>
        </div>
      </div>
      <div>
        <div
          style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:6px;"
        >
          ③ 参数
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span
              style="font-size:12px; width:48px; color:var(--color-text-secondary);"
              >触发词</span
            ><span
              style="flex:1; font-size:12px; padding:6px 10px; border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-md); color:var(--color-text-tertiary);"
              >如 perlica</span
            >
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span
              style="font-size:12px; width:48px; color:var(--color-text-secondary);"
              >底模</span
            ><span
              style="flex:1; font-size:12px; padding:6px 10px; border:0.5px solid var(--color-border-secondary); border-radius:var(--border-radius-md); display:flex; justify-content:space-between;"
              >FLUX.1-dev<span style="color:var(--color-text-tertiary);"
                >SDXL/IL 即将 ▾</span
              ></span
            >
          </div>
        </div>
      </div>
    </div>
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div
        style="border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg); padding:14px; display:flex; flex-direction:column; gap:10px;"
      >
        <div
          style="display:flex; justify-content:space-between; font-size:12px;"
        >
          <span style="color:var(--color-text-secondary);">预计消耗</span
          ><span style="font-weight:500;">~ 120 credits</span>
        </div>
        <button
          style="width:100%; font-size:13px; font-weight:500; padding:9px; border-radius:var(--border-radius-md); background:var(--color-text-primary); color:var(--color-background-primary); border:none;"
        >
          开始训练
        </button>
        <div
          style="font-size:11px; color:var(--color-text-tertiary); text-align:center;"
        >
          完成后自动进「我的」
        </div>
      </div>
      <div
        style="border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg); padding:14px;"
      >
        <div style="font-size:12px; font-weight:500; margin-bottom:10px;">
          训练任务
        </div>
        <div style="display:flex; flex-direction:column; gap:9px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div
              style="width:30px; height:30px; background:var(--color-background-secondary); border-radius:6px;"
            ></div>
            <div style="flex:1;">
              <div style="font-size:12px;">my_char_v1</div>
              <div
                style="height:4px; background:var(--color-background-secondary); border-radius:2px; margin-top:4px;"
              >
                <div
                  style="width:42%; height:4px; background:var(--color-text-secondary); border-radius:2px;"
                ></div>
              </div>
            </div>
            <span style="font-size:11px; color:var(--color-text-secondary);"
              >42%</span
            >
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div
              style="width:30px; height:30px; background:var(--color-background-secondary); border-radius:6px;"
            ></div>
            <div style="flex:1;">
              <div style="font-size:12px;">style_ink</div>
              <div style="font-size:11px; color:var(--color-text-tertiary);">
                排队中
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div
              style="width:30px; height:30px; background:var(--color-background-secondary); border-radius:6px;"
            ></div>
            <div style="flex:1;">
              <div style="font-size:12px;">rossi_lora</div>
              <div style="font-size:11px; color:var(--color-text-success);">
                完成
              </div>
            </div>
            <span
              style="font-size:11px; padding:3px 9px; border-radius:999px; background:var(--color-text-primary); color:var(--color-background-primary);"
              >去我的</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 维护说明

- 新增/修改线框 → 同步更新本文对应小节 + 任务包决策。
- 实现某页前：对照本文线框 + 任务包对应章节，换成真 token/组件，走 UI 确认阶梯（lint/build → 视觉回归 → token/a11y/响应式断言 → 交互验证）。
