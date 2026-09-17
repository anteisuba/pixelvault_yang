// Page 5 additions (task bar, result destinations) + page 6 (assistant / canvas / cards design trees).
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c', LINE = '#e5e5e5'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const reply = (n, q, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 批注 ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const tint = (h) => `oklch(0.965 0.022 ${h})`, tintBorder = (h) => `oklch(0.88 0.05 ${h})`, tintText = (h) => `oklch(0.38 0.11 ${h})`

const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid #ececec; font-size: 12.5px; line-height: 1.5; }
    th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: ${MUTED}; font-weight: 500; border-bottom: 1px solid #d4d4d4; }
    .tree { display: flex; align-items: center; }
    .kids { display: flex; flex-direction: column; gap: 10px; position: relative; padding-left: 32px; }
    .kids::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; border-left: 1.5px solid #d4d4d4; }
    .br { display: flex; align-items: center; position: relative; }
    .br::before { content: ''; position: absolute; left: -33px; top: 50%; width: 33px; border-top: 1.5px solid #d4d4d4; z-index: 1; }
    .br:first-child::after, .br:last-child::after { content: ''; position: absolute; left: -34px; width: 5px; background: #fff; z-index: 0; }
    .br:first-child::after { top: 0; height: 50%; }
    .br:last-child::after { top: 50%; height: 50%; }
    .br:only-child::after { top: 0; height: 100%; }
    .tree > .br::before, .tree > .br::after { display: none; }
`
const page = (title, body) => `<!doctype html>
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
const header = (eyebrow, title, sub) => `<div style="margin-bottom:24px;max-width:980px">
    <div style="${MONO}font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">${esc(eyebrow)}</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2">${esc(title)}</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>`
const sec = (t, s) => `<div style="margin-top:26px;display:flex;align-items:baseline;gap:12px"><div style="font-size:16px;font-weight:600">${esc(t)}</div>${s ? `<div style="font-size:12px;color:${MUTED}">${esc(s)}</div>` : ''}</div>`
const table = (cols, rows) => `<div style="overflow:hidden;border:1px solid ${LINE};border-radius:10px;margin-top:10px"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:500;white-space:nowrap"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
const legend = `<div style="display:flex;gap:16px;font-size:12px;color:${MUTED};margin-top:4px"><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:26px;height:14px;border-radius:4px;background:#f5f5f5"></span>已有</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${AMBER}"></span>部分 / 契约有实现待核</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${RED}"></span>缺，本设计新增</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:12px;height:6px;border-radius:999px;background:${FG}"></span>你手绘里的项</span></div>`

// ── tree renderer ──
const dot = (c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};margin-right:8px;flex:none;vertical-align:1px"></span>`
const own = `<span style="display:inline-block;width:12px;height:6px;border-radius:999px;background:${FG};margin-right:8px;flex:none"></span>`
function node(n, hue) {
  if (n.k === 'root') return `<div style="background:${accent(hue)};color:#fff;font-size:22px;font-weight:600;padding:14px 22px;border-radius:12px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'cat') return `<div style="background:${tint(hue)};color:${tintText(hue)};border:1px solid ${tintBorder(hue)};font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'sub') return `<div style="background:#fff;border:1px solid ${LINE};font-size:13px;font-weight:500;line-height:1.45;padding:7px 12px;border-radius:8px;max-width:240px;flex:none">${esc(n.t)}</div>`
  if (n.k === 'chips') return `<div style="display:flex;flex-wrap:wrap;gap:6px;max-width:${n.w ?? 520}px;padding:8px 10px;background:#f5f5f5;border-radius:8px;flex:none">${n.items.map((c) => `<span style="${MONO}font-size:11.5px;padding:3px 8px;border-radius:999px;background:#fff;border:1px solid ${LINE};white-space:nowrap">${esc(c)}</span>`).join('')}</div>`
  const pre = n.s === 'gap' ? dot(RED) : n.s === 'partial' ? dot(AMBER) : ''
  const o = n.own ? own : ''
  const border = n.s === 'gap' ? `border:1px dashed ${RED}99;background:#fff;` : `background:#f5f5f5;`
  return `<div style="display:flex;align-items:baseline;${border}font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 460}px;flex:none">${o}${pre}<span>${esc(n.t)}</span></div>`
}
const branch = (n, hue) => `<div class="br">${node(n, hue)}${n.c?.length ? `<div class="kids">${n.c.map((c) => branch(c, hue)).join('')}</div>` : ''}</div>`
const tree = (root, hue) => `<div class="tree" style="margin-top:20px">${branch(root, hue)}</div>`


const HUE = { image: 292, nai: 320, video: 255, audio: 10, text: 160, infra: 60, cards: 330 }
const ok = (t) => ({ k: 'leaf', t })
const gap = (t) => ({ k: 'leaf', s: 'gap', t })
const part = (t) => ({ k: 'leaf', s: 'partial', t })
const MAP = {
  k: 'root', t: '全部调研 · 一张图',
  c: [
    { k: 'cat', t: '图片 · GPT / Gemini / FLUX / Seedream', c: [
      { k: 'sub', t: '已核实的错', c: [ok('✓ 已修 49d623f9：Seedream Pro 参考上限 14 → 10（Lite / 4.5 仍 14）· 01'), ok('✓ 已修 9fe7a2e7：Seedream / FLUX.2 pro 虚标字段删除，flash 的 guidance 与火山 guidance 因真发而保留 · 02'), ok('✓ 已修 9fe7a2e7：GEMINI_FLASH_IMAGE freeTier → false · 02'), part('Gemini 多图 14 一刀切；官方 Pro 6 物体 / 5 角色、Flash 10 / 4 / 3')] },
      { k: 'sub', t: '已拍板新接', c: [ok('FLUX.2 [max]（fal flux-2-max + /edit，10 张参考）→ Seedream 图层拆分 → Seedream 组图 · 25'), ok('切模型换功能 = 能力驱动表单：通用区固定 + 模型专属 chip 行 · 11')] },
    ] },
    { k: 'cat', t: 'NovelAI + PixAI（tag 模型）', c: [
      { k: 'sub', t: '已核实', c: [part('V5 出图低于官方默认：缺质量标签 / UC 预设 / Text: 控件；inpaint 同端点加字段'), ok('PixAI 有官方 REST API，t2i only，BYOK；与 LoRA 方向互补')] },
      { k: 'sub', t: '已拍板', c: [ok('NAI 补 inpaint + 质量标签 / UC / Text: · 26'), ok('PixAI 接 · 26')] },
    ] },
    { k: 'cat', t: '视频 · 六族', c: [
      { k: 'sub', t: '已核实的错', c: [ok('✓ 已修 49d623f9：Seedance 2.5 放开 1080p（六条目录 + fal builder）· 01'), ok('✓ 已修 49d623f9：删 KLING_V3_PRO.videoExtension；延长入口目前无可用模型 · 01')] },
      { k: 'sub', t: '已核实的能力', c: [ok('Kling multi_prompt = 唯一原生分镜清单'), ok('Seedance 2.5 原生「白模参考 / 渲染」'), ok('Kling O3 video-to-video/edit 一次调用可把视频转白模 · 试验通过 $0.63/5s'), part('参考视频（Gemini Omni 3×3s、Kling motion-control）都未接')] },
      { k: 'sub', t: '已拍板', c: [ok('新接 Kling O3 v2v edit → 视频节点「转白模」→ 喂 Seedance 白模档 · 28'), ok('Kling multi_prompt 分镜 · 28')] },
    ] },
    { k: 'cat', t: '语音 · TTS + 人声提取', c: [
      { k: 'sub', t: '已核实', c: [ok('「字节 sudo」= Seed-Audio 1.0（邀测无定价）；能接的是豆包语音合成 2.0'), ok('豆包 2.0 后付费 ¥3 / 万字符（非 ¥5）；情绪走 context_texts / <cot>；模型靠 Resource-Id 头'), ok('Qwen3-TTS 1.7B：3090 实测 3.9GB · RTF 0.97 · Apache-2.0；独立 endpoint'), ok('人声提取：ElevenLabs isolation（$0.22/min，吃视频）· fal demucs（$0.02/4min，四轨）· adapter 都已有')] },
      { k: 'sub', t: '已拍板 / 排期', c: [ok('Fish S2.1-Pro 留任主档 · ElevenLabs v3 情绪特档'), ok('豆包 2.0 + 复刻 2.0 adapter · 29'), ok('Qwen3-TTS 独立 RunPod endpoint · 29'), ok('人声提取 V4b · 29'), part('观望：Seed-Audio 1.0 · IndexTTS-2（许可）· MiniMax')] },
    ] },
    { k: 'cat', t: '文字 · LLM 与助手', c: [
      { k: 'sub', t: '已核实', c: [ok('deepseek-v4-flash-vision-exp 官方标旧 → deepseek-flash'), ok('Qwen 文字路由退役；Claude 可接 memory 工具'), ok('画布助手体验好的原因：结构化 op + 自动落 + 767 行小服务 + 固定 Fable 5.1 路由')] },
      { k: 'sub', t: '已拍板', c: [ok('✓ 已修 c49e21b6：Qwen 文字线整删 · DeepSeek vision → deepseek-flash · 05；memory 工具待拍板（05b）'), ok('助手以画布 op 表为基线重做「改 / 请求生成」· 21–24')] },
    ] },
    { k: 'cat', t: 'Runner / LoRA / RunPod', c: [
      { k: 'sub', t: 'RunPod 控制台 2026-09-17 实看', c: [ok('Active workers 0 · Max 2 · Idle timeout 60s · 过去 24h 账单 $0 → 「standby = Active 1 ≈ $803/月」不成立，拍板 1 关闭'), part('页面显示 2 个 Idle worker 但不计费（warm 态）；「幻影 idle」= health 报 idle 而队列卡死，是另一件事，拍板 2 改为「遇到再抓 health 快照」'), ok('✓ owner 已改 Idle 5s · 去掉 16GB · Max 2；runner.md 已对齐 b6b7dfc1'), ok('余额 $10.24 · endpoint dt0wyuid7lywic · 模板 fork-5.8.6-r1 · volume pixelvault-models-eu-ro-1')] },
      { k: 'sub', t: '已核实', c: [ok('Krea 2 版本门已开（worker-comfyui 5.10 = ComfyUI 0.34）'), part('RUNNER_LORA_ALLOWLIST 只有 1 条'), ok('HF LoRA 来源 tab 仍在；Z-Image Turbo 只是口头方向')] },
    ] },
    { k: 'cat', t: '卡片 · 角色卡', c: [
      { k: 'sub', t: '已核实', c: [gap('角色卡缺 voiceCardId / 参考图 role / 人设字段'), ok('卡片是把图片 / 视频 / 语音 / 画布串起来的钥匙')] },
      { k: 'sub', t: '已拍板', c: [ok('Prisma 迁移 + 建卡向导 · 27（开 spec）'), ok('剧本节点角色槽由卡片总线装填 · 24')] },
    ] },
  ],
}
const B_MAP = header('PixelVault · 调研总图 · 2026-09-17', '全部调研整合 · 一张图', '七路调研（图片 / NAI / 视频 / 语音 / 文字 / Runner / 卡片）的已核实事实、已修正的错、owner 已拍板项，以及对应的进度表条号。红点 = 线上会失败或缺失的错；黄点 = 部分成立；灰 = 已核实事实或已定。RunPod 控制台是 2026-09-17 owner 登录后实看。') + tree(MAP, HUE.infra)
for (const [name, html] of [['ResearchMap.dc.html', page('调研总图', B_MAP)]]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
