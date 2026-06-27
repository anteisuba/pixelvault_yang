# LoRA 独立域 — 高保真稿集（实现对照用）

> 配套任务包 [`docs/plans/lora-domain-split-2026-06.md`](../../plans/lora-domain-split-2026-06.md)。已从低保真线框升级为 v1「暗房工坊」**高保真稿**（frontend-design 落地）。每张含：用途 + 关键规格 + 源码（可直接渲染对照）。
> 动效规范见任务包 §4.5。本文随设计推进及时更新。

## 0. 设计语言速记（实现必读）

- **暗房**：近黑微调中性面（**非纯黑**）。稿内硬编码色对应真 token：bg `#0f0f10`≈oklch(14.5%)、card `#141416`、inset `#1b1b1d`/`#202023`、hairline `rgba(255,255,255,.06~.12)`、text `#f3f3f1`/muted `#9b9b98`/faint `#6a6a67`。**实现一律用项目 oklch token，不照抄 hex。**
- **反相 CTA**：主行动=白底黑字 pill（`#f3f3f1`/`#161616`）。次级=深底描边 ghost。
- **ivory 提示词纸**：`#f3efe6`（=`--surface-composer`），深底上唯一亮面；记得显式 `color-scheme`。
- **颜色克制**：可商用绿/个人黄/需署名灰只做语义徽标；danbooru 五类色点（通蓝/画红/版紫/角绿/元橙）只做功能标记。
- **anti-slop 红线**：零紫蓝渐变/霓虹/玻璃/科技蓝。
- 圆角：panel 13–16px·card 11px·控件 9–10px·pill 999px。小字 10–11px + `letter-spacing` 做小标题。

---

## 1. 架构总览（SVG）

**用途**：拆 surface 不拆 engine + 统一资产层。

```svg
<svg width="100%" viewBox="0 0 680 410" role="img"><title>LoRA 独立域架构</title><desc>Image Studio 移除 LoRA，/studio/lora 独立域含生成训练库三区，二者共享同一执行引擎并写入统一 Generation 资产层，用 sourceSurface 区分入口。</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<g class="c-gray"><rect x="40" y="64" width="180" height="120" rx="12"/><text class="th" x="130" y="104" text-anchor="middle">Image Studio</text><text class="ts" x="130" y="126" text-anchor="middle">纯图片生成台</text><text class="ts" x="130" y="146" text-anchor="middle">移除全部 LoRA 入口</text></g>
<rect class="box" x="250" y="52" width="390" height="146" rx="12"/><text class="th" x="268" y="74">/studio/lora · LoRA 独立域</text><text class="ts" x="268" y="90">发现 · 训练 → 我的 → 生成</text>
<g class="c-purple"><rect x="266" y="98" width="96" height="38" rx="8"/><text class="th" x="314" y="114" text-anchor="middle">训练</text><text class="ts" x="314" y="128" text-anchor="middle">产出新 LoRA</text></g>
<g class="c-purple"><rect x="266" y="146" width="96" height="38" rx="8"/><text class="th" x="314" y="162" text-anchor="middle">公开库</text><text class="ts" x="314" y="176" text-anchor="middle">发现 · 收藏</text></g>
<g class="c-purple"><rect x="398" y="120" width="104" height="44" rx="8"/><text class="th" x="450" y="139" text-anchor="middle">我的 LoRA</text><text class="ts" x="450" y="154" text-anchor="middle">收藏 + 训练</text></g>
<g class="c-purple"><rect x="524" y="120" width="104" height="44" rx="8"/><text class="th" x="576" y="139" text-anchor="middle">生成</text><text class="ts" x="576" y="154" text-anchor="middle">还原 / 定制</text></g>
<line x1="362" y1="118" x2="396" y2="134" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/><line x1="362" y1="164" x2="396" y2="150" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/><line x1="502" y1="142" x2="522" y2="142" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/>
<line x1="130" y1="184" x2="158" y2="234" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/><line x1="576" y1="164" x2="482" y2="234" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/>
<text class="ts" x="112" y="216" text-anchor="middle">image-studio</text><text class="ts" x="556" y="212" text-anchor="middle">lora-workbench</text>
<g class="c-teal"><rect x="40" y="236" width="600" height="52" rx="12"/><text class="th" x="60" y="260">共享执行引擎（不复制）</text><text class="ts" x="60" y="278">submit-image → Worker → provider（hosted / runner）→ R2</text></g>
<line x1="340" y1="288" x2="340" y2="314" stroke="#888780" stroke-width="0.8" marker-end="url(#arrow)"/>
<g class="c-teal"><rect x="180" y="316" width="320" height="52" rx="12"/><text class="th" x="340" y="338" text-anchor="middle">Generation · 统一资产层</text><text class="ts" x="340" y="356" text-anchor="middle">outputType=IMAGE · sourceSurface 分流</text></g>
<rect class="c-gray" x="150" y="385" width="12" height="12" rx="3"/><text class="ts" x="168" y="395">普通生成台</text><rect class="c-purple" x="272" y="385" width="12" height="12" rx="3"/><text class="ts" x="290" y="395">LoRA 独立域</text><rect class="c-teal" x="408" y="385" width="12" height="12" rx="3"/><text class="ts" x="426" y="395">共享 / 结果层</text>
</svg>
```

---

## 2. 生成（高保真）

**用途**：生成模块旗舰页。
**规格**：全局图标栏 + 三模块 tab；当前 LoRA/底模脊柱条（底模=家族约束扁平选择器，标"忠实 runner"）；左 配方源图 + 还原/精修模式；右 结果 + **ivory 提示词纸**（身份块锁 + 可编辑）+ scale/seed + 反相出图。

