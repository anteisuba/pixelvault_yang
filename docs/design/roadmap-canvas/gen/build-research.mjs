// Research page (page 4): seven condensed research boards + a decisions board.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const done = (n, q, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid oklch(0.8 0.1 150);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.96 0.04 150);border-right:1px solid oklch(0.8 0.1 150)"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.4 0.1 150)">已落地 · ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const HUE = { image: 292, video: 255, audio: 10, text: 160, infra: 60, cards: 320 }

const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid #ececec; font-size: 12.5px; line-height: 1.5; }
    th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: ${MUTED}; font-weight: 500; border-bottom: 1px solid #d4d4d4; }
    td.mono { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 11.5px; }
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
function header(hueKey, title, sub, date = '2026-09-17') {
  const h = HUE[hueKey]
  return `<div style="margin-bottom:24px;max-width:960px">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${accent(h, 0.55, 0.13)}"></span>
      <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">PixelVault · 调研 · ${date} · 一手来源核对 · 全文在 scratchpad/research/*.md</div>
    </div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2;color:${FG}">${esc(title)}</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>`
}
const STATUS_COLOR = { '已接入': GREEN, '部分': AMBER, '未接入': RED, '错': RED, '一致': GREEN, '虚标': RED, '待核': AMBER, '未核实': MUTED }
function statusCell(s) {
  const key = Object.keys(STATUS_COLOR).find((k) => s.startsWith(k))
  const color = key ? STATUS_COLOR[key] : FG
  return `<td><span style="display:inline-block;width:7px;height:7px;border-radius:999px;background:${color};margin-right:6px;vertical-align:1px"></span>${esc(s)}</td>`
}
function table(cols, rows, statusIdx = -1) {
  return `<div style="overflow:hidden;border:1px solid #e5e5e5;border-radius:10px;margin-top:10px"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => i === statusIdx ? statusCell(c) : `<td${i === 0 ? ' style="font-weight:500;white-space:nowrap"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
function sec(title, sub) {
  return `<div style="margin-top:26px;display:flex;align-items:baseline;gap:12px"><div style="font-size:16px;font-weight:600">${esc(title)}</div>${sub ? `<div style="font-size:12px;color:${MUTED}">${esc(sub)}</div>` : ''}</div>`
}
function gaps(title, items) {
  return `<div style="margin-top:22px;padding:14px 16px;background:#f5f5f5;border-radius:10px">
    <div style="font-size:14px;font-weight:600;margin-bottom:8px">${esc(title)}</div>
    <ol style="margin:0;padding-left:20px;font-size:12.5px;line-height:1.6;display:flex;flex-direction:column;gap:3px">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
  </div>`
}
function sources(list) {
  return `<div style="margin-top:14px;font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;line-height:1.7;color:${MUTED};word-break:break-all">来源 · ${list.map(esc).join(' · ')}</div>`
}

// ───────── R1 图片自然语言四家 ─────────
const R_IMAGE = header('image', '图片 · GPT / Gemini / FLUX / Seedream 四家能力对照', '按你的便签把自然语言模型分成四类。每类一张表：能力 → 官方口径 → 仓库状态。红点 = 未接入或虚标，黄点 = 部分。') +
  sec('GPT Image（gpt-image-2 · 2.5 Flare · 2.5 Sunburst）', '三款同价：文本入 $5/M · 图入 $8/M · 图出 $30/M；1024² low→max $0.006–0.21') +
  table(['能力', '官方口径', '仓库'], [
    ['端点', 'images/generations + images/edits；Responses API 另有 image_generation 工具（多轮迭代、File ID）', '部分 · Worker 直打 REST，Responses 工具形态未接'],
    ['多图 / 蒙版', 'edits 收 image[]；mask 带 alpha、同尺寸 <50MB', '已接入 · 编辑器 sharp 合成 mask；生成路径无 mask'],
    ['尺寸', '自定义须 16 倍数、比例 1:3–3:1、单边 ≤3840', '部分 · 只按比例 + 档位映射固定几档'],
    ['画质 / 背景 / 格式', 'low→max 六档；transparent 须 png/webp；output_format png/jpeg/webp + compression', '部分 · 六档已接；格式写死 png，压缩未接'],
    ['张数 / 预览', 'n>1；partial_images 0–3', '部分 · n 恒 1；预览恒 2'],
    ['审核档', 'moderation: auto | low', '未接入 · 全仓无该参数'],
    ['负面 / seed', '均无', '一致'],
  ], 2) +
  sec('Gemini 图像（3 Pro Image · 3.1 Flash Image · 3.1 Flash-Lite Image）', 'Pro 1K/2K $0.134、4K $0.24；Flash 0.5K–4K $0.045–0.151；Lite 1K $0.034；均无免费档') +
  table(['能力', '官方口径', '仓库'], [
    ['输入模式', '文生图 + 对话式多轮编辑（推荐）', '部分 · 单轮单次 generateContent，无会话累积'],
    ['多图上限', '总 14；Flash 10 物体 / 4 角色 / 3 风格；Pro ≤6 物体 / ≤5 角色', '部分 · 14 一刀切，未分角色槽'],
    ['分辩率', 'Lite 仅 1K；Flash 0.5K/1K/2K/4K；Pro 1K/2K/4K', '部分 · 统一 1K/2K/4K：Lite 虚标、Flash 缺 0.5K'],
    ['比例', '含 21:9 / 4:5 / 5:4 十档', '部分 · 项目比例集未对齐'],
    ['联网接地 / 思考档', 'Flash 支持 Google 搜索接地；thinking minimal / high', '未接入'],
    ['freeTier', '定价页三款均无免费档', '错 · 目录 GEMINI_FLASH_IMAGE 标 freeTier:true'],
    ['蒙版 / 张数', '只有语义蒙版；一次一张', '一致'],
  ], 2) +
  sec('FLUX 2（Pro · Pro Edit · Flash · Kontext Max）', 'fal pro $0.03 首 MP + $0.015/MP；flash $0.005/MP；kontext max $0.08/张') +
  table(['能力', '官方口径', '仓库'], [
    ['最新旗舰', 'FLUX.2 [max]：10 张参考 + web contextual generation；fal fal-ai/flux-2-max 与 /edit 实测可用', '未接入 · 目录最高只到 pro'],
    ['多图参考', '≤8 张；输入 + 输出合计 ≤9MP', '部分 · 张数对，9MP 预算未建模'],
    ['负面 / guidance / steps', '指南明写不支持负面；fal pro/edit schema 无这三个字段（flash 只有 guidance）', '虚标 · MODEL_CAPABILITY_OVERRIDES 给 FLUX_2_PRO/FLASH 声明了三者'],
    ['审核档', 'BFL safety_tolerance 0–5；fal 1–5 + enable_safety_checker', '未接入'],
    ['分辩率 / 张数', '64² 起，≤4MP，16 倍数；flash / kontext 可 ≤4 张', '部分 · 只用 fal 预设枚举；恒 1 张'],
    ['结构化提示', 'JSON prompt + @image1 引用 + HEX 色值', '部分 · 只写进 enhanceHint'],
  ], 2) +
  sec('Seedream 5.0（Pro · Lite；fal / 火山 / BytePlus）', 'fal Pro ≤1536² $0.0675、≤2048² $0.135；Lite $0.035；火山 Pro 高档 ¥0.60、Lite ¥0.22') +
  table(['能力', '官方口径', '仓库'], [
    ['参考图上限', 'Pro 最多 10；Lite / 4.5 / 4.0 最多 14', '错 · 常量 14 对 Pro 超限直接 400（fal 侧 10 是对的）'],
    ['组图 sequential', 'max_images 1–15，仅 Lite / 4.5 / 4.0', '未接入 · 分镜 / 故事板最合适的能力'],
    ['图层拆分', 'layer_decomposition：底图 + ≤16 透明 PNG 图层带坐标，仅 Pro', '未接入 · 四家独一份，正好喂画布'],
    ['流式 / 联网', 'stream 逐张（Lite）；tools web_search（Lite）', '未接入'],
    ['尺寸档', 'Pro 1K/1.5K/2K（1.5K 与 1K 同价效果更好）；Lite 2K/3K/4K', '部分 · Pro 恒 2K 落高价档，Lite 缺 3K'],
    ['负面 / guidance', 'Ark 与 fal schema 均无', '虚标 · model-strengths 标 supported，Worker 会发 negative_prompt'],
    ['水印 / 格式', 'watermark 默认 true；url 24h 失效', '已接入 · 显式关水印、落 R2'],
  ], 2) +
  gaps('最值得补的 10 条（按价值）', [
    '接 FLUX.2 [max]（fal flux-2-max + /edit）——现役旗舰、纯增量',
    '修 Seedream Pro 参考上限 14 → 10（线上 400 级错误）',
    'Seedream Pro 图层拆分 → 画布图片节点',
    '删 Seedream / FLUX 的负面、guidance、steps 虚标声明',
    'Seedream Lite 组图 sequential_image_generation → 分镜',
    'OpenAI moderation: low',
    'Gemini 多图按模型 / 角色分槽（Pro 6/5，Flash 10/4/3）',
    'Gemini 分辩率按模型收敛（Lite 1K；Flash 加 0.5K）+ 去掉 freeTier 错标',
    'Seedream Pro 1K / 1.5K 档（同价省钱）',
    'output_format 与 n 统一暴露（四家都恒 1 张、OpenAI 写死 png）',
  ]) + sources(['developers.openai.com/api/docs/guides/image-generation', 'ai.google.dev/gemini-api/docs/image-generation', 'docs.bfl.ai/guides/prompting_guide_flux2', 'fal.ai/models/fal-ai/flux-2-pro', 'www.volcengine.com/docs/82379/1541523', 'fal.ai/models/bytedance/seedream/v5/pro/text-to-image'])

// ───────── R2 NovelAI + PixAI ─────────
const R_NAI = header('image', '图片 · NovelAI 全功能对照 + PixAI 接入方案', '按便签：tag 模型只留 NAI。表里「已接入」是 Worker 真发的字段，「未接入」多数是同一端点加字段就能拿到的能力。') +
  sec('NovelAI V5 Full / Curated（兼顾 V4.5）', 'BYOK-only；V5 是首个对 Opus 免费生成设「电池」上限的模型；2026-09-21 起退订清零 Anlas') +
  table(['功能', '官方口径', '仓库'], [
    ['多角色构图', 'V5 ≤22 人自由定位、独立正负、source#/target# 交互前缀；V4/4.5 ≤6 人 5×5 网格', '已接入 V5（2026-09-14 本地）· 缺 V4.5 六人与交互前缀提示'],
    ['Inpaint', '遮罩重绘；V5 仅 Full 有模型，Curated 借 V4.5', '未接入'],
    ['质量标签 / UC 预设', 'V5 Light / Standard 两档；UC Heavy / Light / Furry / Human / None', '未接入 · qualityToggle:false、ucPreset 硬编'],
    ['Text: 文字渲染', '放 prompt 最末；V5 EN/JA/ZH；Full 750 字上限', '未接入'],
    ['采样器 / SMEA / DYN', '8 种采样器；>1024² 自动 SMEA', '未接入 · k_euler_ancestral 硬编'],
    ['CFG rescale / Decrisper / schedule', '推荐 CFG 5–6', '部分 · 只暴露 CFG'],
    ['分辩率档 / 批量 / Anlas', 'Small–Wallpaper 四档；Opus 免费条件 ≤28 步单张 ≤1024²', '部分 · 5 个固定尺寸，n 恒 1，无额度预估'],
    ['Vibe Transfer', 'V4+ ≤16 vibe，编码 2 Anlas；V5「coming later」', '未接入'],
    ['Precise Reference', '2026-02 发布，仅 V4.5；每参考 +5 Anlas', '未接入'],
    ['Director Tools', '去背景 / 线稿 / 上色 / 情绪 / 去杂 / Pixel Snap；/ai/augment-image', '未接入'],
    ['透明背景 / 新标签 / 漫画', 'V5 原生 alpha；depthness / complexity / visual novel 标签；单图多格', '未接入'],
    ['img2img', 'strength / noise', '部分 · 单图，noise 硬编 0'],
  ], 2) +
  gaps('NAI 最该补的 8 条', ['V5 Full inpaint（Curated 回落 V4.5）', '质量标签 / UC 预设 / Text: 快捷控件', '采样器 / SMEA / schedule / rescale 暴露', '分辩率档 + Anlas 预估 + 批量', 'Vibe Transfer（V4.5 现可用）', 'Precise Reference（V4.5）', 'Director Tools 作编辑动作', 'V5 自然语言增强 + 透明背景标签 + V4.5 六人']) +
  sec('PixAI 接入', '结论：有官方 REST API（beta），可接；t2i only') +
  table(['项', '事实'], [
    ['API', 'api.pixai.art：POST /v2/image/create → GET /v1/task/{id} 轮询或 webhook；Bearer key；每账号 10 个 waiting 任务'],
    ['模型', 'Tsubaki.2（DiT）· Haruka v2 · Hoshino v2（SDXL，兼容 SDXL LoRA）；loras ≤5；batchSize 1|4；11 种比例'],
    ['不支持', 'i2i / 参考图 / 编辑 / 视频；图不永久保留须自行落 R2'],
    ['Key 与价', '会员 profile 即时生成或邮件申请；credits 制，API 专属价目未核实；社区逆向包违约'],
    ['建议', 'A 类原生 adapter（队列 submit → poll，同 fal / minimax）；先 BYOK；maxReferenceImages:0；loras 数组直接对接 LoRA 方向'],
    ['风险', 'beta 无 SLA；模型 ID 随版本变（站内已是 Tsubaki.3）；媒体 URL 会过期'],
  ]) + sources(['docs.novelai.net/en/image/', 'image.novelai.net/docs/index.html', 'blog.novelai.net', 'platform.pixai.art/en/docs', 'pixai.art/terms'])

// ───────── R3 视频 ─────────
const R_VIDEO = header('video', '视频 · 六族能力对照 + 分镜 / 转场 / 白膜解法', '按便签分六个节点。红点里有两条线上会失败的错：Seedance 2.5 的 1080p 被封顶、Kling V3 的延长指向不存在的端点。') +
  sec('六族矩阵（只列与仓库有出入或未接的行）') +
  table(['家族', '官方能力', '仓库'], [
    ['Seedance 2.5', '480p/720p/1080p；时长 4–30 或 -1 智能；编辑 / 延长任务；21:9 与 adaptive；白模参考渲染', '错 · 1080p 双重封顶；编辑 / 延长未接；-1 与 21:9 未暴露'],
    ['Seedance 2.0 系', '图 1–9 / 视频 3 / 音频 3；只响应「镜头 N」序号', '已接入 · 参考上限正确'],
    ['Kling O3 / V3 Pro', 'multi_prompt 镜头列表 + shot_type；首尾帧 end_image_url；elements + create-voice；video-to-video；motion-control；无 extend 端点', '错 · videoExtension 指向不存在端点；multi_prompt / 首尾帧 / elements / v2v 全未接；negative 只 V3 有'],
    ['Wan 3.0', 't2v / i2v 首尾帧 / r2v 图 10 视频 5 音频 5；Prime 上位档；web_url / file_url 成片', '已接入主体 · Prime 与 thinking / expansion 未接'],
    ['HappyHorse 1.1', 'reference-to-video 与 video-edit 端点；21:9 / 9:21 / 5:4 / 4:5', '部分 · 只接 t2v + i2v'],
    ['Gemini Omni 1.1 Flash', 'task 五种（含 edit / extend）；首尾帧；有状态多轮编辑；360p–4K；fal 有完整端点族', '部分 · 只当文生 / 图生；resolution / duration 全关；execution 口径自相矛盾'],
    ['MiniMax H3', 'i2v 首尾帧 0–2 张；768P / 2K；Regeneration 768P → 2K；H3-Max；输入视频另计费', '部分 · 首尾帧未接；只发 2K；无 H3-Max'],
  ], 2) +
  gaps('最该补的 8 条', ['Kling multi_prompt + shot_type（目录唯一原生 shot list）', 'Seedance 2.5 放开 1080p（capabilities + Worker 两处）', '修 Kling V3 videoExtension 端点（现在点延长必失败）', 'Seedance 编辑 + 延长（fal 只是 task 字段）', '首尾帧覆盖 Kling / MiniMax / Omni（keyframeSlots 全是 1，尾帧被静默丢）', 'Kling elements + create-voice（跨镜角色一致 + 音色）', 'Gemini Omni 有状态编辑 + 四档分辩率', 'MiniMax 768P 试镜 + Regeneration 升 2K（约砍 40% 试错成本）']) +
  sec('B① 分镜镜头怎么放、转场怎么切', '五条路径，前四条现有 provider 直接可做') +
  table(['路径', '怎么做', '成本'], [
    ['模型原生 shot list', 'Kling V3/O3 multi_prompt: [{prompt, duration}] + shot_type intelligent，一次出多镜（≤15s）', '加字段'],
    ['时间戳分镜 prompt', 'Seedance 2.5 按整数秒时间戳分段写画面 / 运镜 / 台词 / 音效，转场写触发点与方式（「第 5s 向左横移 + 叠化」）；2.0 只认「镜头 N」', '零改动，提示词范式'],
    ['多宫格分镜图', '≤15 格线稿合成一张投 R2V；不严格对齐，只给剧情', '零改动'],
    ['多关键帧严格对齐', '分镜图按顺序独立传，首句写「以图片 1 至 N 顺序作为关键帧」；比宫格图对齐度高', '已有 30 槽，缺「顺序」语义'],
    ['逐镜 + 尾帧续接 + 拼接', 'return_last_frame 当下一镜首帧；Seedance 2.5「视频无缝转场」补两段中间；「一键成片」多素材成片', '新任务模式，非新 provider'],
  ]) +
  sec('B② 转白膜：3D 灰模控制动作与分镜', '结论：Seedance 2.5 官方能力表本来就有「白模参考 / 渲染」') +
  table(['路径', '怎么做', '状态'], [
    ['Seedance 2.5 白模参考', 'R2V 三档：白模参考 / 白模 + 主体 / 白模 + 主体 + 场景；白模视频可含切镜、运镜、光照；官方 prompt 范式「以白模参考视频作为整支视频唯一的运镜与调度参考，不改变镜头结构」；只用简单几何体，主体只留躯干', '现有参考槽直接能用，缺 prompt 范式 + 「白模」档'],
    ['Kling motion-control', '外观图 + 动作源视频 + character_orientation，可绑面部 element；$0.168/s；动作源需写实角色', '新接一个 fal 端点'],
    ['Wan VACE 控制族', 'depth / inpainting / reframe / animate；深度图驱动最接近；Wan 2.2 代 ≤720p 无音频', '新接，且是老一代'],
    ['Gemini Omni 参考视频', '≤3 段 × ≤3s，只适合单镜姿态锚定', '新接，额度太短'],
    ['完整 previz 流水线', 'Blender / UE blockout → 导出 → 投模型；Runway Act-Two API 可用性未核实', '纯概念 / 自建'],
  ]) + sources(['www.volcengine.com/docs/82379/2298881', 'docs.volcengine.com/docs/82379/2607689', 'fal.ai/models/fal-ai/kling-video/o3/pro/text-to-video', 'fal.ai/models/fal-ai/kling-video/v3/pro/motion-control', 'fal.ai/models/alibaba/wan-3.0/reference-to-video', 'ai.google.dev/gemini-api/docs/omni', 'platform.minimax.io/docs/guides/video-generation'])

// ───────── R4 TTS ─────────
const R_TTS = header('audio', '语音 · TTS 全景 + 情感到位的做法 + 字节「sudo」核实', '云端主档 Fish 留任；最值得新接的是豆包语音合成 2.0；自托管选 Apache-2.0 的 Qwen3-TTS + CosyVoice3。') +
  sec('云端 TTS', '价格为官方标价') +
  table(['模型', '情绪控制', '多说话人', '克隆', '中日英', '价格'], [
    ['Fish S2.1-Pro（现用）', '[bracket] 自由词表 + temperature', '✅', '市场 + 克隆 + Voice Design', '83 语 Tier-1', '$15 / M 字节；free 档 $0'],
    ['ElevenLabs v3', 'audio tags + stability 三档', '✅ Text-to-Dialogue（v3 独占）', '需授权声明', '70+ 语', '$0.10 / 1K 字符'],
    ['豆包语音合成 2.0（Seed-TTS 2.0）', '指令式自然语言，非标记', '逐句编排', '复刻 2.0：5–10s 秒级', '中文最强（18+ 方言）', '¥5 / 万字符；首包 <300ms'],
    ['Seed-Audio 1.0', '一条 prompt 出对白 + BGM + 音效', '✅ 原生多角色', '多模态参考', '20 语', '火山方舟邀测，官方定价未核实'],
    ['MiniMax Speech 2.6 / 2.8', 'emotion 参数 + sound tags', '逐句', '~10s 克隆', '40+ 语', '≈$60 / M 字符（三方页，未核实）'],
    ['OpenAI gpt-4o-mini-tts', 'instructions 自然语言', '❌', '❌ 仅 13 音色', '英语优化', '音频出 $12 / M token'],
    ['Gemini TTS', 'Director\'s Notes + 行内 [whispers]', '✅ 原生 multi-speaker', '❌ 30 内置音色', '100+ 语自动检测', '按 token，档位未核实'],
    ['Hume Octave 2', 'acting instructions', '逐句', 'Voice Design + 克隆', '英语最强', '$15 / M 字符'],
  ]) +
  sec('可自托管（RunPod 单卡 24G）') +
  table(['模型', '情绪控制', '中日英', '显存', '许可（商用）'], [
    ['Qwen3-TTS 1.7B', '自然语言指令 + VoiceDesign 造音色', '中日英 + 10 语', '≈6G', 'Apache-2.0 ✅'],
    ['Fun-CosyVoice3 0.5B', 'instruct：方言 / 情绪 / 语速', '中（18 方言）日英', '≈6–8G', 'Apache-2.0 ✅'],
    ['IndexTTS-2 / 2.5', '最强：情绪参考音频 / 8 维向量 / emo_alpha；音色情绪解耦', '中文为主', '≈8–12G', 'bilibili 许可，商用需申请 ⚠'],
    ['Chatterbox', 'exaggeration + cfg_weight', '23+ 语含中文', '≈4–6G', 'MIT ✅（带水印）'],
    ['Fish-Speech / OpenAudio S2', '15000+ tag', '80+ 语', '≥16–24G', '研究许可，商用需谈 ⚠'],
    ['Higgs Audio v3', '21 种 tag + 音效', '多语', '≈16–24G', '非商用 ⚠'],
    ['F5-TTS', '弱', '中英', '≈6G', 'CC-BY-NC ⚠'],
  ]) +
  gaps('「情感到位」四层栈落点 + 推荐组合', [
    'L1 表现力三档：Fish temperature / ElevenLabs stability / Chatterbox exaggeration 可直接编译；OpenAI / Gemini / Hume 没有数值旋钮，三档编译成指令句',
    'L2 行内标记：Fish 自由词表最贴合；豆包 2.0 不吃标记，要编译成指令句（per-provider 编译层）',
    'L3 情绪导演（LLM 先标注）与 A/B 变体：与 provider 无关；Fish free 档是零成本实验台',
    '多人对话原生支持只有 ElevenLabs v3 Dialogue / Gemini / Fish / Seed-Audio；其余逐句拼接 = audio.md 已定的编排 service',
    '推荐：云端主档 Fish 留任 · 情绪特档 ElevenLabs v3 Dialogue 高价档 · 中文方言档新接豆包 2.0（火山 BYOK）· 观望 Seed-Audio 1.0 · 自托管 Qwen3-TTS + CosyVoice3，情绪要更强再上 IndexTTS-2（先拿授权）· 避开 Fish-Speech 权重 / Higgs / F5 的商用问题',
    '「字节 sudo」核实：字节没有叫 sudo / Seedo 的产品；大概率是 Seed-Audio 1.0（邀测中）；能马上接的是豆包语音合成 2.0 + 声音复刻 2.0；Seed-TTS 只是 2024 论文名',
  ]) + sources(['docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits', 'elevenlabs.io/docs/capabilities/text-to-dialogue', 'www.volcengine.com/product/tts', 'seed.bytedance.com/seed_audio', 'github.com/QwenLM/Qwen3-TTS', 'github.com/FunAudioLLM/CosyVoice', 'github.com/index-tts/index-tts'])

// ───────── R5 LLM + 搜索 + 助手 ─────────
const R_LLM = header('text', '文字 · 五家 LLM 能力 + 搜索设计 + 助手体验对齐', '按便签合并三条路由为一条、按五家分。公共契约是「工具调用 + JSON Schema + 图像输入 + caching」，独有能力只能做能力探测 + 降级。') +
  sec('五家矩阵（摘要）') +
  table(['维度', 'OpenAI', 'Gemini', 'Grok', 'DeepSeek', 'Claude'], [
    ['上下文 / 输出', '1.05M / 128K', '未核实', '500k', '1M / 384K', '1M / 128K'],
    ['输入模态', '文 + 图', '文 / 图 / 视频 / 音频', '文 +（部分）图', 'flash 有 vision；v4-pro 无', '文 + 图'],
    ['推理开关', 'reasoning effort', 'thinking_level + 摘要', '关不掉（仓库固定 low）', 'Thinking Mode', 'Fable 5.1 恒开 adaptive'],
    ['内置联网', 'web_search + 域名白黑各 100 + sources', 'Google grounding，按 query 计费', 'Web + X Search，域 ≤5', '无', 'web_search + 强制 citations + web_fetch'],
    ['文件 / 向量库', 'file_search', 'File API + URL context ≤20 URL', 'Collections', '无', '无（web_fetch / MCP）'],
    ['跨会话记忆', 'Conversations API', '无', '无', '无', 'memory 工具（客户端落盘）+ compaction'],
    ['caching', '自动，read 10%', '显式', 'cached input', '自动，命中价低两量级', 'read 2.5%（Fable）'],
    ['价格 in/out $/MTok', 'Sol 4/20 · Luna 0.2/1.2', 'Flash 0.75/3.75', '2/6', '0.66–1.32 / 1.98–3.96 峰谷', '10/50'],
    ['仓库未用', 'Responses 内置 tools · file_search · Conversations · caching', 'thinking_level · URL context · caching', 'Live Search · citations', 'caching 计量 · 峰谷调度', 'memory · web_search · code exec · caching'],
  ]) +
  gaps('公共能力（合并路由底座） vs 独有能力（探测 + 降级）', [
    '公共：兼容 chat/messages + SSE · 工具调用 + JSON Schema · 推理档位 · 图像输入（deepseek-v4-pro 除外）· caching · 长上下文',
    '独有：OpenAI file_search / tool_search / Conversations；Gemini 搜索接地 + URL context + 视频音频输入；Grok X Search；DeepSeek 峰谷价 + 384K 输出；Claude memory 工具 + context editing + 搜索结果代码过滤 + cited_text',
    '⚠ deepseek-v4-flash-vision-exp 已被官方标为旧别名，由 deepseek-flash 承接',
  ]) +
  sec('搜索「更全面」的 5 条改进') +
  table(['改进', '做法', '性质'], [
    ['正文预算分档', 'defaultNumResults 只有一个旋钮；按 questionType 分「取几条」与「取多少正文」', '自建，改动小'],
    ['白黑名单下沉到 provider', 'ProjectRule.sourceAllow/Deny 直接用 OpenAI / Claude / Grok 原生域名过滤，过滤发生在检索侧', '接官方内置搜索'],
    ['引用锚定改区间锚', '证据卡加 citedText（Gemini start/end_index、Claude cited_text ≤150 字），结论逐句对片段', '自建，契约变更'],
    ['同源家族去重', '同 registrable domain / 高相似 snippet 算一个印证单位', '自建'],
    ['深研档：一次澄清 + 有上限多轮', 'maxRefetchRounds 现为死分支；改写前允许一次澄清（复用问题卡）；总调用数上限；必须走 background + 轮询', '自建，接 OpenAI 三步法'],
  ]) +
  sec('助手体验对齐的 8 条差距') +
  table(['差距', '主流做法', '建议'], [
    ['记忆写入时机', 'Claude 聊天中按主题即时存', '每轮结账保留；用户明说的偏好 / 事实即时写上下文卡草稿'],
    ['记忆可见可编', 'ChatGPT 可逐条编辑 + 更新时间', '设置里加「助手记住的全部」页，复用 rounds + ContextCard'],
    ['来源可溯', 'ChatGPT 列出用到的指令 / 对话 / 文件 / 记忆', 'done 帧补 contextUsed，渲染折叠来源条'],
    ['敏感类目不记', 'Claude 默认排除健康 / 宗教 / 政治', 'propose_context_card 服务端加类目拒绝'],
    ['隐身模式', 'Temporary Chat / 隐身对话不读不写记忆', '会话级 ephemeral：不注入 rounds、不结账、不提议卡'],
    ['思考展示', 'Gemini 给摘要；Claude 分 thinking_delta', '只对 Gemini 渲染可折叠摘要；不展示 Fable 原始 thinking'],
    ['看网页落差', 'Gemini URL context 20 URL / 34MB 含 PDF', '能力探测：Gemini 用 URL context，其余回落 Jina'],
    ['澄清时机', 'Deep Research 在检索改写前澄清', '改写步允许吐一次澄清（questionType general 且主体歧义）；「一次只问一个」「改必带 inverse」不要动'],
  ]) + sources(['developers.openai.com/api/docs/guides/tools-web-search', 'ai.google.dev/gemini-api/docs/url-context', 'docs.x.ai/developers/tools/overview', 'api-docs.deepseek.com/quick_start/pricing', 'platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool', 'help.openai.com/en/articles/8590148-memory-faq'])

// ───────── R6 Runner ─────────
const R_RUNNER = header('infra', 'LoRA 出图 · RunPod / ComfyUI / 底模 / 缺的设置', '三条要你立刻拍板的：① 「standby 1」是不是 RunPod Active workers = 1（若是 ≈ $803/月，配额却只有 300 图）；② 「幻影 idle worker」很可能就是官方的 idle endpoint scale-down（3 天降 2 / 7 天降 0，不自动恢复）；③ Krea 2 的版本闸已开（worker-comfyui 5.10.0 = ComfyUI 0.34.0）。') +
  sec('A · RunPod Serverless（按优先级）') +
  table(['#', '建议', '依据'], [
    ['1', '查 max workers 是否被自动降到 0；长期无流量后请求永远 IN_QUEUE 与 §6 症状吻合', 'endpoint-configurations「Idle endpoint scale-down」'],
    ['2', '确认 Active workers = 0；active ≥1 消除冷启动但空转持续计费（4090 PRO $0.00031/s）', 'endpoint-configurations'],
    ['3', 'Execution timeout 120s → 180–300s；SDXL 30 步 + hires + 4× 放大冷启后首图易超；RUNPOD_INIT_TIMEOUT=800', 'workers/overview'],
    ['4', 'queue delay 阈值 4s → 2–3s，冷启动早触发', 'development/optimization'],
    ['5', '多数据中心 network volume，缓解 Throttled', 'endpoint-configurations'],
    ['6', '只烤 1–2 个热 checkpoint（anima-base + WAI + 共享 qwen 编码器 / VAE）进镜像；cached models 每端点只能挂一个 HF repo，不适用', 'model-caching'],
    ['7', 'Idle timeout 60s 空转照计费（≈$0.019/次）；零散单图降到 15–20s；Max workers 2 够用', 'endpoint-configurations'],
  ]) +
  sec('B · ComfyUI 侧', 'runner.md §5「Krea 2 只差发版」已过期') +
  table(['项', '建议'], [
    ['版本', 'fork 基于 5.8.6 = ComfyUI 0.25.0；5.10.0 = 0.34.0 已满足 Krea 2 ≥0.27；升级后必须重测 VAEDecode → Upscale 空结果坑'],
    ['启动参数', 'COMFY_LOG_LEVEL=INFO（默认 DEBUG）· --highvram（24G 跑 SDXL，Krea 2 谨慎）· --fast fp16_accumulation（别裸 --fast，伤忠实度）· sage attention 只在做 DiT 时装'],
    ['workflow 预热', 'start.sh 在 handler ready 前跑 64×64 / 1 步最小 workflow；Initializing 阶段不计费 = 免费省首图加载；Anima DiT 收益最大'],
    ['模型常驻', '真问题是同 worker 换 checkpoint 必重载 6.9G；产品侧默认底模收敛到 1–2 个比任何参数管用'],
    ['加速缓存', '核心内置 EasyCache / LazyCache；SDXL 20–30 步收益小且伤忠实度，默认别开'],
    ['自定义节点', '现只有 pixelvault_model_evidence，正确；ControlNet 走核心节点；ADetailer 要 Impact Pack，每装一个涨镜像'],
  ]) +
  sec('C · 底模候选', 'Volume 80G 已用 47.4G，剩 32.6G') +
  table(['候选', '许可', 'Civitai 近 30 天新 LoRA', '兼容', '结论'], [
    ['Anima 新档（aesthetic / turbo v1.1）', '非商用', '≥1340', '同 repo 同 workflow', '★ 最低成本最高回报'],
    ['Krea 2 Turbo', 'Krea 2 Community', '≥1361', 'VAE 就是 Volume 上的 qwen_image_vae；需 ComfyUI ≥0.27（已满足）', '★ 最该加；同时 generatability external → native'],
    ['Z-Image Turbo', 'Apache-2.0（唯一真商用）', '~190', '需新 VAE、新 loader', '值得加，排第三；扩 Volume 后'],
    ['NoobAI-XL / Illustrious v2 / WAI', '—', '112 / — / —', '已由 illustrious family 归桶借 WAI 出图', '不加独立 checkpoint'],
    ['Pony V7 / Qwen-Image / Chroma / FLUX.2 dev', '—', '2 / 9 / 6 / 5', '权重不通或体积大', '不加'],
  ]) +
  sec('D · LoRA 出图缺的设置（按价值）') +
  table(['#', '项', '现状 → 做法'], [
    ['1', 'LoRA 白名单只有 1 条', 'stock worker 不能运行时下载 → 在 fork 里做按 Civitai URL 运行时下载到 Volume + SHA 校验 + LRU；收益超其余全部之和'],
    ['2', 'strength_model / strength_clip 分离', 'workflow-builder 已是两字段，只差配方解析 + UI'],
    ['3', 'clip skip 可被来源配方覆盖', '现只读 manifest 硬编码；忠实复刻场景必须可覆盖'],
    ['4', '采样器 / 调度器暴露', '常量与 request-builder 全做好，workbench 没接选择器'],
    ['5', '负面 embedding', 'embedding:name 原生语法 + 几个常用文件放 models/embeddings/'],
    ['6', 'hires fix 开给用户', '后端已实现，只由来源配方驱动；纯 UI'],
    ['7', 'CFG rescale', '核心 RescaleCFG 节点，一处 workflow 改动'],
    ['8', 'ADetailer', '要 Impact Pack + bbox 模型；二次元人像提升最大单项，中成本'],
    ['9', 'IP-Adapter / 多参考', 'r4a 已施工完成、测试端点绿、生产未切换——已付成本未兑现'],
    ['10–14', 'ControlNet · X/Y 网格 · 触发词权重语法 · 单条权重上限 · per-block', 'ControlNet 卡容量；X/Y 先解 300 图 / 月限额；per-block 最低优先'],
  ]) + sources(['docs.runpod.io/serverless/endpoints/endpoint-configurations', 'docs.runpod.io/serverless/development/optimization', 'github.com/runpod-workers/worker-comfyui/releases', 'github.com/comfyanonymous/ComfyUI/blob/master/comfy/cli_args.py', 'civitai.com/api/v1/models'])

// ───────── R7 卡片 ─────────
const R_CARDS = header('cards', '卡片 · 角色卡怎么串起图片 / 视频 / 语音 / 画布', '结论：现有角色卡 schema 比想的完整（三视图、13 项属性、变体都有）；真正缺三样——声音绑定、参考图按用途分槽、人设行为与负面约束。画布节点语义已强于卡片，方向是「卡片补齐到画布」。') +
  sec('业界一致性机制对照') +
  table(['产品', '机制', '参考素材', '引用方式'], [
    ['SillyTavern Card V3', '人设文本 + assets[]（icon / emotion 等）+ lorebook 条件注入', '规范级承认「一张卡带图 / 音」', '字段进 system prompt；@@depth 控注入位'],
    ['Kling Element Library 3.0', '角色 / 道具 / 场景常驻元素 + 声音绑定', '单张主图，AI 补其他视角；视频 ≤7 角色', 'prompt 内 [@元素名]'],
    ['Vidu Reference2Video', 'subjects[] 显式主体数组', '每 subject ≤3 图，合计 ≤7', '@name；subjects[].voice_id 直接绑音色'],
    ['Runway Gen-4 References', '单张跨光线 / 场景保持', '≤3 个 Reference；均匀光、中性表情', '@名字自动补全；API {uri, tag}'],
    ['Gemini 3 图像', '多图按角色分槽', '≤14；Pro 10 物体 / 4 角色；Flash +3 风格', '自然语言；360° 靠带上一次结果迭代'],
    ['Midjourney Edit / Omni / Style Ref', 'Edit 模型取代 cref；--sref 只取风格', '≤4 张；--ow / --sw 权重', '指令式 prompt'],
    ['MiniMax H3', '图 / 视频 / 音频混合参考', '图 ≤9、视频 ≤3、音频 ≤3', '文本描述'],
  ]) +
  sec('PixelVault 角色卡数据模型：已有 vs 要加') +
  table(['区块', '字段', '状态'], [
    ['基本信息', 'name / description / tags / status / projectId', '已接入'],
    ['基本信息', '人设行为描述（说话习惯、小动作）· 情境 · 开场白', '未接入 · description 是视觉描述不是人设'],
    ['视觉锚', 'sourceImageEntries[{url, viewType}] 三视图 ≤10 · characterPrompt · modelPrompts · attributes 13 项 · referenceImages ≤5 · stabilityScore · loras ≤5', '已接入 · 强于多数产品'],
    ['视觉锚', '参考图用途 role（identity / faceCloseup / costume / pose / prop…）', '未接入 · 画布已有 11 类 NODE_STUDIO_REFERENCE_ROLES，上提到卡'],
    ['视觉锚', '负面约束 · 允许画风范围 allowedStyleRange', '未接入'],
    ['声音锚', 'VoiceCard 表独立存在', '部分 · 与 CharacterCard 零关联（voiceCardId 只在 VoiceRoom.cast 的 Json 里）'],
    ['声音锚', 'voiceCardId 外键 + voiceProfile{emotions, sampleLines}', '未接入'],
    ['版本血缘', 'parentId / variants / variantLabel', '已接入'],
    ['版本血缘', 'provenance{sourceGenerationIds, loraJobId} + version', '未接入'],
  ], 2) +
  gaps('三处使用方式 + 配合建议', [
    '图片：card-recipe-compiler 现在把角色 / 风格 / 背景图平铺成一个无标注数组 → 改 referenceSlots{role, url, cardId}，由各 adapter 映射到自家槽位（Gemini 角色槽 / MJ --oref vs --sref / Runway tag）',
    '视频：generate-video 只收 characterCardIds → 编译成带名字的 subject 结构，直接映射 Vidu subjects{name, images, voice_id} / Kling [@元素名] / Hailuo 参考池；名字 = card.name，音色 = voiceCardId',
    '画布：已有 cardId 绑定、@名字引用、referenceAssets[].role、loras；缺 voiceCardId 即可与配音间打通',
    '风格卡对角色卡是「改写」不是「追加」（编译器已写对，别退化成关键词拼接）；风格图打 role:style 走 --sref / Gemini 风格槽',
    '背景卡升级成「场景元素」可 @ 引用（同一条街道跨 8 镜才稳）；角色卡加 negativeConstraints 最后覆盖，UI 提示「该风格会覆盖角色 artStyle」',
    '建卡向导：主图 → 自动补 front / side / back → 精修入 referenceImages → stabilityScore 0.75 转 STABLE；参考图规范抄 Runway（均匀光、中性表情）',
  ]) + sources(['github.com/kwaroran/character-card-spec-v3', 'kling.ai/quickstart/klingai-element-library-3-user-guide', 'platform.vidu.com/docs/reference-to-video', 'help.runwayml.com/hc/en-us/articles/40042718905875', 'ai.google.dev/gemini-api/docs/image-generation', 'weavai.app/blog/2026/07/17/…'])

// ───────── 决定板 ─────────
const R_DECIDE = header('infra', '现在就要你拍板的 12 件事 · 已拍板', '调研里「不拍板就没法往下做」的项，按代价 / 收益排好。最右一列是 owner 批注 21 的答复 + 我的跟进；执行顺序见第 7 页进度表。') +
  table(['#', '问题', '为什么现在', '候选', '拍板 · 2026-09-17'], [
    ['1', 'RunPod「standby 1」是不是 Active workers = 1？', '若是，每月固定 ≈ $803，而月限额只有 300 图', '查控制台 → 改 0', '已查：Active 0 / Max 2 / 24h $0，不成立，关闭'],
    ['2', '「幻影 idle worker」按官方 idle scale-down 处理？', '3 天降 2 / 7 天降 0 且不自动恢复，与症状吻合', '查 max workers；自愈逻辑改为 PATCH 恢复 max', '已查：Idle timeout 60s（文档写 5s）、GPU 含 16GB；建议你改 5s 并去掉 16GB'],
    ['3', 'Seedream Pro 参考上限改 10、放开 Seedance 2.5 1080p、修 Kling 延长端点', '三条都是线上会失败的错', '直接修（不需设计门）', '确认修改（可直接开工）'],
    ['4', '删 Seedream / FLUX 的负面 / guidance / steps 虚标', 'UI 让用户填了发不出去', '直接删', '确认删除（可直接开工）'],
    ['5', '图片新接哪条：FLUX.2 [max] · Seedream 图层拆分 · Seedream 组图', '三条都纯增量', '建议顺序 max → 图层 → 组图', '确认新增，顺序 max → 图层 → 组图'],
    ['6', 'NAI 先补 inpaint + 质量标签 / UC / Text: 控件？', '同一端点加字段，V5 出图现在低于官方默认', '是 / 否', '确认添加'],
    ['7', 'PixAI 接不接（BYOK · t2i only）', '有官方 API，与 LoRA 方向互补', '接 / 观望', '接（BYOK · t2i）'],
    ['8', '视频先接 Kling multi_prompt 还是 Seedance 白模档', '一个解分镜，一个解白膜；都只加字段 / prompt 范式', '两个都做 · 先哪个', '都加。白模转换也做：结果去向菜单加「转白模」= 图片编辑端点固定 prompt（去材质 / 去光 / 灰白 clay），出白模图再喂 Seedance 白模档；3D mesh 渲染 clay 留作高级路'],
    ['9', '语音新接豆包语音合成 2.0（火山 BYOK）？Seed-Audio 观望', '中文方言最强、¥5 / 万字符；要做指令句编译层', '接 / 观望', '需再调查 → 语音方案写在新 page（第 8 页草案已建，待调查项列在页内）'],
    ['10', '自托管 TTS 上 Qwen3-TTS + CosyVoice3？', 'Apache-2.0 可商用；IndexTTS-2 要先拿授权', '上 / 不上', '同上'],
    ['11', '文字路由合一：Qwen 退役、DeepSeek vision 档换 deepseek-flash、Claude 接 memory 工具', '公共契约已清；deepseek-v4-flash-vision-exp 官方已标旧', '是 / 否', '确认'],
    ['12', '角色卡加 voiceCardId + 参考图 role + 人设字段（Prisma 迁移）', '这是把图片 / 视频 / 语音 / 画布串起来的那把钥匙', '开 spec / 后置', '确认（开 spec）'],
  ])

for (const [name, html] of [
  ['ResearchImage.dc.html', page('调研 · 图片四家', R_IMAGE + done('49d623f9 · 2026-09-17', '进度表 01', ['Seedream 5.0 Pro（火山 / BytePlus）参考上限 14 → 10：常量 per-model override + worker 请求体按 externalModelId 分流；Lite / 4.5 仍 14。', '虚标字段（负面 / guidance / steps）与 GEMINI_FLASH_IMAGE freeTier 在进度表 02 处理中。']))],
  ['ResearchNai.dc.html', page('调研 · NovelAI + PixAI', R_NAI)],
  ['ResearchVideo.dc.html', page('调研 · 视频六族', R_VIDEO + done('49d623f9 · 2026-09-17', '进度表 01', ['Seedance 2.5 六条目录项 + fal builder 放开 1080p；火山 / BytePlus builder 本来就透传。价格未分档（2.5 是单一每秒价）。', '删 KLING_V3_PRO.videoExtension；现在没有任何可用模型带延长，长视频延长入口不可达，model-catalog 照实写。', '转白模：Kling O3 v2v edit 试验通过（见第 7 页），接入排在进度表 28。']))],
  ['ResearchTts.dc.html', page('调研 · 语音 TTS', R_TTS)],
  ['ResearchLlm.dc.html', page('调研 · LLM 与助手', R_LLM + done('c49e21b6 · 2026-09-17', '进度表 05', ['Qwen 文字线整删：DASHSCOPE 枚举、四个文本模型、enhance / planner 候选、三语文案；Qwen-Image 底模与 Runner 不动。', 'DeepSeek vision 档换 deepseek-flash（官方现行，1M 上下文，Vision）。', 'Claude memory 工具未做：Anthropic 路由没有原生 tool-use 循环，接入等于新引擎，待 owner 拍板（05b）。']))],
  ['ResearchRunner.dc.html', page('调研 · Runner / LoRA', R_RUNNER)],
  ['ResearchCards.dc.html', page('调研 · 角色卡', R_CARDS)],
  ['ResearchDecide.dc.html', page('调研 · 待拍板', R_DECIDE)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
