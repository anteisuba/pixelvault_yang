// Build the six PixelVault roadmap artboards (.dc.html) from one data tree.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))

const HUE = { image: 292, video: 255, audio: 10, text: 160 }
const FG = '#0a0a0a'
const MUTED = '#737373'
const LINE = '#d4d4d4'
const GREEN = '#16794c'
const AMBER = '#a04f00'
const RED = '#b3261e'

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const reply = (n, q, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 批注 ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`

const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const tint = (h) => `oklch(0.965 0.022 ${h})`
const tintBorder = (h) => `oklch(0.88 0.05 ${h})`
const tintText = (h) => `oklch(0.38 0.11 ${h})`

const dot = (color) =>
  `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${color};margin-right:8px;vertical-align:1px;flex:none"></span>`

const ptag = (p) =>
  `<span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;font-weight:500;line-height:1;padding:3px 6px;border-radius:999px;background:${FG};color:#fff;margin-right:8px;flex:none">${esc(p)}</span>`

function chip(c) {
  const t = typeof c === 'string' ? c : c.t
  const retired = typeof c !== 'string' && c.retired
  const base =
    "font-family:'Geist Mono',ui-monospace,monospace;font-size:11.5px;line-height:1.3;padding:3px 8px;border-radius:999px;white-space:nowrap;"
  const skin = retired
    ? `background:transparent;border:1px dashed #c4c4c4;color:${MUTED};text-decoration:line-through;`
    : `background:#fff;border:1px solid #e5e5e5;color:${FG};`
  return `<span style="${base}${skin}">${esc(t)}</span>`
}

function nodeHtml(n, hue) {
  const k = n.k
  if (k === 'root') {
    return `<div style="background:${accent(hue)};color:#fff;font-size:22px;font-weight:600;letter-spacing:.01em;padding:14px 22px;border-radius:12px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  }
  if (k === 'cat') {
    return `<div style="background:${tint(hue)};color:${tintText(hue)};border:1px solid ${tintBorder(hue)};font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  }
  if (k === 'sub') {
    return `<div style="background:#fff;border:1px solid #e5e5e5;color:${FG};font-size:13px;font-weight:500;line-height:1.45;padding:7px 12px;border-radius:8px;max-width:220px;flex:none">${esc(n.t)}</div>`
  }
  if (k === 'chips') {
    const w = n.w ?? 520
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;max-width:${w}px;padding:8px 10px;background:#f5f5f5;border-radius:8px;flex:none">${n.items.map(chip).join('')}</div>`
  }
  if (k === 'gap') {
    return `<div style="display:flex;align-items:baseline;background:#fff;border:1px dashed ${RED}99;color:${FG};font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 460}px;flex:none">${dot(RED)}<span>${esc(n.t)}</span></div>`
  }
  if (k === 'dir') {
    return `<div style="display:flex;align-items:baseline;background:#fff;border:1px solid ${FG};color:${FG};font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 460}px;flex:none">${ptag(n.p)}<span>${esc(n.t)}</span></div>`
  }
  // leaf (default). n.s === 'partial' → amber dot
  const d = n.s === 'partial' ? dot(AMBER) : ''
  return `<div style="display:flex;align-items:baseline;background:#f5f5f5;color:${FG};font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 460}px;flex:none">${d}<span>${esc(n.t)}</span></div>`
}

function branch(n, hue) {
  const kids = n.c && n.c.length
    ? `<div class="kids">${n.c.map((c) => branch(c, hue)).join('')}</div>`
    : ''
  return `<div class="br">${nodeHtml(n, hue)}${kids}</div>`
}

function tree(root, hue) {
  return `<div class="tree">${branch(root, hue)}</div>`
}

const legend = `<div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:${MUTED};flex:none">
  <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:26px;height:14px;border-radius:4px;background:#f5f5f5"></span>既有能力 · 已在 main</div>
  <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:26px;height:14px;border-radius:4px;background:#f5f5f5;text-align:center;line-height:14px">${dot(AMBER).replace('margin-right:8px;', '')}</span>部分落地 / 隐藏 / 待核</div>
  <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:26px;height:14px;border-radius:4px;border:1px dashed ${RED}99;text-align:center;line-height:12px">${dot(RED).replace('margin-right:8px;', '')}</span>缺口</div>
  <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:26px;height:14px;border-radius:4px;border:1px solid ${FG};text-align:center;line-height:12px"><span style="display:inline-block;width:12px;height:6px;border-radius:999px;background:${FG}"></span></span>建议方向 · P0 近期 / P1 中期 / P2 远期</div>
</div>`

function header(title, sub, { withLegend = true } = {}) {
  return `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:32px;margin-bottom:32px">
  <div style="max-width:720px">
    <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">PixelVault · 生成方向图 · 2026-09-14</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2;color:${FG}">${esc(title)}</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>
  ${withLegend ? legend : ''}
</div>`
}

const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    .tree { display: flex; align-items: center; }
    .kids { display: flex; flex-direction: column; gap: 10px; position: relative; padding-left: 32px; }
    .kids::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; border-left: 1.5px solid ${LINE}; }
    .br { display: flex; align-items: center; position: relative; }
    .br::before { content: ''; position: absolute; left: -33px; top: 50%; width: 33px; border-top: 1.5px solid ${LINE}; z-index: 1; }
    .br:first-child::after, .br:last-child::after { content: ''; position: absolute; left: -34px; width: 5px; background: #fff; z-index: 0; }
    .br:first-child::after { top: 0; height: 50%; }
    .br:last-child::after { top: 50%; height: 50%; }
    .br:only-child::after { top: 0; height: 100%; }
    .tree > .br::before, .tree > .br::after { display: none; }
`

function page(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Noto+Sans+SC:wght@400;500;600&amp;display=swap">
  <style>${STYLE}</style>
</helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">
${body}
</div>
</x-dc>
</body>
</html>
`
}

// ───────────────────────── 图片生成 ─────────────────────────
const IMAGE = {
  k: 'root', t: '图片生成',
  c: [
    { k: 'cat', t: '模型阵容 · 按厂商四类 + NAI + Runner', c: [
      { k: 'sub', t: 'GPT Image（OpenAI）', c: [
        { k: 'chips', items: ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2'] },
        { k: 'leaf', t: '官方：多图 edits + 蒙版 · 六档画质 · 透明底 · 部分预览 · Responses 多轮编辑工具（未接）· moderation:low（未接）' },
      ] },
      { k: 'sub', t: 'Gemini 图像（Google）', c: [
        { k: 'chips', items: ['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'] },
        { k: 'leaf', s: 'partial', t: '官方：多图 ≤14 且按角色 / 物体 / 风格分槽 · 对话式多轮编辑 · 搜索接地 · 分辩率按模型不同；仓库 14 一刀切、单轮、Lite 虚标 2K/4K、freeTier 错标' },
      ] },
      { k: 'sub', t: 'FLUX 2（Black Forest Labs · fal）', c: [
        { k: 'chips', items: ['FLUX 2 Pro', 'FLUX 2 Pro Edit', 'FLUX 2 Flash', 'FLUX Kontext Max', 'FLUX.2 [max] · 未接'] },
        { k: 'leaf', s: 'partial', t: '官方：≤8 图且输入 + 输出 ≤9MP · JSON prompt + @image 引用 · 不支持负面词；仓库虚标了负面 / guidance / steps' },
      ] },
      { k: 'sub', t: 'Seedream 5.0（ByteDance · fal / 火山 / BytePlus）', c: [
        { k: 'chips', items: ['Seedream 5.0 Pro', 'Seedream 5.0 Lite'] },
        { k: 'leaf', s: 'partial', t: '官方：Pro ≤10 图（仓库写 14）· 图层拆分（Pro）· 组图 sequential（Lite）· 联网（Lite）· 1K/1.5K 同价；仓库恒 2K、虚标负面' },
      ] },
      { k: 'sub', t: '关键词 / tag · 只留 NovelAI', c: [
        { k: 'chips', items: ['NovelAI V5 Full', 'NovelAI V5 Curated', 'NovelAI V4.5 Full', 'NovelAI V4.5 Curated', { t: 'Illustrious XL (Replicate) · 拟退役', retired: true }, { t: 'FLUX LoRA (fal) · 拟退役', retired: true }] },
        { k: 'leaf', s: 'partial', t: '已接：文生图 · 单图 img2img · V5 多角色 22 人；未接：inpaint · 质量标签 / UC 预设 · Text: · 采样器 / SMEA · Vibe · Precise Reference · Director Tools · 透明底' },
        { k: 'leaf', s: 'partial', t: 'PixAI：有官方 REST API（beta，t2i only，loras ≤5）→ 候选 A 类 adapter，先 BYOK，待拍板' },
      ] },
      { k: 'sub', t: 'Runner 自托管（RunPod ComfyUI）', c: [
        { k: 'chips', items: ['Anima DiT', 'Anima Pencil XL', 'Pony Diffusion V6', 'SDXL 1.0', 'Illustrious 配方克隆', 'Anima aesthetic / turbo · 候选', 'Krea 2 Turbo · 候选', 'Z-Image Turbo · 候选'] },
        { k: 'leaf', s: 'partial', t: 'Krea 2 版本闸已开（worker-comfyui 5.10 = ComfyUI 0.34）；Volume 剩 32.6G：Anima 新档 → Krea 2 →（扩容后）Z-Image' },
      ] },
      { k: 'sub', t: '其他 / 退役', c: [
        { k: 'chips', items: ['Recraft V4 Pro · 待归类', { t: 'Seedream 4.5', retired: true }, { t: 'Ideogram 3', retired: true }, { t: 'Anima Pencil XL (Replicate)', retired: true }] },
      ] },
    ] },
    { k: 'cat', t: '既有功能', c: [
      { k: 'sub', t: '生成', c: [
        { k: 'leaf', t: '文 → 图 · 图 → 图（顶部参考轨，提示词里 @ 引用具体参考图）' },
        { k: 'leaf', t: '多模型对照矩阵：模型集 × 张数一次出，CompareGrid 并排看' },
        { k: 'leaf', t: '规格三档（比例 / 尺寸 / 画质）· GPT 2.5 六档画质 + 背景 + 预览' },
        { k: 'leaf', t: '成本预览逐档价 · 草稿按账号在标签页内恢复' },
      ] },
      { k: 'sub', t: '编辑（共用编辑器）· 便签：太杂，需重整', c: [
        { k: 'leaf', t: '局部重绘 inpaint · 物体替换（区域标注 + 指令）· 元素提取 · 去背景' },
        { k: 'leaf', t: '超分：aura-sr 默认档 · Clarity Upscaler 2x 档' },
        { k: 'leaf', t: 'GPT Image 2.5 整图连续修改 + 历史回退' },
        { k: 'leaf', s: 'partial', t: '风格迁移 · 文字渲染：能力表已建，availability 仍 hidden' },
      ] },
      { k: 'sub', t: '衍生去向', c: [
        { k: 'leaf', t: '角色多视角定妆（generate-multiview）· 图 → 3D（5 模型）· 「把这张动起来」→ 视频节点' },
      ] },
      { k: 'sub', t: 'LoRA 域（北极星双核之一）', c: [
        { k: 'leaf', t: 'Generate / Library / Train 三工作模式 · Civitai + Hugging Face 双 tab 公共库 + 我的资源' },
        { k: 'leaf', t: '挂载栈：权重 / 触发词高亮 / 兼容底模自动选 / fal 与 Runner 通道分层' },
        { k: 'leaf', t: '「做同款」还原来源配方：checkpoint hash · 原尺寸 · 二采样精修（已真机跑通）' },
        { k: 'leaf', t: '助手读来源配方 · 写入 Runner 七项参数 · 连续调参可撤销' },
      ] },
    ] },
    { k: 'cat', t: '既有设计', c: [
      { k: 'leaf', t: '图片工作台：横向外壳，lg 参数栏 + 结果区；默认轻量，专业能力 chip 渐进披露，不拆双模式' },
      { k: 'leaf', t: '画布图片节点：六态卡 · 点卡扩大 = 模态 · 编辑 = 全屏编辑器 · 画布级粘贴上传' },
      { k: 'leaf', t: '助手 v2：五动词（看 / 查 / 问 / 改 / 请求生成）· 生成确认卡就地改参数 · 玻璃仪表皮肤' },
      { k: 'leaf', t: 'LoRA：Generate 并排监视台 60 / 40 · Library 聚焦浏览单列效果流 · 白色工作台脊柱' },
    ] },
    { k: 'cat', t: '不足', c: [
      { k: 'gap', t: '线上会失败：Seedream Pro 参考上限常量 14（官方 10）；Seedream / FLUX 虚标负面 / guidance / steps；Gemini Flash Image 错标 freeTier' },
      { k: 'gap', t: '四家未接的高价值能力：FLUX.2 [max] · Seedream 图层拆分 / 组图 · Gemini 多轮编辑 + 分槽 · OpenAI Responses 工具 + moderation:low' },
      { k: 'gap', t: 'NAI 出图低于官方默认：质量标签 / UC / 采样器 / SMEA 全硬编；inpaint · Vibe · Precise Ref · Director 未接' },
      { k: 'gap', t: '编辑能力 7 条只有 5 条 ready；编辑入口 / 能力表 / 画布编辑态三处不同步（便签 4）' },
      { k: 'gap', t: '生成后「去向」不全：变体 / 存 Recipe / 存 StyleCard / 入 Project 缺整段；参考图接不到素材库（G1）' },
      { k: 'gap', t: 'Runner：LoRA 白名单只有 1 条（库里几千个挂不上）· 执行超时 120s 偏紧 · 「standby 1」若是 Active worker ≈ $803/月 · 幻影 worker 疑为官方 idle scale-down' },
      { k: 'gap', t: 'LoRA 设置缺：strength_model / clip 分离 · clip skip 可覆盖 · 采样器选择器（后端已好）· 负面 embedding · hires fix UI · ADetailer' },
    ] },
    { k: 'cat', t: '建议方向', c: [
      { k: 'dir', p: 'P0', t: '修三处线上错（Seedream 上限 / 虚标声明 / freeTier）+ RunPod 配置核查（Active workers · max workers 降 0 · 超时 180–300s）' },
      { k: 'dir', p: 'P0', t: '编辑能力重整设计：按功能分区 → 单一编辑器契约 → 与画布编辑态同步（先设计门）' },
      { k: 'dir', p: 'P0', t: 'LoRA：白名单改运行时下载 + Anima 新档 → Krea 2 底模 + strength / clip skip / 采样器接线' },
      { k: 'dir', p: 'P1', t: '图片新接：FLUX.2 [max] → Seedream 图层拆分 → 组图；NAI 补 inpaint + 质量标签 / UC / Text: 控件' },
      { k: 'dir', p: 'P1', t: 'StyleCard 资产化 · 参考图直连素材库 · 生成后去向成链' },
      { k: 'dir', p: 'P2', t: 'PixAI BYOK 接入 · Z-Image Turbo（扩 Volume 后）· 解禁风格迁移 / 文字渲染' },
    ] },
  ],
}

// ───────────────────────── 视频生成 ─────────────────────────
const VIDEO = {
  k: 'root', t: '视频生成',
  c: [
    { k: 'cat', t: '模型阵容 · 六个家族', c: [
      { k: 'sub', t: 'Seedance（ByteDance · fal / 火山 / BytePlus）', c: [
        { k: 'chips', items: ['Seedance 2.5', 'Seedance 2.5 Reference', 'Seedance 2.0', 'Seedance 2.0 Fast', 'Seedance 2.0 Reference ×2'] },
        { k: 'leaf', s: 'partial', t: '官方：480p–1080p · 4–30s 或 -1 智能 · 编辑 / 延长任务 · 白模参考渲染 · 时间戳分镜；仓库 2.5 被封顶 720p，编辑 / 延长未接' },
      ] },
      { k: 'sub', t: 'Kling（fal）', c: [
        { k: 'chips', items: ['Kling O3 Pro', 'Kling V3 Pro'] },
        { k: 'leaf', s: 'partial', t: '官方：multi_prompt 镜头列表 + shot_type · 首尾帧 · elements + create-voice · video-to-video · motion-control；仓库全未接，且 V3 延长指向不存在端点' },
      ] },
      { k: 'sub', t: 'Wan 3.0（阿里 · fal）', c: [
        { k: 'chips', items: ['Wan 3.0', 'Wan 3.0 Reference', 'Wan 3.0 Prime · 未接'] },
        { k: 'leaf', t: '官方：首尾帧 · 图 10 / 视频 5 / 音频 5 · 2–30s · web_url / file_url 成片；仓库主体正确' },
      ] },
      { k: 'sub', t: 'HappyHorse（阿里 · fal）', c: [
        { k: 'chips', items: ['HappyHorse 1.1', 'reference-to-video · 未接', 'video-edit · 未接'] },
      ] },
      { k: 'sub', t: 'Gemini Omni（Google）', c: [
        { k: 'chips', items: ['Gemini Omni 1.1 Flash'] },
        { k: 'leaf', s: 'partial', t: '官方：五种 task（含 edit / extend）· 首尾帧 · 有状态多轮编辑 · 360p–4K；仓库只当文生 / 图生，分辩率 / 时长全关' },
      ] },
      { k: 'sub', t: 'MiniMax（国际 / 国内两站）', c: [
        { k: 'chips', items: ['MiniMax H3', 'MiniMax H3 Reference', 'H3 国内站 ×2', 'H3-Max · 未接'] },
        { k: 'leaf', s: 'partial', t: '官方：i2v 首尾帧 · 768P / 2K · 768P → 2K Regeneration · 输入视频另计费；仓库只发 2K、首尾帧未接' },
      ] },
      { k: 'sub', t: '增强 / 退役', c: [
        { k: 'chips', items: ['Topaz Proteus · 施工基准', 'SeedVR2 · 施工基准', { t: 'Veo 3.1', retired: true }, { t: 'LTX 2.3', retired: true }] },
      ] },
    ] },
    { k: 'cat', t: '既有功能', c: [
      { k: 'sub', t: '输入与参数', c: [
        { k: 'leaf', t: '文本 / 首帧 / 首尾帧 · 图 / 视频 / 音频参考槽沿连线收割 · 上限按模型 clamp' },
        { k: 'leaf', t: 'seed 支持矩阵 · 分辩率 × 时长矩阵 · 三通道比价' },
        { k: 'leaf', s: 'partial', t: '尾帧：keyframeSlots 全是 1，只有火山通道真发 last_frame；Kling / MiniMax / Omni 的尾帧被静默丢弃' },
      ] },
      { k: 'sub', t: '画布（长视频导演台）', c: [
        { k: 'leaf', t: '视频节点 = 纯视频卡 + 右侧紧凑编排器 · 模式 × 模型三层钻取选择器' },
        { k: 'leaf', t: '系列镜头 / 长视频任务：取消 · 重试 · 状态回填 · 失败原文随项目持久化' },
        { k: 'leaf', t: '节点详情「媒体优先」：大媒体左 / 编辑右 384px · ≤ 680px 单列' },
        { k: 'leaf', s: 'partial', t: '剪辑台：全屏模式 · V / A / M / T 四轨 · 一句话排片 · ffmpeg 渲染 — 契约已定，实现待核' },
      ] },
      { k: 'sub', t: 'AI 辅助', c: [
        { k: 'leaf', t: 'Seedance 提示词规划器（AI 增强）· 视频分析（抽三帧 → 视觉线；YouTube 直传 Gemini）' },
        { k: 'leaf', t: '剧本脑 ScriptDoc → 确定性投影成 角色 / 声音 / 镜头 节点' },
      ] },
    ] },
    { k: 'cat', t: '既有设计', c: [
      { k: 'leaf', t: '分工：Studio Video = 快轻短片；画布 = 长视频 / 系列镜头 / 角色一致性 / 声音绑定 / 参考视频 / 片段合并' },
      { k: 'leaf', t: '一致性来自 卡片 + 镜头规格 + 参考约束 的组合，不靠单一 prompt' },
      { k: 'leaf', t: '详情信息序：主体 → 编排 → 素材 → 关系 / 证据 → 动作；手机端画布走方向 A' },
    ] },
    { k: 'cat', t: '不足', c: [
      { k: 'gap', t: '线上会失败：Seedance 2.5 的 1080p 被 capabilities + Worker 双重封顶；Kling V3 videoExtension 指向 fal 上不存在的端点' },
      { k: 'gap', t: '分镜 / 转场无引导：Kling multi_prompt 未接；Seedance 时间戳分镜与「顺序关键帧」范式未进提示词层（便签 11）' },
      { k: 'gap', t: '白膜：Seedance 2.5 官方 R2V 就有「白模参考 / 渲染」三档，仓库参考槽能用但没有「白模」档与 prompt 范式（便签 11）' },
      { k: 'gap', t: '资产先行链断：角色参考 / 背景 / 剧本 / 分镜 / 声音 → 视频，缺卡片总线（角色槽手填）与台词 / 语气进视频的通道（便签 11、12）' },
      { k: 'gap', t: '包 6 审阅网格 / 包 7 剧本节点 卡设计门；助手剧本功能想提取成「大纲 → 连线出分镜」的思维导图式节点（便签 18）' },
      { k: 'gap', t: 'Enhance 域（Topaz / SeedVR2）只有施工基准零代码；无 video-to-video 通道（Kling v2v / Seedance 编辑 / Omni edit 都未接）' },
      { k: 'gap', t: 'Wan 3.0 三件未验 · VolcEngine 未绑 key（G3）· 身份卡存废（G5）· 真实付费冒烟从未跑' },
    ] },
    { k: 'cat', t: '建议方向', c: [
      { k: 'dir', p: 'P0', t: '修两处线上错（2.5 放开 1080p · Kling 延长端点）+ 首尾帧覆盖 Kling / MiniMax / Omni' },
      { k: 'dir', p: 'P0', t: '分镜：接 Kling multi_prompt + shot_type；Seedance 时间戳分镜 / 顺序关键帧进提示词规划器' },
      { k: 'dir', p: 'P0', t: '白模档：Seedance 2.5 白模参考三档 + 官方 prompt 范式（现有参考槽即可）' },
      { k: 'dir', p: 'P0', t: '卡片总线契约 → 包 7 剧本节点（大纲 → 连线分镜）→ 包 6 审阅网格' },
      { k: 'dir', p: 'P1', t: 'Kling elements + create-voice（跨镜角色 + 音色）· Seedance 编辑 / 延长 · MiniMax 768P 试镜 → 2K' },
      { k: 'dir', p: 'P1', t: '剪辑台一期 · Enhance 域落地 · 真实付费 smoke' },
      { k: 'dir', p: 'P2', t: 'Kling motion-control · Omni 有状态编辑 · 3D previz 流水线' },
    ] },
  ],
}

// ───────────────────────── 语音生成 ─────────────────────────
const AUDIO = {
  k: 'root', t: '语音生成',
  c: [
    { k: 'cat', t: '模型阵容 · 在售 + 候选', c: [
      { k: 'sub', t: '语音 TTS · 现役', c: [
        { k: 'chips', items: ['Fish Audio S2.1 Pro', 'Fish Audio S2.1 Pro Free'] },
        { k: 'leaf', t: '自由词表 [tag] + multi-speaker + 83 语 · $15 / M 字节；free 档 = 零成本 A/B 实验台；主档留任' },
      ] },
      { k: 'sub', t: '语音 TTS · 候选（便签 6 / 7）', c: [
        { k: 'chips', items: ['豆包语音合成 2.0 + 声音复刻 2.0（火山 BYOK）', 'Seed-Audio 1.0 · 邀测观望', 'ElevenLabs v3 Dialogue · 高价情绪档', 'Gemini TTS · 多说话人', 'MiniMax Speech 2.8', 'Hume Octave 2'] },
        { k: 'leaf', s: 'partial', t: '「字节 sudo」核实：字节没有叫 sudo / Seedo 的产品；大概率指 Seed-Audio 1.0（一条 prompt 出对白 + BGM + 音效，邀测中）；能马上接的是豆包语音合成 2.0（¥5 / 万字符，指令式情绪，中文方言最强）' },
      ] },
      { k: 'sub', t: '自托管候选（RunPod 单卡 24G）', c: [
        { k: 'chips', items: ['Qwen3-TTS 1.7B · Apache-2.0', 'Fun-CosyVoice3 0.5B · Apache-2.0', 'IndexTTS-2 · 情绪最强，商用需申请', 'Chatterbox · MIT', { t: 'Fish-Speech 权重 · 研究许可', retired: true }, { t: 'Higgs v3 · 非商用', retired: true }, { t: 'F5-TTS · CC-BY-NC', retired: true }] },
      ] },
      { k: 'sub', t: '音效 / 音乐', c: [
        { k: 'chips', items: ['ElevenLabs SFX v2', 'ElevenLabs Music v2', { t: 'ElevenLabs v3 (价高退役)', retired: true }] },
      ] },
    ] },
    { k: 'cat', t: '既有功能', c: [
      { k: 'sub', t: '配音间 /studio/audio', c: [
        { k: 'leaf', t: '最小闭环：选角 → 选中谁 → 打字 → 生成；班底 = voice / sfx / bgm 三种说话人' },
        { k: 'leaf', t: '输出 mp3 / wav / pcm / opus · 采样率 8k–48k · 比特率档 · 延迟三档' },
      ] },
      { k: 'sub', t: '音色卡 VoiceCard（音频域唯一声音资产）', c: [
        { k: 'leaf', t: '来源：市场（Fish 公开库）· 克隆（VoiceTrainer）· 临时参考音频 ≤ 25MB（不落卡）' },
        { k: 'leaf', s: 'partial', t: '可绑角色卡的设计已定，但 CharacterCard 与 VoiceCard 零关联（voiceCardId 只在 VoiceRoom.cast 的 Json 里）' },
      ] },
      { k: 'sub', t: '表达控制', c: [
        { k: 'leaf', t: '行内 [tag] 自由词表（Fish 透传）· temperature · 6 枚全局基调 chip' },
      ] },
      { k: 'sub', t: '画布', c: [
        { k: 'leaf', t: '音频节点（音色是节点属性）· 声音卡 240 × 84 五态 · 视频节点音频参考槽 ≤ 3' },
      ] },
    ] },
    { k: 'cat', t: '既有设计', c: [
      { k: 'leaf', t: '对话式配音间：灰底地台 + 白卡（--surface-workbench，四个工作台共用）' },
      { k: 'leaf', t: '手机端降级：对话流占满 · 输入条固定底部 · 情绪 / 音色参数进抽屉 · 44px 命中区' },
      { k: 'leaf', t: '产品定位：角色声音库是主线，Audio Studio 快速试音只是入口' },
    ] },
    { k: 'cat', t: '不足', c: [
      { k: 'gap', t: '播客 / 长音频分段拼接管线不存在；Fish 60s 超时墙在哪没量过' },
      { k: 'gap', t: '情绪四层栈只落 L2 行内 tag：表现力三档 / L3 情绪导演 / A/B 变体试听未做；豆包 / OpenAI / Gemini 不吃标记，要 per-provider 编译成指令句' },
      { k: 'gap', t: '多人对话原生支持只有 ElevenLabs v3 Dialogue / Gemini / Fish / Seed-Audio；其余逐句拼接 = 编排 service（未建）' },
      { k: 'gap', t: '音色经营缺三件：designed 文字造音色 · 情绪范围元数据（IndexTTS-2 的 8 维向量可自动打标）· 克隆引导' },
      { k: 'gap', t: '助手 v2 不覆盖音频域；无平台 key（Fish / ElevenLabs 全 BYOK）' },
    ] },
    { k: 'cat', t: '建议方向', c: [
      { k: 'dir', p: 'P0', t: '长音频 / 播客管线：拼接 spike → 编排 service → 两道门 UI' },
      { k: 'dir', p: 'P0', t: '新接豆包语音合成 2.0（火山 BYOK）+ per-provider 情绪编译层（标记 ↔ 指令句）' },
      { k: 'dir', p: 'P1', t: '表现力三档 + 情绪导演 + A/B 试听（Fish free 档当实验台）· 助手覆盖音频域' },
      { k: 'dir', p: 'P1', t: '自托管 Qwen3-TTS + CosyVoice3 上 RunPod；情绪要更强再上 IndexTTS-2（先拿授权）' },
      { k: 'dir', p: 'P2', t: 'Seed-Audio 1.0 转正后接（对白 + BGM + 音效一体）· designed 造音色 · video-to-sound' },
    ] },
  ],
}

// ───────────────────────── 文字生成 ─────────────────────────
const TEXT = {
  k: 'root', t: '文字生成',
  c: [
    { k: 'cat', t: '模型 · 五家（三路由合一，Qwen 退役）', c: [
      { k: 'sub', t: 'GPT（OpenAI）', c: [
        { k: 'chips', items: ['GPT-6 Astra', 'GPT-5.6 Sol', 'GPT-5.6 Terra', 'GPT-5.6 Luna', 'gpt-5-search-api'] },
        { k: 'leaf', t: '独有：file_search 向量库 · tool_search · Conversations API 永久会话 · web_search 域名白黑各 100 + sources' },
      ] },
      { k: 'sub', t: 'Gemini（Google）', c: [
        { k: 'chips', items: ['Gemini 3.8 Flash', 'Gemini 3.5 Flash Lite'] },
        { k: 'leaf', t: '独有：Google 搜索接地（按 query 计费）· URL context ≤20 URL / 34MB 含 PDF · 视频 / 音频原生输入 · thinking 摘要' },
      ] },
      { k: 'sub', t: 'Grok（xAI）', c: [
        { k: 'chips', items: ['Grok 4.6'] },
        { k: 'leaf', t: '独有：X Search（社媒一手源）· Collections · inline markdown 引用；推理关不掉' },
      ] },
      { k: 'sub', t: 'DeepSeek', c: [
        { k: 'chips', items: ['DeepSeek V4 Pro', 'deepseek-flash（vision）', { t: 'deepseek-v4-flash-vision-exp · 官方已标旧别名', retired: true }] },
        { k: 'leaf', t: '独有：峰谷两价（谷时半价）· cache 命中价低两量级 · 384K 输出；无官方联网' },
      ] },
      { k: 'sub', t: 'Claude（Anthropic）', c: [
        { k: 'chips', items: ['Claude Fable 5.1'] },
        { k: 'leaf', t: '独有：memory 工具（客户端落盘，可映射 Prisma）· context editing + compaction · web_search 结果先代码过滤 · cited_text ≤150 字不计 token · strict tool use' },
      ] },
      { k: 'sub', t: '退役 / 检索线', c: [
        { k: 'chips', items: [{ t: 'Qwen Flash / Qwen3 Max · 拟退役', retired: true }, 'Serper 搜索 / 搜图', 'Jina Reader', '萌百', '中文维基', 'danbooru', 'bilibili'] },
        { k: 'leaf', t: '公共契约：工具调用 + JSON Schema · 图像输入（v4-pro 除外）· 推理档位 · caching · SSE —— 合并路由的底座' },
      ] },
    ] },
    { k: 'cat', t: '既有功能', c: [
      { k: 'sub', t: '提示词增强', c: [
        { k: 'leaf', t: '模型感知：natural-language vs tag-based 出稿 · 负面提示词方言 · 反馈回流' },
      ] },
      { k: 'sub', t: '助手 v2 Operator（图片 / 视频 / LoRA 域）', c: [
        { k: 'leaf', t: '五动词入口 · 五类卡（消息 / 问题 / 确认 / 结果 / 证据）· 扳机永远在客户端' },
        { k: 'leaf', t: '每轮结账：事实 / 决定 / 待办 / 证据 #eN 写进 rounds，下一轮注入' },
        { k: 'leaf', t: '查证 + 找图两入口 · 来源白 / 黑名单 · 上下文卡 提议 → 确认 · 项目规则 · 三档人设' },
        { k: 'leaf', t: '素材库四条写操作带撤销 · 恢复到这一步 · @ 引用参考图 / 视频 / MP3' },
      ] },
      { k: 'sub', t: '剧本与分镜', c: [
        { k: 'leaf', t: 'ScriptDoc：大纲 · ≤ 8 角色 · ≤ 24 镜 · 每镜 ≤ 6 句台词 → 确定性投影成节点' },
        { k: 'leaf', t: '剧本拆解：idea → 角色 / 场景 / 动作 / beat / 镜头（≤ 48）· 视频剧本 VS 30 / 60 / 120s · Seedance 提示词规划' },
      ] },
      { k: 'sub', t: '看与评 · 文本资产', c: [
        { k: 'leaf', t: '图片 / 视频分析（vision analyze · 抽三帧）· critique_result · 参考图用途分工' },
        { k: 'leaf', t: '画布文本节点（双击原位编辑）· Prompts 个人配方库（版本 / 复用 / 血缘）' },
      ] },
    ] },
    { k: 'cat', t: '既有设计', c: [
      { k: 'leaf', t: '助手是「替你拧旋钮的手」：不生成媒体，把参数铺到看得见的控件上，钱闸不拆' },
      { k: 'leaf', t: '右上星光按钮 → 玻璃仪表面板 · 手机半屏可拖 Sheet · 历史入口并入标题；便签 14：画布助手体验优于图片助手' },
      { k: 'leaf', t: '剧本脑住画布右栏，确认后一次性投影；问题卡一次只问一个（比多数产品硬，不要动）' },
    ] },
    { k: 'cat', t: '不足', c: [
      { k: 'gap', t: '助手要独立设计一张导图（便签 13 / 17）：公共层（反问 · 识图 · 搜索 · 视频分析 · skill 设定 · 自动填入）+ 图片 / 视频 / 画布 / LoRA / 卡片 各自专属层；参考图审核冲突应反问用户而不是报错' },
      { k: 'gap', t: '联网要单独设计（便签 9 / 15）：正文预算分档 · 白黑名单下沉到 provider 原生过滤 · 引用改区间锚 citedText · 同源家族去重 · 深研档一次澄清 + 有上限多轮' },
      { k: 'gap', t: '助手体验对齐主流 agent（便签 10 / 16）：记忆即时写 + 可见可编 · 来源可溯 contextUsed · 敏感类目不记 · 隐身模式 · 思考摘要（只 Gemini）· 看网页用 Gemini URL context' },
      { k: 'gap', t: '音频域不在 v2；LoRA / 音频手机形态沿用 v1；8,694 行 operator service 未拆；旧 prompt-assistant / node-assistant 未删' },
      { k: 'gap', t: 'prompt/enhance 的 maxDuration 30s < 120s 缓冲；Prompts 域收敛未实施；包 7 剧本节点形态模糊' },
    ] },
    { k: 'cat', t: '建议方向', c: [
      { k: 'dir', p: 'P0', t: '助手独立设计轮：公共层 + 五个专属层的导图（含卡片助手）→ 三方向 → owner 确认' },
      { k: 'dir', p: 'P0', t: '三路由合一：五家能力探测 + 降级；Qwen 退役；DeepSeek vision 换 deepseek-flash；Claude 接 memory 工具' },
      { k: 'dir', p: 'P0', t: '包 7 剧本节点：助手出大纲 → 连线生成每个分镜（便签 18），前置卡片总线' },
      { k: 'dir', p: 'P1', t: '联网五条改进（先白黑名单下沉与 citedText）· 图片 / 页面分析重设计（Gemini URL context 能力探测）' },
      { k: 'dir', p: 'P1', t: '助手覆盖音频域 + LoRA / 音频手机形态 · 记忆可见可编 + 隐身模式' },
      { k: 'dir', p: 'P2', t: '清理旧助手 · 拆 operator service · Prompts 收敛 · / skill 调用' },
    ] },
  ],
}

// ───────────────────────── 总览 Main ─────────────────────────
function overviewBranch(key, title, leaves) {
  return { k: 'cat', t: title, hue: HUE[key], c: leaves }
}

function overviewTree() {
  const branches = [
    ['image', '图片生成', [
      { k: 'leaf', t: '四家自然语言（GPT / Gemini / FLUX / Seedream）+ NAI + Runner；PixAI 候选；LoRA 域是双核之一' },
      { k: 'leaf', t: '工作台对照矩阵 + 共用编辑器 + 画布图片节点' },
      { k: 'gap', t: '三处线上错（Seedream 上限 / 虚标 / freeTier）· 编辑太杂待重整 · LoRA 白名单只 1 条' },
      { k: 'dir', p: 'P0', t: '编辑线开工成链 · LoRA 试 Z-Image Turbo 插槽' },
    ]],
    ['video', '视频生成', [
      { k: 'leaf', t: '六族：Seedance · Kling · Wan · HappyHorse · Omni · MiniMax；Kling multi_prompt 与 Seedance 白模档是分镜 / 白膜的现成解' },
      { k: 'leaf', t: '画布长视频导演台：参考槽收割 · 系列镜头 · 视频分析 · 剧本脑投影' },
      { k: 'gap', t: '2.5 被封顶 720p · Kling 延长端点不存在 · 尾帧被静默丢 · 卡片总线缺' },
      { k: 'dir', p: 'P0', t: '审阅网格 → 卡片总线 → 剧本节点' },
    ]],
    ['audio', '语音生成', [
      { k: 'leaf', t: 'Fish S2.1 留任；候选 豆包语音 2.0（可接）· Seed-Audio 1.0（观望）· 自托管 Qwen3-TTS / CosyVoice3' },
      { k: 'leaf', t: '配音间四步闭环 · 音色卡三来源 · 行内 [tag] 情绪' },
      { k: 'gap', t: '无长音频 / 播客管线 · 情绪栈只落 L2 · 助手不覆盖音频' },
      { k: 'dir', p: 'P0', t: '长音频拼接管线' },
    ]],
    ['text', '文字生成', [
      { k: 'leaf', t: '五家合一：GPT · Gemini · Grok · DeepSeek · Claude；公共契约 = 工具 + JSON Schema + 图像 + caching' },
      { k: 'leaf', t: '助手 v2 五动词 / 每轮结账 · ScriptDoc 剧本脑 · 提示词增强' },
      { k: 'gap', t: '助手 / 联网 / 分析都要独立设计轮 · 音频域不在 v2 · service 未拆' },
      { k: 'dir', p: 'P0', t: '剧本节点设计轮' },
    ]],
  ]
  // Render root centered with 4 colored category branches.
  const kids = branches.map(([key, title, leaves]) => {
    const h = HUE[key]
    const inner = `<div class="kids">${leaves.map((l) => `<div class="br">${nodeHtml(l, h)}</div>`).join('')}</div>`
    return `<div class="br">${nodeHtml({ k: 'cat', t: title }, h)}${inner}</div>`
  }).join('')
  const root = `<div style="background:${FG};color:#fff;font-size:22px;font-weight:600;letter-spacing:.01em;padding:16px 24px;border-radius:12px;white-space:nowrap;flex:none;line-height:1.3">PixelVault<br><span style="font-size:14px;font-weight:500;opacity:.8">生成能力 · 四模态</span></div>`
  return `<div class="tree"><div class="br">${root}<div class="kids" style="gap:22px">${kids}</div></div></div>`
}

const SHARED = [
  { t: '真实付费 provider smoke 从未执行', s: 'gap' },
  { t: '平台 key 缺口：Fish / ElevenLabs / Rodin 无映射 · OpenAI 失效 · VolcEngine 未绑', s: 'gap' },
  { t: '卡片总线契约（G5 身份卡同源）— 包 7 前必须回补', s: 'gap' },
  { t: 'G1 参考图 ↔ 素材库 · G3 政策归因 · G4 进度 / 取消 / 失败可见性', s: 'gap' },
  { t: '移动端 Playwright 最近记录 2026-08-05 单 worker 30/30，此后未再跑', s: 'partial' },
  { t: '执行架构 Worker-first：Next 只做 auth / validate / job / dispatch / callback', s: 'has' },
  { t: 'BYOK 六步路由 + QuickSetupDialog 缺 key 内联配置', s: 'has' },
]

function sharedStrip() {
  const cards = SHARED.map((c) => {
    if (c.s === 'gap') return nodeHtml({ k: 'gap', t: c.t, w: 300 }, 0)
    if (c.s === 'partial') return nodeHtml({ k: 'leaf', t: c.t, s: 'partial', w: 300 }, 0)
    return nodeHtml({ k: 'leaf', t: c.t, w: 300 }, 0)
  }).join('')
  return `<div style="margin-top:40px;padding-top:24px;border-top:1px solid #e5e5e5">
  <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px">
    <div style="font-size:14px;font-weight:600;color:${FG}">共享底座 · 跨模态一起卡住的事</div>
    <div style="font-size:12px;color:${MUTED}">任何一条不解，四张分图的 P0 都推不动</div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:10px">${cards}</div>
</div>`
}

// ───────────────────────── 路线板 Roadmap ─────────────────────────
const ROADMAP = {
  P0: { title: '近期 · P0', sub: '推 18 笔之后的第一批；每条都有已确认契约或 owner 已点名', items: [
    ['video', '包 6 审阅网格过设计门 → 实现', '域定义 → 三方向 → 关键切片 → owner 确认'],
    ['video', '卡片总线契约回补', '包 7 剧本节点的前置；身份卡存废（G5）同源'],
    ['text', '包 7 剧本节点设计轮', 'owner 已定：形态仍模糊，先设计不写契约'],
    ['image', '编辑线 E0–E5 开工 + 生成后去向', '工作台重设计的编辑线一条未开工；变体 / 转视频 / 存配方成链'],
    ['image', 'LoRA：Z-Image Turbo 试作插槽 + 护栏重做', 'owner 口头方向；目录仍把 Z-Image 列为观察项'],
    ['audio', '长音频 / 播客拼接管线', '先量 Fish 60s 超时墙，再定分段阈值'],
    ['shared', '真实付费 smoke（Wan 3.0 / Seedance 2.5 / GPT Image）', '需要有效且授权的 key，会产生费用'],
  ] },
  P1: { title: '中期 · P1', sub: '有域文档背书、缺的是排期', items: [
    ['video', '剪辑台一期：拼接 / 转场 / 字幕 / 导出回画布', '契约 2026-09-10 已定；ffmpeg on CF Container'],
    ['video', 'Enhance 域落地：Topaz / SeedVR2 超分修复', '施工基准 2026-09-06 已定，代码零实现'],
    ['video', '尾帧多通道对齐 · video-to-video 输入通道', '现在只有火山真发 last_frame'],
    ['image', 'StyleCard 资产化 · 参考图直连素材库（G1）', '风格 + 样张 + 参数快照 + 反馈回流'],
    ['image', 'tag 模型专属输入面', '触发词 / 负面方言 / 权重语法从矩阵搬进 UI'],
    ['audio', '表现力三档 + 情绪导演 + A/B 试听', '复用助手路由与 llm-output-validator'],
    ['text', '助手覆盖音频域 + LoRA / 音频手机形态', '工具已在 video 域，缺 domain 与 Sheet'],
    ['text', '长文本两道门：播客对话稿', '复用剧本引擎的大纲 → 对话稿'],
  ] },
  P2: { title: '远期 · P2', sub: '方向成立，但不与双核抢资源', items: [
    ['video', '3D 场景 / 机位作为镜头控制手段', '3D 的价值转为给长视频提供空间控制'],
    ['image', '解禁风格迁移 / 文字渲染 · 平台出资降档', '能力表已建，等 owner 一句话'],
    ['audio', '第二 TTS 供应商 · designed 造音色 · video-to-sound', 'MiniMax Music / ACE-Step 开源插座'],
    ['text', '清理旧助手 · 拆 operator service · Prompts 收敛', '公共配方并入 Gallery，InspirationPrompt 删'],
    ['text', '助手 skill 用 / 调用', '2026-09-11 提出，等 v2 施工完再谈'],
    ['shared', 'Storyboard 解 gate · Arena 整体删除', '图片与 LoRA 完善后再推；Arena 是独立删除任务'],
  ] },
}

function modDot(key) {
  const color = key === 'shared' ? FG : accent(HUE[key], 0.55, 0.13)
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${color};flex:none;margin-top:6px"></span>`
}

function roadmapBoard() {
  const cols = Object.values(ROADMAP).map((col) => {
    const items = col.items.map(([key, t, why]) => `
      <div style="display:flex;gap:10px;padding:10px 12px;background:#fff;border:1px solid #e5e5e5;border-radius:8px">
        ${modDot(key)}
        <div style="display:flex;flex-direction:column;gap:3px">
          <div style="font-size:13px;font-weight:500;line-height:1.45;color:${FG}">${esc(t)}</div>
          <div style="font-size:12px;line-height:1.5;color:${MUTED}">${esc(why)}</div>
        </div>
      </div>`).join('')
    return `<div style="display:flex;flex-direction:column;gap:10px;padding:16px;background:#f5f5f5;border-radius:12px">
      <div style="display:flex;flex-direction:column;gap:4px;padding:0 4px 8px">
        <div style="font-size:16px;font-weight:600;color:${FG}">${esc(col.title)}</div>
        <div style="font-size:12px;line-height:1.5;color:${MUTED}">${esc(col.sub)}</div>
      </div>
      ${items}
    </div>`
  }).join('')
  const key = ['image', 'video', 'audio', 'text'].map((k) => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${MUTED}"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${accent(HUE[k], 0.55, 0.13)}"></span>${{ image: '图片', video: '视频', audio: '语音', text: '文字' }[k]}</div>`).join('') +
    `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${MUTED}"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${FG}"></span>共享底座</div>`
  return `<div style="display:flex;gap:16px;margin-bottom:16px">${key}</div>
  <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:16px">${cols}</div>`
}

// ───────────────────────── emit ─────────────────────────
const files = {
  'Main.dc.html': page('PixelVault 生成方向图 · 总览',
    header('四模态生成能力 · 总览', '一张图看四个方向的阵容 · 已有 · 最大缺口 · 第一步。点进右侧四张分图看完整树；底部是跨模态共用、任何一条不解四张图都推不动的事。') +
    overviewTree() + sharedStrip()),
  'Image.dc.html': page('图片生成 · 方向图',
    header('图片生成', '自然语言模型与关键词模型两条输入范式并存；LoRA 域按北极星双核单列。既有功能按 生成 / 编辑 / 衍生去向 / LoRA 四组。') + tree(IMAGE, HUE.image) + reply(22, '目前的问题是如何进行区分。切换模型就要切换功能。具体应该如何设计。', ['能力驱动表单，不做四套页面：① 通用区固定（提示词 · 参考轨 · 规格 chip · 张数），任何模型都在同一位置。', '② 模型专属区 = 表单第二行一组 chip，从 capabilities 派生：GPT（透明底 · 输入保真）· Gemini（对话式改图 · 多图融合）· FLUX（多参考 · 图层）· Seedream（组图 · 图层拆分 · 参考 ≤10）· NAI（质量标签 · UC · 多人构图 · V5 控件）。没有专属能力的模型这一行不出现。', '③ 切模型时通用区的值保留；专属区整组换，不兼容的值回默认并给一行提示「已切到 X · 负面词不再生效」，而不是留着发不出去的字段（批注 21 第 4 条删虚标是同一件事）。', '④ 模型选择器行第二行写「专属：组图 · 图层」，让人选之前就知道换模型会多 / 少什么（方向 A 的行结构已留第二行）。', '⑤ 参考轨按模型上限裁剪（NAI 1 张 · Seedream 10 · FLUX 多参考），多出的参考灰显不删。'])),
  'Video.dc.html': page('视频生成 · 方向图',
    header('视频生成', '画布长视频导演台是北极星双核之一；Studio Video 只做快轻短片。模型分 文 / 首帧 与 多模态参考 两类输入。') + tree(VIDEO, HUE.video)),
  'Audio.dc.html': page('语音生成 · 方向图',
    header('语音生成', '角色声音库（音色卡）是主线，配音间是入口。供应商只剩 Fish 一家做语音，ElevenLabs 负责音效与音乐。') + tree(AUDIO, HUE.audio)),
  'Text.dc.html': page('文字生成 · 方向图',
    header('文字生成', '文字不是独立产出，而是三条路由（增强 / 规划 / 助手）服务四模态：提示词、剧本、分镜、查证与评审。') + tree(TEXT, HUE.text)),
  'Roadmap.dc.html': page('开发路线 · P0 / P1 / P2',
    header('建议路线 · 近期 / 中期 / 远期', '四张分图里的「建议方向」按优先级合并成一张板。每条附一句为什么现在；顺序可直接拖动改。', { withLegend: false }) + roadmapBoard()),
}

for (const [name, html] of Object.entries(files)) {
  writeFileSync(join(OUT, name), html)
  console.log('wrote', name, html.length)
}