```html
<div
  style="font-family:var(--font-sans); background:#0f0f10; border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; color:#f3f3f1; display:flex;"
>
  <div
    style="width:48px; background:#141416; border-right:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; align-items:center; padding:12px 0; gap:16px;"
  >
    <div
      style="width:24px; height:24px; border-radius:7px; background:#f3f3f1; color:#111; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600;"
    >
      安
    </div>
    <i class="ti ti-photo" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-movie" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-microphone-2" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-color-swatch" style="font-size:18px; color:#f3f3f1;"></i
    ><i class="ti ti-box-multiple" style="font-size:18px; color:#5d5d5a;"></i>
  </div>
  <div style="flex:1; min-width:0;">
    <div
      style="display:flex; align-items:center; padding:13px 18px; border-bottom:1px solid rgba(255,255,255,0.06);"
    >
      <span style="font-size:11px; letter-spacing:0.18em; color:#6a6a67;"
        >LORA · 暗房</span
      >
      <div style="flex:1; display:flex; justify-content:center;">
        <div
          style="display:inline-flex; gap:2px; background:#1b1b1d; padding:3px; border-radius:11px; border:1px solid rgba(255,255,255,0.05);"
        >
          <span
            style="font-size:13px; padding:6px 18px; border-radius:8px; background:rgba(255,255,255,0.10); color:#fff; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.10);"
            >生成</span
          ><span
            style="font-size:13px; padding:6px 18px; border-radius:8px; color:#86857f;"
            >库</span
          ><span
            style="font-size:13px; padding:6px 18px; border-radius:8px; color:#86857f;"
            >训练</span
          >
        </div>
      </div>
      <span
        style="width:26px; height:26px; border-radius:50%; background:#26262a; display:inline-block;"
      ></span>
    </div>
    <div style="padding:14px 18px;">
      <div
        style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 10px 8px 14px; background:#161618; border:1px solid rgba(255,255,255,0.07); border-radius:13px; margin-bottom:6px;"
      >
        <span style="font-size:10px; letter-spacing:0.1em; color:#6a6a67;"
          >当前 LoRA</span
        >
        <span
          style="display:inline-flex; align-items:center; gap:8px; font-size:12px; padding:5px 6px 5px 10px; background:#202023; border:1px solid rgba(255,255,255,0.09); border-radius:999px;"
          ><span
            style="width:16px; height:16px; border-radius:5px; background:#3a3340;"
          ></span
          >WAI-Character v2<span style="color:#8f8f8c;">×0.8</span
          ><i class="ti ti-x" style="font-size:13px; color:#6a6a67;"></i
        ></span>
        <span
          style="display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:5px 11px; border:1px dashed rgba(255,255,255,0.14); border-radius:999px; color:#9b9b98;"
          ><i class="ti ti-plus" style="font-size:13px;"></i>加 LoRA</span
        >
        <span style="flex:1;"></span>
        <span style="font-size:10px; color:#6a6a67;">底模</span>
        <span
          style="display:inline-flex; align-items:center; gap:8px; font-size:12px; padding:6px 11px; background:#202023; border:1px solid rgba(255,255,255,0.12); border-radius:9px;"
          ><i class="ti ti-cpu" style="font-size:14px; color:#9b9b98;"></i
          >WAI-Illustrious v16<span
            style="font-size:10px; padding:1px 7px; border-radius:999px; background:rgba(122,168,214,0.16); color:#9cc2e6;"
            >忠实 · runner</span
          ><i
            class="ti ti-chevron-down"
            style="font-size:14px; color:#6a6a67;"
          ></i
        ></span>
      </div>
      <div style="text-align:right; margin-bottom:14px;">
        <span style="font-size:10px; color:#5d5d5a;"
          ><i class="ti ti-filter" style="font-size:11px;"></i> 仅显示与 LoRA
          家族兼容的底模</span
        >
      </div>
      <div style="display:grid; grid-template-columns:5fr 7fr; gap:14px;">
        <div>
          <div
            style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;"
          >
            <span style="font-size:13px; font-weight:500;">配方源图</span
            ><span
              style="font-size:10px; padding:2px 8px; border-radius:999px; background:rgba(111,174,127,0.15); color:#9fd3aa;"
              >忠实还原可用</span
            >
          </div>
          <div
            style="display:grid; grid-template-columns:repeat(3,1fr); gap:7px; margin-bottom:16px;"
          >
            <div
              style="aspect-ratio:3/4; background:#2c2933; border-radius:9px; box-shadow:inset 0 0 0 1.5px #f3f3f1;"
            ></div>
            <div
              style="aspect-ratio:3/4; background:#2a2e30; border-radius:9px;"
            ></div>
            <div
              style="aspect-ratio:3/4; background:#322c2c; border-radius:9px;"
            ></div>
            <div
              style="aspect-ratio:3/4; background:#2a2c33; border-radius:9px;"
            ></div>
            <div
              style="aspect-ratio:3/4; background:#302c30; border-radius:9px;"
            ></div>
            <div
              style="aspect-ratio:3/4; background:#2b2f2c; border-radius:9px;"
            ></div>
          </div>
          <div
            style="font-size:10px; letter-spacing:0.08em; color:#6a6a67; margin-bottom:7px;"
          >
            还原模式
          </div>
          <div
            style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;"
          >
            <span
              style="font-size:12px; padding:5px 13px; border-radius:999px; background:#f3f3f1; color:#161616; font-weight:500;"
              >忠实还原</span
            ><span
              style="font-size:12px; padding:5px 13px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#cfcfca;"
              >半身</span
            ><span
              style="font-size:12px; padding:5px 13px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#cfcfca;"
              >全身</span
            >
          </div>
          <div
            style="font-size:10px; letter-spacing:0.08em; color:#6a6a67; margin-bottom:7px;"
          >
            精修模式
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <span
              style="font-size:12px; padding:5px 13px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#cfcfca;"
              >去漂移</span
            ><span
              style="font-size:12px; padding:5px 13px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#cfcfca;"
              >风格强化</span
            ><span
              style="font-size:12px; padding:5px 13px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#cfcfca;"
              >批量 A·B</span
            >
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:11px;">
          <div
            style="aspect-ratio:16/10; background:#1a1a1c; border:1px solid rgba(255,255,255,0.06); border-radius:12px; display:flex; align-items:center; justify-content:center;"
          >
            <i
              class="ti ti-sparkles"
              style="font-size:26px; color:#3a3a3c;"
            ></i>
          </div>
          <div
            style="background:#f3efe6; border-radius:12px; padding:11px 13px; color:#1c1c1a;"
          >
            <div
              style="display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;"
            >
              <span
                style="font-size:11px; padding:2px 9px; border-radius:999px; background:#e7e0cf; color:#5a4f33; display:inline-flex; align-items:center; gap:4px;"
                ><i class="ti ti-lock" style="font-size:11px;"></i>身份块</span
              ><span
                style="font-size:11px; padding:2px 9px; border-radius:999px; background:#e7e0cf; color:#5a533f;"
                >服装</span
              ><span
                style="font-size:11px; padding:2px 9px; border-radius:999px; background:#e7e0cf; color:#5a533f;"
                >构图</span
              >
            </div>
            <div style="font-size:12.5px; line-height:1.55; color:#3a382f;">
              1girl, &lt;perlica&gt;, masterpiece, best quality, standing,
              looking at viewer, detailed background, soft lighting
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:10px; color:#6a6a67;">SCALE</span>
            <div
              style="flex:1; height:4px; background:#28282b; border-radius:2px; position:relative;"
            >
              <div
                style="width:40%; height:4px; background:#cfcfca; border-radius:2px;"
              ></div>
              <div
                style="position:absolute; left:calc(40% - 7px); top:-5px; width:14px; height:14px; border-radius:50%; background:#f3f3f1;"
              ></div>
            </div>
            <span style="font-size:12px; font-weight:500; min-width:22px;"
              >0.8</span
            ><span
              style="font-size:11px; color:#9b9b98; display:inline-flex; align-items:center; gap:4px; padding-left:6px; border-left:1px solid rgba(255,255,255,0.1);"
              ><i class="ti ti-dice-5" style="font-size:14px;"></i>固定
              seed</span
            >
          </div>
          <button
            style="width:100%; font-size:14px; font-weight:600; padding:11px; border-radius:11px; background:#f3f3f1; color:#161616; border:none; display:flex; align-items:center; justify-content:center; gap:6px;"
          >
            <i class="ti ti-player-play-filled" style="font-size:15px;"></i>出图
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 3. 生成 · 提示词「自己搭配」魔导书（高保真）

**用途**：提示词构建的自己搭配 tab。推荐 tab 复用 recipe，故不单画。
**规格**：推荐/自己搭配切换；booru 自动补全（分类色点 + 热度 + 中/英）；功能分类（NSFW 锁）；标签格带缩略图；智能词条 stamp；已选托盘（权重 + 负向 + 按底模质量组）。

```html
<div
  style="font-family:var(--font-sans); background:#141416; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:16px; color:#f3f3f1;"
>
  <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
    <div
      style="display:inline-flex; gap:2px; background:#1b1b1d; padding:3px; border-radius:9px; border:1px solid rgba(255,255,255,0.06);"
    >
      <span
        style="font-size:12px; padding:5px 15px; border-radius:7px; color:#86857f;"
        >推荐</span
      ><span
        style="font-size:12px; padding:5px 15px; border-radius:7px; background:rgba(255,255,255,0.10); color:#fff;"
        >自己搭配</span
      >
    </div>
    <span style="font-size:11px; color:#5d5d5a;">魔导书 · 看图选词</span>
  </div>
  <div style="margin-bottom:14px;">
    <div
      style="display:flex; align-items:center; gap:9px; background:#1b1b1d; border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:9px 12px;"
    >
      <i class="ti ti-search" style="font-size:15px; color:#6a6a67;"></i
      ><span style="font-size:13px; color:#e9e9e6;">blue e</span
      ><span style="width:1px; height:14px; background:#9b9b98;"></span
      ><span style="flex:1;"></span
      ><span style="font-size:10px; color:#5d5d5a;"
        >规范英文入库 · 中文检索</span
      >
    </div>
    <div
      style="background:#1b1b1d; border:1px solid rgba(255,255,255,0.08); border-radius:10px; margin-top:5px; overflow:hidden;"
    >
      <div
        style="display:flex; align-items:center; gap:9px; padding:8px 12px; background:rgba(255,255,255,0.04);"
      >
        <span
          style="width:8px; height:8px; border-radius:50%; background:#5a8fd0;"
        ></span
        ><span style="font-size:12px;">蓝眼</span
        ><span style="font-size:11px; color:#86857f;">blue_eyes</span
        ><span style="flex:1;"></span
        ><span style="font-size:11px; color:#6a6a67;">2.1M</span>
      </div>
      <div style="display:flex; align-items:center; gap:9px; padding:8px 12px;">
        <span
          style="width:8px; height:8px; border-radius:50%; background:#5a8fd0;"
        ></span
        ><span style="font-size:12px;">蓝色连衣裙</span
        ><span style="font-size:11px; color:#86857f;">blue_dress</span
        ><span style="flex:1;"></span
        ><span style="font-size:11px; color:#6a6a67;">340K</span>
      </div>
    </div>
  </div>
  <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">
    <span
      style="font-size:11px; padding:4px 11px; border-radius:999px; background:#f3f3f1; color:#161616; font-weight:500;"
      >发型</span
    ><span
      style="font-size:11px; padding:4px 11px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.09); color:#cfcfca;"
      >质量</span
    ><span
      style="font-size:11px; padding:4px 11px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.09); color:#cfcfca;"
      >主体</span
    ><span
      style="font-size:11px; padding:4px 11px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.09); color:#cfcfca;"
      >角色</span
    ><span
      style="font-size:11px; padding:4px 11px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.09); color:#cfcfca;"
      >眼睛</span
    ><span
      style="font-size:11px; padding:4px 11px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.09); color:#cfcfca;"
      >表情</span
    ><span
      style="font-size:11px; padding:4px 11px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.09); color:#cfcfca;"
      >服装</span
    ><span
      style="font-size:11px; padding:4px 11px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.09); color:#cfcfca;"
      >构图</span
    ><span
      style="font-size:11px; padding:4px 11px; border-radius:999px; background:#1b1b1d; border:1px dashed rgba(255,255,255,0.14); color:#6a6a67;"
      ><i class="ti ti-lock" style="font-size:11px;"></i> NSFW</span
    >
  </div>
  <div
    style="display:grid; grid-template-columns:repeat(2,1fr); gap:7px; margin-bottom:16px;"
  >
    <span
      style="display:flex; align-items:center; gap:8px; font-size:12px; padding:6px 9px; background:#1b1b1d; border:1px solid rgba(255,255,255,0.07); border-radius:9px;"
      ><span
        style="width:28px; height:28px; border-radius:6px; background:#2f2b33;"
      ></span
      ><span
        style="width:7px; height:7px; border-radius:50%; background:#5a8fd0;"
      ></span
      >长发<span style="font-size:10px; color:#6a6a67;"
        >long_hair · 3.9M</span
      ></span
    ><span
      style="display:flex; align-items:center; gap:8px; font-size:12px; padding:6px 9px; background:#1b1b1d; border:1px solid rgba(255,255,255,0.07); border-radius:9px;"
      ><span
        style="width:28px; height:28px; border-radius:6px; background:#322c2c;"
      ></span
      ><span
        style="width:7px; height:7px; border-radius:50%; background:#5a8fd0;"
      ></span
      >双马尾<span style="font-size:10px; color:#6a6a67;"
        >twintails · 1.2M</span
      ></span
    >
  </div>
  <div
    style="font-size:10px; letter-spacing:0.08em; color:#6a6a67; margin-bottom:8px;"
  >
    智能词条 · 概念→一捆标签
  </div>
  <div style="display:flex; flex-wrap:wrap; gap:7px; margin-bottom:16px;">
    <span
      style="font-size:12px; padding:5px 12px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.08);"
      >雨夜</span
    ><span
      style="font-size:12px; padding:5px 12px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.08);"
      >黄金时刻</span
    ><span
      style="font-size:12px; padding:5px 12px; border-radius:999px; border:1px dashed rgba(255,255,255,0.14); color:#9b9b98;"
      ><i class="ti ti-plus" style="font-size:12px;"></i> 存为词条</span
    >
  </div>
  <div style="border-top:1px solid rgba(255,255,255,0.07); padding-top:13px;">
    <div
      style="display:flex; align-items:center; justify-content:space-between; margin-bottom:9px;"
    >
      <span style="font-size:10px; letter-spacing:0.08em; color:#6a6a67;"
        >已选</span
      ><span
        style="font-size:11px; padding:3px 9px; border-radius:999px; background:rgba(122,168,214,0.16); color:#9cc2e6;"
        >质量组：Illustrious（随底模）</span
      >
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:7px;">
      <span
        style="font-size:12px; padding:5px 10px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.08);"
        >long_hair ×1.0</span
      ><span
        style="font-size:12px; padding:5px 10px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.08);"
        >blue_eyes <span style="color:#9cc2e6;">×1.2</span></span
      ><span
        style="font-size:12px; padding:5px 10px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.08);"
        >masterpiece, best quality</span
      ><span
        style="font-size:12px; padding:5px 10px; border-radius:999px; background:rgba(217,168,95,0.14); color:#e3bd86;"
        >− bad_hands</span
      >
    </div>
  </div>
</div>
```

---

## 4. 库 · 公开 + 详情抽屉（高保真）

**用途**：库主视图 + 右滑详情抽屉。
**规格**：公开/我的切换 + 一行控件（搜索/家族/排序/分级默认安全）；封面优先密集网格（5–6 列填满）；详情=按需右滑抽屉（封面轮播 + 授权徽标 + 触发词复制 + 去生成 + 收藏）；配方/源图/试用词移到生成。受限态（无 Rent）见 §7。

```html
<div
  style="font-family:var(--font-sans); background:#0f0f10; border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; color:#f3f3f1; display:flex;"
>
  <div
    style="width:48px; background:#141416; border-right:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; align-items:center; padding:12px 0; gap:16px;"
  >
    <div
      style="width:24px; height:24px; border-radius:7px; background:#f3f3f1; color:#111; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600;"
    >
      安
    </div>
    <i class="ti ti-photo" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-movie" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-microphone-2" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-color-swatch" style="font-size:18px; color:#f3f3f1;"></i
    ><i class="ti ti-box-multiple" style="font-size:18px; color:#5d5d5a;"></i>
  </div>
  <div style="flex:1; min-width:0;">
    <div
      style="display:flex; align-items:center; padding:13px 18px; border-bottom:1px solid rgba(255,255,255,0.06);"
    >
      <span style="font-size:11px; letter-spacing:0.18em; color:#6a6a67;"
        >LORA · 暗房</span
      >
      <div style="flex:1; display:flex; justify-content:center;">
        <div
          style="display:inline-flex; gap:2px; background:#1b1b1d; padding:3px; border-radius:11px; border:1px solid rgba(255,255,255,0.05);"
        >
          <span
            style="font-size:13px; padding:6px 18px; border-radius:8px; color:#86857f;"
            >生成</span
          ><span
            style="font-size:13px; padding:6px 18px; border-radius:8px; background:rgba(255,255,255,0.10); color:#fff; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.10);"
            >库</span
          ><span
            style="font-size:13px; padding:6px 18px; border-radius:8px; color:#86857f;"
            >训练</span
          >
        </div>
      </div>
      <span
        style="width:26px; height:26px; border-radius:50%; background:#26262a; display:inline-block;"
      ></span>
    </div>
    <div style="position:relative;">
      <div style="padding:14px 18px;">
        <div
          style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px;"
        >
          <div
            style="display:inline-flex; gap:2px; background:#1b1b1d; padding:3px; border-radius:9px; border:1px solid rgba(255,255,255,0.06);"
          >
            <span
              style="font-size:12px; padding:4px 13px; border-radius:7px; background:rgba(255,255,255,0.10); color:#fff;"
              >公开</span
            ><span
              style="font-size:12px; padding:4px 13px; border-radius:7px; color:#86857f;"
              >我的</span
            >
          </div>
          <span style="flex:1;"></span
          ><span
            style="display:inline-flex; align-items:center; gap:7px; font-size:12px; padding:6px 12px; background:#161618; border:1px solid rgba(255,255,255,0.08); border-radius:9px; color:#86857f; min-width:120px;"
            ><i class="ti ti-search" style="font-size:14px;"></i>搜索
            LoRA…</span
          ><span
            style="display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:6px 11px; background:#161618; border:1px solid rgba(255,255,255,0.08); border-radius:9px; color:#cfcfca;"
            >家族<i
              class="ti ti-chevron-down"
              style="font-size:13px; color:#6a6a67;"
            ></i></span
          ><span
            style="display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:6px 11px; background:#161618; border:1px solid rgba(255,255,255,0.08); border-radius:9px; color:#cfcfca;"
            >推荐<i
              class="ti ti-chevron-down"
              style="font-size:13px; color:#6a6a67;"
            ></i></span
          ><span
            style="display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:6px 11px; background:#161618; border:1px solid rgba(255,255,255,0.08); border-radius:9px; color:#cfcfca;"
            ><i class="ti ti-shield-half" style="font-size:13px;"></i>安全</span
          >
        </div>
        <div
          style="display:grid; grid-template-columns:repeat(5,1fr); gap:10px;"
        >
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#2f2b33; border-radius:11px; box-shadow:inset 0 0 0 1.5px #f3f3f1;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >IL</span
              ><span style="position:absolute; top:6px; right:7px; color:#fff;"
                ><i class="ti ti-heart-filled" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              佩丽卡 · Perlica
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#322c2c; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >SDXL</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              Detail Tweaker
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#2a2e2f; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >Pony</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              Incase Style
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#2c2d33; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >SD1.5</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              墨心 MoXin
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#302b30; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >IL</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              明日方舟终末
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#2b2f2c; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >SDXL</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              Disney XL
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#2e2c2a; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >SD1.5</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              Anime Lineart
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#2c2b31; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >Flux</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              林翩翩
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#312d2b; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >Pony</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              Rossi 洛茜
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#292d30; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >SD1.5</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              Cute girl mix
            </div>
          </div>
          <div>
            <div
              style="position:relative; aspect-ratio:3/4; background:#302e2b; border-radius:11px;"
            >
              <span
                style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
                >IL</span
              ><span
                style="position:absolute; top:6px; right:7px; color:#cfcfca;"
                ><i class="ti ti-heart" style="font-size:15px;"></i
              ></span>
            </div>
            <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
              终末地少女
            </div>
          </div>
        </div>
      </div>
      <div
        style="position:absolute; inset:0; background:rgba(0,0,0,0.5);"
      ></div>
      <div
        style="position:absolute; top:0; right:0; bottom:0; width:300px; background:#161618; border-left:1px solid rgba(255,255,255,0.10); padding:16px; display:flex; flex-direction:column; gap:11px;"
      >
        <div
          style="display:flex; justify-content:space-between; align-items:center;"
        >
          <span style="font-size:12px; letter-spacing:0.1em; color:#6a6a67;"
            >详情</span
          ><i class="ti ti-x" style="font-size:17px; color:#86857f;"></i>
        </div>
        <div
          style="aspect-ratio:4/3; background:#2f2b33; border-radius:11px;"
        ></div>
        <div style="display:flex; gap:6px;">
          <div
            style="width:42px; height:42px; background:#2a2e30; border-radius:7px;"
          ></div>
          <div
            style="width:42px; height:42px; background:#322c2c; border-radius:7px;"
          ></div>
          <div
            style="width:42px; height:42px; background:#2c2d33; border-radius:7px;"
          ></div>
          <div
            style="width:42px; height:42px; background:#2b2f2c; border-radius:7px;"
          ></div>
        </div>
        <div>
          <div style="font-size:15px; font-weight:600;">佩丽卡 · Perlica</div>
          <div style="font-size:11px; color:#86857f; margin-top:2px;">
            Illustrious · obuyb404
            <i class="ti ti-external-link" style="font-size:11px;"></i>
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <span
            style="font-size:11px; padding:3px 9px; border-radius:999px; background:rgba(111,174,127,0.16); color:#9fd3aa;"
            >可商用</span
          ><span
            style="font-size:11px; padding:3px 9px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.08); color:#9b9b98; display:inline-flex; gap:4px;"
            >触发词 Perlica<i class="ti ti-copy" style="font-size:12px;"></i
          ></span>
        </div>
        <div style="display:flex; gap:8px; margin-top:2px;">
          <button
            style="flex:1; font-size:13px; font-weight:600; padding:9px; border-radius:10px; background:#f3f3f1; color:#161616; border:none; display:flex; align-items:center; justify-content:center; gap:5px;"
          >
            <i class="ti ti-sparkles" style="font-size:14px;"></i>去生成</button
          ><button
            style="font-size:13px; padding:9px 13px; border-radius:10px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#e9e9e6;"
          >
            <i class="ti ti-heart" style="font-size:15px;"></i>
          </button>
        </div>
        <div
          style="font-size:10px; color:#5d5d5a; border-top:1px solid rgba(255,255,255,0.06); padding-top:9px;"
        >
          配方 · 源图 · 试用词 → 去生成里展开
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 5. 库 · 我的（高保真，稀疏回填）

**用途**：我的收藏/自训，稀疏时不留黑屏。
**规格**：收藏/自训切换；已有卡（主体角标 + 去生成）；"推荐你收藏"封面条回填。完全空态=居中引导（去公开库收藏 / 训练第一个）+ 推荐条。

```html
<div
  style="font-family:var(--font-sans); background:#0f0f10; border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; color:#f3f3f1; display:flex;"
>
  <div
    style="width:48px; background:#141416; border-right:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; align-items:center; padding:12px 0; gap:16px;"
  >
    <div
      style="width:24px; height:24px; border-radius:7px; background:#f3f3f1; color:#111; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600;"
    >
      安
    </div>
    <i class="ti ti-photo" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-movie" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-microphone-2" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-color-swatch" style="font-size:18px; color:#f3f3f1;"></i
    ><i class="ti ti-box-multiple" style="font-size:18px; color:#5d5d5a;"></i>
  </div>
  <div style="flex:1; min-width:0;">
    <div
      style="display:flex; align-items:center; padding:13px 18px; border-bottom:1px solid rgba(255,255,255,0.06);"
    >
      <span style="font-size:11px; letter-spacing:0.18em; color:#6a6a67;"
        >LORA · 暗房</span
      >
      <div style="flex:1; display:flex; justify-content:center;">
        <div
          style="display:inline-flex; gap:2px; background:#1b1b1d; padding:3px; border-radius:11px; border:1px solid rgba(255,255,255,0.05);"
        >
          <span
            style="font-size:13px; padding:6px 18px; border-radius:8px; color:#86857f;"
            >生成</span
          ><span
            style="font-size:13px; padding:6px 18px; border-radius:8px; background:rgba(255,255,255,0.10); color:#fff; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.10);"
            >库</span
          ><span
            style="font-size:13px; padding:6px 18px; border-radius:8px; color:#86857f;"
            >训练</span
          >
        </div>
      </div>
      <span
        style="width:26px; height:26px; border-radius:50%; background:#26262a; display:inline-block;"
      ></span>
    </div>
    <div style="padding:14px 18px;">
      <div
        style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:16px;"
      >
        <div
          style="display:inline-flex; gap:2px; background:#1b1b1d; padding:3px; border-radius:9px; border:1px solid rgba(255,255,255,0.06);"
        >
          <span
            style="font-size:12px; padding:4px 13px; border-radius:7px; color:#86857f;"
            >公开</span
          ><span
            style="font-size:12px; padding:4px 13px; border-radius:7px; background:rgba(255,255,255,0.10); color:#fff;"
            >我的</span
          >
        </div>
        <div style="display:inline-flex; gap:14px; margin-left:6px;">
          <span
            style="font-size:13px; color:#f3f3f1; border-bottom:2px solid #f3f3f1; padding-bottom:3px;"
            >收藏 <span style="color:#86857f;">5</span></span
          ><span style="font-size:13px; color:#86857f; padding-bottom:3px;"
            >自训 <span style="color:#5d5d5a;">0</span></span
          >
        </div>
        <span style="flex:1;"></span
        ><span
          style="display:inline-flex; align-items:center; gap:7px; font-size:12px; padding:6px 12px; background:#161618; border:1px solid rgba(255,255,255,0.08); border-radius:9px; color:#86857f;"
          ><i class="ti ti-search" style="font-size:14px;"></i>搜索</span
        ><span
          style="display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:6px 11px; background:#161618; border:1px solid rgba(255,255,255,0.08); border-radius:9px; color:#cfcfca;"
          >最新<i
            class="ti ti-chevron-down"
            style="font-size:13px; color:#6a6a67;"
          ></i
        ></span>
      </div>
      <div
        style="display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:20px;"
      >
        <div>
          <div
            style="position:relative; aspect-ratio:3/4; background:#2f2b33; border-radius:11px;"
          >
            <span
              style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
              >主体</span
            >
          </div>
          <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
            佩丽卡
          </div>
          <button
            style="width:100%; margin-top:5px; font-size:11px; font-weight:500; padding:5px; border-radius:8px; background:#f3f3f1; color:#161616; border:none;"
          >
            去生成
          </button>
        </div>
        <div>
          <div
            style="position:relative; aspect-ratio:3/4; background:#312d2b; border-radius:11px;"
          >
            <span
              style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
              >主体</span
            >
          </div>
          <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
            Rossi 洛茜
          </div>
          <button
            style="width:100%; margin-top:5px; font-size:11px; font-weight:500; padding:5px; border-radius:8px; background:#f3f3f1; color:#161616; border:none;"
          >
            去生成
          </button>
        </div>
        <div>
          <div
            style="position:relative; aspect-ratio:3/4; background:#302b30; border-radius:11px;"
          >
            <span
              style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
              >主体</span
            >
          </div>
          <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
            明日方舟终末
          </div>
          <button
            style="width:100%; margin-top:5px; font-size:11px; font-weight:500; padding:5px; border-radius:8px; background:#f3f3f1; color:#161616; border:none;"
          >
            去生成
          </button>
        </div>
        <div>
          <div
            style="position:relative; aspect-ratio:3/4; background:#2a2e2f; border-radius:11px;"
          >
            <span
              style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
              >主体</span
            >
          </div>
          <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
            林翩翩
          </div>
          <button
            style="width:100%; margin-top:5px; font-size:11px; font-weight:500; padding:5px; border-radius:8px; background:#f3f3f1; color:#161616; border:none;"
          >
            去生成
          </button>
        </div>
        <div>
          <div
            style="position:relative; aspect-ratio:3/4; background:#2c2d33; border-radius:11px;"
          >
            <span
              style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
              >主体</span
            >
          </div>
          <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
            终末地少女
          </div>
          <button
            style="width:100%; margin-top:5px; font-size:11px; font-weight:500; padding:5px; border-radius:8px; background:#f3f3f1; color:#161616; border:none;"
          >
            去生成
          </button>
        </div>
      </div>
      <div
        style="display:flex; align-items:center; gap:10px; margin-bottom:12px;"
      >
        <span style="font-size:12px; color:#9b9b98;">推荐你收藏</span
        ><span
          style="flex:1; height:1px; background:rgba(255,255,255,0.07);"
        ></span
        ><span style="font-size:11px; color:#6a6a67;"
          >去公开库 <i class="ti ti-arrow-right" style="font-size:12px;"></i
        ></span>
      </div>
      <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:10px;">
        <div
          style="position:relative; aspect-ratio:3/4; background:#2b2f2c; border-radius:11px;"
        >
          <span style="position:absolute; top:6px; right:7px; color:#fff;"
            ><i class="ti ti-heart" style="font-size:15px;"></i
          ></span>
        </div>
        <div
          style="position:relative; aspect-ratio:3/4; background:#322c2c; border-radius:11px;"
        >
          <span style="position:absolute; top:6px; right:7px; color:#fff;"
            ><i class="ti ti-heart" style="font-size:15px;"></i
          ></span>
        </div>
        <div
          style="position:relative; aspect-ratio:3/4; background:#2c2b31; border-radius:11px;"
        >
          <span style="position:absolute; top:6px; right:7px; color:#fff;"
            ><i class="ti ti-heart" style="font-size:15px;"></i
          ></span>
        </div>
        <div
          style="position:relative; aspect-ratio:3/4; background:#2e2c2a; border-radius:11px;"
        >
          <span style="position:absolute; top:6px; right:7px; color:#fff;"
            ><i class="ti ti-heart" style="font-size:15px;"></i
          ></span>
        </div>
        <div
          style="position:relative; aspect-ratio:3/4; background:#292d30; border-radius:11px;"
        >
          <span style="position:absolute; top:6px; right:7px; color:#fff;"
            ><i class="ti ti-heart" style="font-size:15px;"></i
          ></span>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 6. 训练（高保真）

**用途**：训练向导套新壳。
**规格**：左表单（① 类型 ② 素材 dropzone + 缩略 ③ 参数 触发词/底模 FLUX 先行）；右（提交卡：预计 credits + 开始训练 + 完成进我的；训练任务进度列表）。

```html
<div
  style="font-family:var(--font-sans); background:#0f0f10; border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; color:#f3f3f1; display:flex;"
>
  <div
    style="width:48px; background:#141416; border-right:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; align-items:center; padding:12px 0; gap:16px;"
  >
    <div
      style="width:24px; height:24px; border-radius:7px; background:#f3f3f1; color:#111; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600;"
    >
      安
    </div>
    <i class="ti ti-photo" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-movie" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-microphone-2" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-color-swatch" style="font-size:18px; color:#5d5d5a;"></i
    ><i class="ti ti-box-multiple" style="font-size:18px; color:#5d5d5a;"></i>
  </div>
  <div style="flex:1; min-width:0;">
    <div
      style="display:flex; align-items:center; padding:13px 18px; border-bottom:1px solid rgba(255,255,255,0.06);"
    >
      <span style="font-size:11px; letter-spacing:0.18em; color:#6a6a67;"
        >LORA · 暗房</span
      >
      <div style="flex:1; display:flex; justify-content:center;">
        <div
          style="display:inline-flex; gap:2px; background:#1b1b1d; padding:3px; border-radius:11px; border:1px solid rgba(255,255,255,0.05);"
        >
          <span
            style="font-size:13px; padding:6px 18px; border-radius:8px; color:#86857f;"
            >生成</span
          ><span
            style="font-size:13px; padding:6px 18px; border-radius:8px; color:#86857f;"
            >库</span
          ><span
            style="font-size:13px; padding:6px 18px; border-radius:8px; background:rgba(255,255,255,0.10); color:#fff; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.10);"
            >训练</span
          >
        </div>
      </div>
      <span
        style="width:26px; height:26px; border-radius:50%; background:#26262a; display:inline-block;"
      ></span>
    </div>
    <div
      style="padding:16px 18px; display:grid; grid-template-columns:7fr 5fr; gap:14px;"
    >
      <div
        style="background:#141416; border:1px solid rgba(255,255,255,0.06); border-radius:13px; padding:16px; display:flex; flex-direction:column; gap:16px;"
      >
        <div>
          <div
            style="font-size:10px; letter-spacing:0.1em; color:#6a6a67; margin-bottom:8px;"
          >
            ① 类型
          </div>
          <div style="display:flex; gap:7px;">
            <span
              style="font-size:12px; padding:6px 15px; border-radius:999px; background:#f3f3f1; color:#161616; font-weight:500;"
              >角色</span
            ><span
              style="font-size:12px; padding:6px 15px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#cfcfca;"
              >风格</span
            ><span
              style="font-size:12px; padding:6px 15px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#cfcfca;"
              >物体</span
            >
          </div>
        </div>
        <div>
          <div
            style="font-size:10px; letter-spacing:0.1em; color:#6a6a67; margin-bottom:8px;"
          >
            ② 素材 · 5–30 张高质量图
          </div>
          <div
            style="border:1.5px dashed rgba(255,255,255,0.14); border-radius:11px; padding:20px; text-align:center; margin-bottom:9px;"
          >
            <i class="ti ti-upload" style="font-size:22px; color:#6a6a67;"></i>
            <div style="font-size:12px; color:#9b9b98; margin-top:5px;">
              拖入或点击上传 · 自动打标可编辑
            </div>
          </div>
          <div
            style="display:grid; grid-template-columns:repeat(6,1fr); gap:6px;"
          >
            <div
              style="aspect-ratio:1; background:#2f2b33; border-radius:6px;"
            ></div>
            <div
              style="aspect-ratio:1; background:#2a2e30; border-radius:6px;"
            ></div>
            <div
              style="aspect-ratio:1; background:#322c2c; border-radius:6px;"
            ></div>
            <div
              style="aspect-ratio:1; background:#2c2d33; border-radius:6px;"
            ></div>
            <div
              style="aspect-ratio:1; background:#202023; border:1px dashed rgba(255,255,255,0.14); border-radius:6px; display:flex; align-items:center; justify-content:center; color:#6a6a67;"
            >
              <i class="ti ti-plus" style="font-size:15px;"></i>
            </div>
            <div></div>
          </div>
        </div>
        <div>
          <div
            style="font-size:10px; letter-spacing:0.1em; color:#6a6a67; margin-bottom:8px;"
          >
            ③ 参数
          </div>
          <div style="display:flex; flex-direction:column; gap:9px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:12px; width:44px; color:#9b9b98;"
                >触发词</span
              ><span
                style="flex:1; font-size:12px; padding:8px 11px; background:#1b1b1d; border:1px solid rgba(255,255,255,0.09); border-radius:9px; color:#6a6a67;"
                >如 perlica</span
              >
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:12px; width:44px; color:#9b9b98;"
                >底模</span
              ><span
                style="flex:1; font-size:12px; padding:8px 11px; background:#1b1b1d; border:1px solid rgba(255,255,255,0.09); border-radius:9px; display:flex; justify-content:space-between; align-items:center; color:#e9e9e6;"
                >FLUX.1-dev<span style="font-size:10px; color:#6a6a67;"
                  >SDXL / IL 即将 ▾</span
                ></span
              >
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div
          style="background:#141416; border:1px solid rgba(255,255,255,0.06); border-radius:13px; padding:16px; display:flex; flex-direction:column; gap:12px;"
        >
          <div
            style="display:flex; justify-content:space-between; align-items:baseline;"
          >
            <span style="font-size:12px; color:#9b9b98;">预计消耗</span
            ><span style="font-size:16px; font-weight:600;"
              >~120
              <span style="font-size:11px; color:#86857f; font-weight:400;"
                >credits</span
              ></span
            >
          </div>
          <button
            style="width:100%; font-size:14px; font-weight:600; padding:11px; border-radius:11px; background:#f3f3f1; color:#161616; border:none; display:flex; align-items:center; justify-content:center; gap:6px;"
          >
            <i class="ti ti-player-play-filled" style="font-size:15px;"></i
            >开始训练
          </button>
          <div style="font-size:11px; color:#6a6a67; text-align:center;">
            完成后自动进「我的」
          </div>
        </div>
        <div
          style="background:#141416; border:1px solid rgba(255,255,255,0.06); border-radius:13px; padding:16px;"
        >
          <div
            style="font-size:12px; font-weight:500; margin-bottom:13px; color:#e9e9e6;"
          >
            训练任务
          </div>
          <div style="display:flex; flex-direction:column; gap:13px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div
                style="width:34px; height:34px; background:#2f2b33; border-radius:8px;"
              ></div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:12px; color:#e9e9e6;">my_char_v1</div>
                <div
                  style="height:5px; background:#26262a; border-radius:3px; margin-top:5px;"
                >
                  <div
                    style="width:42%; height:5px; background:#cfcfca; border-radius:3px;"
                  ></div>
                </div>
              </div>
              <span style="font-size:11px; color:#9b9b98;">42%</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <div
                style="width:34px; height:34px; background:#2a2e30; border-radius:8px;"
              ></div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:12px; color:#e9e9e6;">style_ink</div>
                <div style="font-size:11px; color:#6a6a67; margin-top:2px;">
                  排队中
                </div>
              </div>
              <i class="ti ti-clock" style="font-size:14px; color:#6a6a67;"></i>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <div
                style="width:34px; height:34px; background:#2b2f2c; border-radius:8px;"
              ></div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:12px; color:#e9e9e6;">rossi_lora</div>
                <div style="font-size:11px; color:#9fd3aa; margin-top:2px;">
                  完成
                </div>
              </div>
              <span
                style="font-size:11px; padding:4px 11px; border-radius:999px; background:#f3f3f1; color:#161616; font-weight:500;"
                >去我的</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 7. 组件板（高保真）

**用途**：原子组件对照表（实现逐个还原），含**库详情受限态**（无 Rent → 去生成置灰 + 个人使用 + 需署名 + 去 Civitai）。
**含**：模块 tab；反相/次级/禁用按钮；底模选择器展开态（兼容打勾 / 不符置灰）；模式·分类 chip；授权徽标 + danbooru 五类色点；库卡片；训练任务行；scale 滑块。

```html
<div
  style="font-family:var(--font-sans); background:#0f0f10; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:18px; color:#f3f3f1;"
>
  <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px;">
    <div>
      <div
        style="font-size:10px; letter-spacing:0.12em; color:#6a6a67; margin-bottom:9px;"
      >
        模块 TAB
      </div>
      <div
        style="display:inline-flex; gap:2px; background:#1b1b1d; padding:3px; border-radius:11px; border:1px solid rgba(255,255,255,0.05);"
      >
        <span
          style="font-size:13px; padding:6px 16px; border-radius:8px; background:rgba(255,255,255,0.10); color:#fff; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.10);"
          >生成</span
        ><span
          style="font-size:13px; padding:6px 16px; border-radius:8px; color:#86857f;"
          >库</span
        ><span
          style="font-size:13px; padding:6px 16px; border-radius:8px; color:#86857f;"
          >训练</span
        >
      </div>
    </div>
    <div>
      <div
        style="font-size:10px; letter-spacing:0.12em; color:#6a6a67; margin-bottom:9px;"
      >
        按钮层级
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button
          style="font-size:13px; font-weight:600; padding:8px 16px; border-radius:10px; background:#f3f3f1; color:#161616; border:none;"
        >
          出图</button
        ><button
          style="font-size:13px; padding:8px 14px; border-radius:10px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#e9e9e6;"
        >
          收藏</button
        ><button
          disabled
          style="font-size:13px; padding:8px 14px; border-radius:10px; background:#1b1b1d; border:none; color:#5d5d5a;"
        >
          去生成
        </button>
      </div>
    </div>
    <div style="grid-column:1 / -1;">
      <div
        style="font-size:10px; letter-spacing:0.12em; color:#6a6a67; margin-bottom:9px;"
      >
        底模选择器 · 被 LoRA 家族约束
      </div>
      <div
        style="display:flex; gap:14px; align-items:flex-start; flex-wrap:wrap;"
      >
        <span
          style="display:inline-flex; align-items:center; gap:8px; font-size:12px; padding:7px 12px; background:#202023; border:1px solid rgba(255,255,255,0.12); border-radius:9px;"
          ><i class="ti ti-cpu" style="font-size:14px; color:#9b9b98;"></i
          >WAI-Illustrious v16<span
            style="font-size:10px; padding:1px 7px; border-radius:999px; background:rgba(122,168,214,0.16); color:#9cc2e6;"
            >忠实 · runner</span
          ><i
            class="ti ti-chevron-down"
            style="font-size:14px; color:#6a6a67;"
          ></i
        ></span>
        <div
          style="width:266px; background:#161618; border:1px solid rgba(255,255,255,0.10); border-radius:11px; padding:6px;"
        >
          <div
            style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:7px; background:rgba(255,255,255,0.05);"
          >
            <i
              class="ti ti-circle-check-filled"
              style="font-size:14px; color:#9fd3aa;"
            ></i
            ><span style="font-size:12px;">WAI-Illustrious v16</span
            ><span style="flex:1;"></span
            ><span style="font-size:10px; color:#86857f;">忠实 runner</span>
          </div>
          <div
            style="display:flex; align-items:center; gap:8px; padding:7px 9px;"
          >
            <i class="ti ti-circle" style="font-size:14px; color:#5d5d5a;"></i
            ><span style="font-size:12px; color:#cfcfca;">WAI v16</span
            ><span style="flex:1;"></span
            ><span style="font-size:10px; color:#86857f;">快 hosted</span>
          </div>
          <div
            style="display:flex; align-items:center; gap:8px; padding:7px 9px; opacity:0.4;"
          >
            <i class="ti ti-ban" style="font-size:14px; color:#6a6a67;"></i
            ><span style="font-size:12px; color:#86857f;">FLUX.1-dev</span
            ><span style="flex:1;"></span
            ><span style="font-size:10px; color:#6a6a67;">家族不符</span>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div
        style="font-size:10px; letter-spacing:0.12em; color:#6a6a67; margin-bottom:9px;"
      >
        模式 / 分类 CHIP
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        <span
          style="font-size:12px; padding:5px 13px; border-radius:999px; background:#f3f3f1; color:#161616; font-weight:500;"
          >忠实还原</span
        ><span
          style="font-size:12px; padding:5px 13px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#cfcfca;"
          >半身</span
        ><span
          style="font-size:11px; padding:4px 11px; border-radius:999px; background:#1b1b1d; border:1px dashed rgba(255,255,255,0.14); color:#6a6a67;"
          ><i class="ti ti-lock" style="font-size:11px;"></i> NSFW</span
        >
      </div>
    </div>
    <div>
      <div
        style="font-size:10px; letter-spacing:0.12em; color:#6a6a67; margin-bottom:9px;"
      >
        授权徽标 + 分类色点
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
        <span
          style="font-size:11px; padding:3px 9px; border-radius:999px; background:rgba(111,174,127,0.16); color:#9fd3aa;"
          >可商用</span
        ><span
          style="font-size:11px; padding:3px 9px; border-radius:999px; background:rgba(217,168,95,0.14); color:#e3bd86;"
          >个人使用</span
        ><span
          style="font-size:11px; padding:3px 9px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.08); color:#9b9b98;"
          >需署名</span
        ><span
          style="display:inline-flex; gap:5px; align-items:center; margin-left:4px;"
          ><span
            style="width:8px;height:8px;border-radius:50%;background:#5a8fd0;"
          ></span
          ><span
            style="width:8px;height:8px;border-radius:50%;background:#cf6a6a;"
          ></span
          ><span
            style="width:8px;height:8px;border-radius:50%;background:#9a86d0;"
          ></span
          ><span
            style="width:8px;height:8px;border-radius:50%;background:#6fae7f;"
          ></span
          ><span
            style="width:8px;height:8px;border-radius:50%;background:#d9a85f;"
          ></span
          ><span style="font-size:10px; color:#6a6a67;"
            >通/画/版/角/元</span
          ></span
        >
      </div>
    </div>
    <div>
      <div
        style="font-size:10px; letter-spacing:0.12em; color:#6a6a67; margin-bottom:9px;"
      >
        库卡片
      </div>
      <div style="width:120px;">
        <div
          style="position:relative; aspect-ratio:3/4; background:#2f2b33; border-radius:11px;"
        >
          <span
            style="position:absolute; top:7px; left:7px; font-size:10px; padding:2px 7px; border-radius:999px; background:rgba(0,0,0,0.5); color:#e9e9e6;"
            >IL</span
          ><span style="position:absolute; top:6px; right:7px; color:#fff;"
            ><i class="ti ti-heart-filled" style="font-size:15px;"></i
          ></span>
        </div>
        <div style="font-size:12px; margin-top:6px; color:#e9e9e6;">
          佩丽卡 · Perlica
        </div>
      </div>
    </div>
    <div>
      <div
        style="font-size:10px; letter-spacing:0.12em; color:#6a6a67; margin-bottom:9px;"
      >
        任务行 + SCALE 滑块
      </div>
      <div
        style="display:flex; align-items:center; gap:10px; margin-bottom:13px;"
      >
        <div
          style="width:32px; height:32px; background:#2f2b33; border-radius:8px;"
        ></div>
        <div style="flex:1;">
          <div style="font-size:12px; color:#e9e9e6;">my_char_v1</div>
          <div
            style="height:5px; background:#26262a; border-radius:3px; margin-top:5px;"
          >
            <div
              style="width:42%; height:5px; background:#cfcfca; border-radius:3px;"
            ></div>
          </div>
        </div>
        <span style="font-size:11px; color:#9b9b98;">42%</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:10px; color:#6a6a67;">SCALE</span>
        <div
          style="flex:1; height:4px; background:#28282b; border-radius:2px; position:relative;"
        >
          <div
            style="width:40%; height:4px; background:#cfcfca; border-radius:2px;"
          ></div>
          <div
            style="position:absolute; left:calc(40% - 7px); top:-5px; width:14px; height:14px; border-radius:50%; background:#f3f3f1;"
          ></div>
        </div>
        <span style="font-size:12px; font-weight:500;">0.8</span>
      </div>
    </div>
    <div style="grid-column:1 / -1;">
      <div
        style="font-size:10px; letter-spacing:0.12em; color:#6a6a67; margin-bottom:9px;"
      >
        库详情 · 受限态（无 Rent，allowNoCredit=false）
      </div>
      <div
        style="border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px; display:flex; gap:12px; max-width:440px;"
      >
        <div
          style="position:relative; width:64px; aspect-ratio:3/4; background:#2f2b33; border-radius:9px;"
        >
          <span
            style="position:absolute; top:4px; left:4px; color:#fff; background:rgba(0,0,0,0.55); border-radius:5px; padding:1px 4px;"
            ><i class="ti ti-lock" style="font-size:11px;"></i
          ></span>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; gap:7px;">
          <div>
            <div style="font-size:13px; font-weight:600;">某画师风格 LoRA</div>
            <div style="font-size:11px; color:#86857f;">
              Pony · xxxx
              <i class="ti ti-external-link" style="font-size:11px;"></i>
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <span
              style="font-size:11px; padding:2px 8px; border-radius:999px; background:rgba(217,168,95,0.14); color:#e3bd86;"
              >个人使用</span
            ><span
              style="font-size:11px; padding:2px 8px; border-radius:999px; background:#202023; border:1px solid rgba(255,255,255,0.08); color:#9b9b98;"
              >需署名</span
            >
          </div>
          <div style="display:flex; gap:7px; align-items:center;">
            <button
              disabled
              style="font-size:12px; font-weight:500; padding:7px 14px; border-radius:9px; background:#1b1b1d; border:none; color:#5d5d5a;"
            >
              去生成</button
            ><button
              style="font-size:12px; padding:7px 12px; border-radius:9px; background:#202023; border:1px solid rgba(255,255,255,0.10); color:#e9e9e6;"
            >
              去 Civitai
            </button>
          </div>
          <div style="font-size:10px; color:#6a6a67;">
            创作者未授权第三方平台生成（缺 Rent）
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 8. 动效规范

见任务包 §4.5：抽屉桌面右滑浮层 320ms（网格不推开）+ scrim；移动端底部 sheet（Vaul）；模块切换壳不动 body crossfade 200ms + 骨架卡；卡片 hover 120ms；`--ease-standard` + `prefers-reduced-motion` 降级。

## 维护说明

- 新增/改稿 → 同步本文 + 任务包决策。
- 实现某页前对照本文 + 任务包章节，**换真 oklch token / 真组件**（ResponsiveOverlay / LoraAssetCard / 反相 pill），走 UI 确认阶梯（lint/build → 视觉回归 → token/a11y/响应式断言 → 交互验证）。
