// UI/UX summary boards (page 3): overview / user / designer / homepage scroll proposal.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const reply = (n, q, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 批注 ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`

const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    li::marker { color: #a3a3a3; }
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
function header(eyebrow, title, sub) {
  return `<div style="margin-bottom:28px;max-width:900px">
    <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">${esc(eyebrow)}</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2;color:${FG}">${esc(title)}</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>`
}
const sev = { high: RED, mid: AMBER, low: GREEN }
const sevLabel = { high: '高', mid: '中', low: '低' }
function issueCard(it) {
  return `<div style="display:flex;flex-direction:column;gap:8px;padding:14px 16px;background:#fff;border:1px solid #e5e5e5;border-radius:10px">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;font-weight:500;padding:2px 7px;border-radius:999px;border:1px solid ${sev[it.s]};color:${sev[it.s]}">${sevLabel[it.s]}</span>
      <div style="font-size:14px;font-weight:600;line-height:1.4">${esc(it.t)}</div>
    </div>
    <div style="font-size:12.5px;line-height:1.55;color:#404040"><span style="color:${MUTED}">现状 · </span>${esc(it.now)}</div>
    <div style="font-size:12.5px;line-height:1.55;color:${FG}"><span style="color:${MUTED}">建议 · </span>${esc(it.fix)}</div>
    ${it.where ? `<div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:${MUTED}">${esc(it.where)}</div>` : ''}
    ${it.ok ? `<div style="display:inline-flex;align-self:flex-start;align-items:center;gap:6px;font-size:11.5px;line-height:1.4;padding:3px 8px;border-radius:999px;background:oklch(0.97 0.04 85);border:1px solid oklch(0.85 0.08 85);color:oklch(0.4 0.1 85)">owner · ${esc(it.ok)}</div>` : ''}
  </div>`
}
function section(title, sub, items, cols = 2) {
  return `<div style="margin-top:28px">
    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px"><div style="font-size:16px;font-weight:600">${esc(title)}</div>${sub ? `<div style="font-size:12px;color:${MUTED}">${esc(sub)}</div>` : ''}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols}, minmax(0, 1fr));gap:12px">${items.map(issueCard).join('')}</div>
  </div>`
}
const legend = `<div style="display:flex;gap:16px;font-size:12px;color:${MUTED}">${['high', 'mid', 'low'].map((k) => `<span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${sev[k]}"></span>${sevLabel[k]} = ${{ high: '影响主路径 / 首访转化', mid: '影响效率或一致性', low: '打磨项' }[k]}</span>`).join('')}</div>`

// ───────── 1 · 全体视角 ─────────
const OVERVIEW = header('PixelVault · UI/UX 总结 · 2026-09-17', '全体视角 · 整站结构与一致性', '基于线上 anteisuba.com 实拍（首页 / 画廊 / 登录，桌面 1440 与手机 390）与代码 / 页面文档读取。登录态页面按文档与代码现状评估，未真机截图。') + legend +
  section('信息架构', '路由面 26 条，用户看得见的 11 个', [
    { s: 'high', t: '首页六张功能卡不可点，首页只有两条路进应用', now: '功能页 01–06 与五个模型站全是演示，没有 href；能点的只有顶栏「登录 / 进入」→ 图片工作台、终页 CTA → 画布。', ok: '批注 47 · 保持简洁：不加六枚按钮，整张卡可点直达对应工具，不新增可见元素', fix: '每张功能卡底部加同一枚黑色「去用这个 →」按钮直达对应工具（image / lora / audio / video / node / assets），模型卡点封面进对应工作台并预选模型（?model=）。', where: 'src/components/business/home/HomeV4Fn*.tsx · HOME_V4_ROUTES' },
    { s: 'low', ok: '批注 48 · 保留：图片工作台最好理解，适合作为开始；画布 / LoRA 入口留侧栏，不做工作台首页', t: '登录后默认落图片工作台，双核（画布 / LoRA）没有首屏入口', now: '/studio 直接 302 到 /studio/image；画布只能靠侧栏第六项或首页终页 CTA。', fix: '登录后落「工作台首页」或至少在图片工作台空态放三张入口卡（继续上次项目 / 开画布 / 用 LoRA）；侧栏「画布」提到工具组第一位或单独一段。', where: 'src/app/[locale]/(main)/studio/page.tsx · navigation.ts' },
    { s: 'mid', ok: '批注 46 · 已删除 633ada4a：/studio/enhance /studio/analyze 路由、ToolPlaceholder、侧栏「敬请期待」组与三语键；故事板并入「去处」', t: '侧栏「敬请期待」三项占位页没有价值', now: '/studio/enhance、/studio/analyze 是 ToolPlaceholder，唯一按钮回图片工作台；故事板 gated。', fix: '收起为侧栏底部一行「即将到来」浮层说明，不给路由；Enhance 与 Analyze 真正的入口在画布视频节点和助手「看」，导航别再指向空页。', where: 'SHELL_NAV_LOCKED · ToolPlaceholder' },
    { s: 'mid', ok: '批注 45 · 确认', t: '素材库没有独立详情路由，分享与回退都靠 query', now: '/assets?generationId= 打开抽屉；画廊反而有 /gallery/[id]。', fix: '给素材加 /assets/[id]（抽屉与整页同一组件），复制链接、浏览器回退、助手引用都有稳定地址。', where: 'src/app/[locale]/(main)/assets' },
    { s: 'mid', ok: '批注 44 · 需要加一个设置页面 /settings（key · 额度 · 偏好 · 助手人设）', t: '设置 / 用量 / API key 全是浮层，没有一个「我的账户」页', now: 'ApiKeyManager 抽屉 + 额度徽章 + QuickSetupDialog 三处分散。', fix: '一页 /settings（key · 额度 · 偏好 · 助手人设），浮层保留作快捷入口；用户找不到「在哪配 key」是新用户最大摩擦。' },
    { s: 'low', ok: '批注 43 · 已完成 4c73bf4d（常量已删；文档漂移经枚举不存在，此条原为误报）', t: '死常量与文档路由漂移', now: 'ROUTES.COLLECTIONS 无页（已删）。文档里的 /canvas 都是文件名或外部参考站路由，不是本项目路由。', fix: '常量已删；文档无需改。' },
  ]) +
  section('跨页一致性', '同一件事在不同页长得不一样', [
    { s: 'high', t: '六个工具三套外壳', now: '图片 / 视频共用 StudioWorkbenchLayout；配音间独立对话式；3D 左右分栏；LoRA 四段 tab；画布全屏。', fix: '不要求同一骨架，但四件事必须一致：主动作按钮位置与样式、模型选择器、参考素材入口、结果去向菜单。先做「模型选择器」与「素材入口」两件共享件。', where: 'docs/references/ui-defaults.md §2.2 工作台脊柱' },
    { s: 'mid', ok: '批注 29 · 入口改右键 / 双击列表，注册表合一（见共享组件页）', t: '⌘K 两处独立实现，词表不同', now: 'StudioCommandPalette（工作台）与 ShellCommandPalette（画布）。', fix: '合一份命令注册表，按页面注入动作；至少「切页 / 新建 / 上传 / 问助手」四类命令全站一致。' },
    { s: 'mid', ok: '批注 41 · 统一一张脸（右侧 dock 可收成按钮），功能按宿主区分：工作台 = 表单 op、画布 = 节点 op、LoRA = 挂载 op', t: '助手三张脸', now: '工作台右上星光按钮 + 玻璃面板；画布右侧 dock；LoRA 右侧上下文栏；配音间没有。', fix: '统一为「右侧 dock，可收成按钮」一种形态；配音间也挂上（owner 便签也提到）。' },
    { s: 'low', ok: '批注 42 · 确认统一', t: '页头样式不统一', now: '画廊是大标题 + 分面 chip；素材页是吸顶工具条；卡片页是 tab；提示词是正文卡。', fix: '定一个「列表页页头」组件：标题 · 计数 · 分面 · 排序 · 视图密度，四个去处页共用。' },
  ]) +
  section('性能与反馈', '', [
    { s: 'high', ok: '批注 49 · 确认 → 任务条（共享组件页）', t: '生成中的进度 / 取消 / 失败可见性刚补一半（G4）', now: '视频镜头失败已持久化；图片工作台与 3D 仍是 spinner；Runner 冷启动最长数分钟只有一句提示。', fix: '统一「任务条」：排队 → 冷启动（预计 N 秒）→ 生成 → 归档，四态都有文字与取消；助手 dock 与任务条共用同一状态源。' },
    { s: 'mid', t: '首屏空白与 Cookie 横幅', now: '首页 hero 顶部到标题约 250px 留白；Cookie 横幅常驻底部 100px 且遮住 SCROLL 提示与页脚。', fix: 'hero 内容整体上提；横幅改为右下角小卡，滚动一屏后自动收成图标；「仅必要」默认高亮。' },
    { s: 'mid', ok: '批注 50 · 确认', t: '首页在 <900px 高的桌面会裁切', now: '演示卡内容按 900 高设计，800×600 视口下 LoRA 页内容被裁。', fix: '演示卡改为 min-height + 内部滚动禁用、按 vh 缩放（transform: scale）；或用 clamp() 缩尺。' },
    { s: 'low', ok: '批注 51 / 52 · 确认', t: '移动端首页缩略图条被裁切、深链形态未定', now: '390 宽下 hero 缩略图第三张被截断；功能卡在手机上只剩输入框，看不到结果。', fix: '手机 hero 用两行可横滑；功能卡手机版直接播「结果态」不播过程。' },
  ])

// ───────── 2 · 用户视角 ─────────
function journey(title, who, steps) {
  return `<div style="margin-top:28px;padding:16px;background:#f5f5f5;border-radius:12px">
    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px"><div style="font-size:16px;font-weight:600">${esc(title)}</div><div style="font-size:12px;color:${MUTED}">${esc(who)}</div></div>
    <div style="display:grid;grid-template-columns:repeat(${steps.length}, minmax(0, 1fr));gap:10px">${steps.map((s, i) => `
      <div style="display:flex;flex-direction:column;gap:6px;padding:12px;background:#fff;border:1px solid #e5e5e5;border-radius:10px">
        <div style="display:flex;align-items:center;gap:8px"><span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:${MUTED}">0${i + 1}</span><div style="font-size:13px;font-weight:600">${esc(s.t)}</div></div>
        <div style="font-size:12px;line-height:1.55;color:#404040">${esc(s.now)}</div>
        <div style="font-size:12px;line-height:1.55;color:${sev[s.s]}"><span style="font-weight:600">摩擦 · </span>${esc(s.pain)}</div>
        <div style="font-size:12px;line-height:1.55;color:${FG}"><span style="color:${MUTED}">改 · </span>${esc(s.fix)}</div>
      </div>`).join('')}</div>
  </div>`
}
const USER = header('PixelVault · UI/UX 总结 · 2026-09-17', '用户视角 · 三条旅程的摩擦点', '首访者要在 30 秒内知道「这是什么、我能做什么、从哪开始」；回头创作者要「接着上次做」；手机用户要「能看、能改、能发」。每条旅程按实际路由走一遍。') +
  journey('旅程 A · 首访者', '从首页到第一张图', [
    { s: 'mid', t: '落地首页', now: '13 页横向 deck，编辑感强，信息量大。', pain: '第一屏只有口号 + 缩略图，没有「一句话说清这是什么」和「谁在用」；SCROLL 提示被 Cookie 横幅盖住。', fix: 'hero 加一行副标（个人 AI 创作工作台：多模型生成 + 永久归档）与两个 CTA（试一张 / 看画廊）。' },
    { s: 'high', t: '被功能页吸引', now: '六张演示卡自动播放，很好看。', pain: '想点进去却不能点，全靠翻到最后一页的 CTA。', fix: '每张卡「去用这个 →」；演示结束态停留并显示按钮。' },
    { s: 'high', t: '登录', now: 'Clerk 弹窗 / 页面，成功落图片工作台。', pain: '进来是空参数栏 + 空舞台，没有引导；不知道要配 key 才能出图（缺 key 走 QuickSetupDialog 是点生成才弹）。', fix: '首次进入空态给三步引导卡：选模型 → 写一句 → 生成（平台额度先出一张），key 提示前置到模型选择器旁。' },
    { s: 'mid', t: '第一张图', now: '生成后结果在舞台，可就地编辑。', pain: '生成后「去向」不明确：存哪了？怎么再用？', fix: '结果卡底部固定四个去向：存配方 / 转视频 / 进画布 / 素材库已归档（带链接）。' },
  ]) +
  journey('旅程 B · 回头创作者', '接着上次的项目做长视频', [
    { s: 'high', t: '回到站内', now: '落图片工作台。', pain: '上次的画布项目要经 侧栏 → 画布 → 项目胶囊 三跳才回到。', fix: '登录后如有近期项目，直接落画布并打开最近项目；或工作台首页放「最近项目」。' },
    { s: 'mid', t: '找素材', now: '素材库分面 + 搜索，助手也能读文件夹。', pain: '参考图接不到素材库（G1），只能上传或粘贴。', fix: '所有参考入口统一「上传 / 最近 / 素材库 / 粘贴」四选，工作台与画布共用。' },
    { s: 'high', t: '出镜头', now: '画布节点连线 → 生成；失败原文持久化。', pain: '分镜怎么排、转场怎么切没有引导；剧本脑投影后角色槽要手填（卡片总线缺）。', fix: '剧本节点先出「镜头列表 + 转场」再投影；角色卡自动进参考槽。' },
    { s: 'mid', t: '成片', now: '剪辑台契约已定、实现待核。', pain: '目前只能逐镜下载再自己拼。', fix: '剪辑台一期先做拼接 + 字幕 + 导出回画布，就能闭环。' },
  ]) +
  journey('旅程 C · 手机用户', '通勤时看结果、改提示词、发画廊', [
    { s: 'mid', t: '首页', now: '44px 顶栏 + 抽屉；hero 缩略图横滑。', pain: '功能卡手机版几乎看不到结果；模型站文字密。', fix: '手机功能卡直接播结果态；模型站改成可横滑的卡片列表。' },
    { s: 'mid', t: '工作台', now: '图片有移动 composer；视频有；配音间降级；画布方向 A。', pain: 'LoRA 与配音间的助手手机形态沿用 v1；3D 参数抽屉。', fix: '手机统一「底部输入条 + 参数抽屉 + 结果全屏」三件，各工具只换参数抽屉内容。' },
    { s: 'low', t: '发布', now: '素材库多选发布。', pain: '发布后没有「去画廊看」的回链。', fix: '发布成功 toast 带「查看」。' },
  ])

// ───────── 3 · 设计师视角 ─────────
const DESIGNER = header('PixelVault · UI/UX 总结 · 2026-09-17', '设计师视角 · 脊柱执行度审计', '对照 docs/references/ui-defaults.md 的三条脊柱（字体三槽 / semantic 颜色 / 动效配方）与实拍：哪些已经统一，哪些页面还各自为政。') + legend +
  section('字体与排版', '三槽：正文 Geist + Noto Sans · 等宽 Geist Mono · 展示 Fraunces + Noto Serif', [
    { s: 'low', ok: '批注 39 / 54 · 确认', t: '展示槽在首页用得很好，在应用内几乎没有空态大标题', now: '首页衬线标题识别度高；应用内空态多为小字说明。', fix: '四个工具的空态给一行展示槽标题（如「先挂一把 LoRA」），让空态有品牌感也是引导。' },
    { s: 'mid', ok: '批注 38 · 确认', t: '等宽字用途溢出', now: '首页 chip、标签、模型名、计数全用 Geist Mono，字距大写，密度高时可读性下降。', fix: '等宽只给 参数 / id / 数值 / 快捷键；模型名与 chip 文案回正文槽 500 字重。' },
    { s: 'mid', t: '字号档跳跃', now: '首页 11px 大写标签 + 26px 标题；应用内 12 / 13 / 14 混用。', fix: '控件正文 14、辅助 12、标签 11 大写字距三档锁死；10px 只给密排数据。' },
  ]) +
  section('颜色与材质', '脊柱：纯白 · 97% · 94% 三层，强调只有 --primary', [
    { s: 'mid', ok: '批注 36 · 确认', t: '模态色在首页 / 卡片 / 方向图各用一套', now: 'prompts 域有紫 / 蓝 / 玫瑰；首页用黑白；画布卡有材质 token。', fix: '模态色只做「点」与「细边」，不做面；全站一张 4 色低饱和表（图 292 · 视频 255 · 语音 10 · 文字 160），首页和应用共用。' },
    { s: 'low', ok: '批注 37 · 确认', t: '灰底 + 白卡工作台脊柱已落四个工作台，画廊 / 素材库仍是纯白', now: '去处页与工具页层次感不同。', fix: '去处页保持纯白（浏览面），工具页灰底白卡（工作面）——这本身可以是有意的区分，写进 ui-defaults 即可。' },
    { s: 'low', ok: '批注 53 · 确认', t: '状态色三档使用不足', now: '失败态多为文字，缺少 status-risk 面。', fix: '任务条与卡片失败角标用 status-risk-surface + 图标。' },
  ]) +
  section('动效与交互', '配方：120 / 200 / 320 / 500ms · 只动 transform / opacity · 全部 motion-reduce', [
    { s: 'mid', ok: '批注 33 · 确认', t: '首页 GSAP 演示与应用内 motion 两套语法', now: '首页自动播放演示，应用内进入 stagger。', fix: '边界保留（CLAUDE.md 已定），但时长曲线共用 token；演示动画加 reduced-motion 静态终态。' },
    { s: 'high', ok: '批注 35 · 确认', t: '生成中状态缺「确定进度」', now: '多数是不确定 spinner。', fix: '能拿到阶段的（Runner 阶段词已接）就画分段进度条，否则用估时文案；这是 HIG 里「让用户知道等多久」的底线。' },
    { s: 'low', ok: '批注 34 · 确认', t: '按压 / hover 态在首页缺失', now: '首页 chip、卡片无 hover 反馈（本来也不可点）。', fix: '可点之后按脊柱：hover 提亮 + active scale .98。' },
  ]) +
  section('信息密度与层级', '', [
    { s: 'mid', ok: '批注 31 · 应该改', t: '画廊卡片信息叠加过多', now: '卡上同时有「参考」角标、作者头像名、点赞、下载、时长。', fix: '静态只留媒体 + 时长；作者与操作 hover / 长按再出；「参考」角标改成左上小图标。' },
    { s: 'mid', ok: '批注 32 · 确认，可以这么改', t: 'LoRA 工作台 3188 行组件承载四个 section', now: 'Generate / Community / Mine / Train 一页切换，参数区折叠层级深。', fix: '视觉上把 Train 独立成向导式页面；Generate 保持 60/40 监视台；Library 两 tab 只对齐视觉。' },
    { s: 'low', ok: '批注 55 · 问「有更好的设计吗」→ 见建议', t: '顶栏胶囊在首页与应用壳形态不同', now: '首页浮岛胶囊；应用内侧栏 + 无顶栏；账户入口散在侧栏底、抽屉、额度徽章三处。', fix: '一枚胶囊两态：首页 = 浮岛（logo · 导航 · 登录）；应用内 = 右上角小胶囊（头像 · 额度 · 语言 · key 健康点），同一材质、同一圆角，侧栏只管导航。画布全屏或页面滚动时胶囊缩成一粒头像，hover 展开。三处账户入口合成这一处，并且是 /settings 页（批注 44）的唯一入口。' },
  ])

// ───────── 4 · 首页视觉滚动方案 ─────────
function optionCard(o) {
  return `<div style="display:flex;flex-direction:column;gap:10px;padding:16px;background:#fff;border:1px solid ${o.rec ? FG : '#e5e5e5'};border-radius:12px">
    <div style="display:flex;align-items:center;justify-content:space-between"><div style="font-size:15px;font-weight:600">${esc(o.t)}</div>${o.rec ? `<span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;padding:3px 7px;border-radius:999px;background:${FG};color:#fff">推荐</span>` : ''}</div>
    <div style="font-size:12.5px;line-height:1.55;color:#404040">${esc(o.how)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;line-height:1.55">
      <div><div style="color:${GREEN};font-weight:600;margin-bottom:4px">好在</div>${o.pro.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div>
      <div><div style="color:${RED};font-weight:600;margin-bottom:4px">代价</div>${o.con.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div>
    </div>
  </div>`
}
// wireframe strip for the recommended structure
function wire() {
  const seg = (label, h, bg, note) => `<div style="display:flex;flex-direction:column;gap:6px;align-items:stretch"><div style="height:${h}px;background:${bg};border:1px solid #e5e5e5;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;color:${FG};padding:0 10px;text-align:center">${esc(label)}</div><div style="font-size:11px;color:${MUTED};line-height:1.5">${esc(note)}</div></div>`
  return `<div style="margin-top:28px">
    <div style="font-size:16px;font-weight:600;margin-bottom:12px">推荐结构 · 连续滚动 + 钉住演示（桌面）</div>
    <div style="display:grid;grid-template-columns:repeat(6, minmax(0, 1fr));gap:12px">
      ${seg('Hero · 100vh', 120, '#f5f5f5', '标题 + 副标 + 两个 CTA；作品墙随滚动向两侧散开（scrub）。')}
      ${seg('01 图片 · 250vh 钉住', 200, 'oklch(0.965 0.022 292)', '左文案固定，右演示卡钉住；滚动进度 0→1 = 写 prompt → 四家出图 → 结果态 + 「去用」。')}
      ${seg('02 LoRA · 250vh', 200, 'oklch(0.965 0.022 292)', '滚动 = 挂载权重从 2.0 滑到 0.1，四张对照图跟着变。')}
      ${seg('03 音频 · 200vh', 170, 'oklch(0.965 0.022 10)', '滚动推进三句台词逐句「说出」；音频不自动播放，按钮触发。')}
      ${seg('04 视频 · 250vh', 200, 'oklch(0.965 0.022 255)', '滚动把四个参考拖进槽位 → 出片；视频帧用海报序列不播 mp4。')}
      ${seg('05 画布 → 06 库 → 终页', 170, '#f5f5f5', '画布连线随滚动生长；库页平铺；终页两个 CTA + 页脚。模型站改成横滑列表放在终页之前。')}
    </div>
    <div style="margin-top:10px;font-size:12px;color:${MUTED};line-height:1.6">右侧圆点目录保留，改为跟随 section 进度的细进度条；每个 section 顶部保留 snap-start 让键盘 / 触控板一格一段，但段内滚动自由。</div>
  </div>`
}
const SCROLL = header('PixelVault · UI/UX 总结 · 2026-09-17', '首页要不要加「视觉滚动」，怎么加最好', '结论先说：要加，但不是加视差装饰，而是把现有六段自动播放的演示改成「滚动即操作」——用户滚多少，演示走多少。首页现在是 13 页整屏跳转（snap），中间没有进度可用，所以真正要改的是滚动模型，动效只是结果。') +
  `<div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:14px">${[
    { t: 'A · 保留整屏跳转，加页内视差', how: '维持 13 页 snap deck；每页进入时用 IntersectionObserver 触发一次性动画（现状 + 背景层轻微视差）。', pro: ['改动最小，现有 GSAP 演示可复用', '键盘 / 目录跳页逻辑不变'], con: ['滚动没有「中间态」，视差只能是装饰', '用户仍然被动看演示，看完才知道要等', '在矮视口下裁切问题不解'] },
    { t: 'B · 连续滚动 + 钉住演示（scrub）', how: '页面变成一条长卷；每个功能段 200–250vh，演示卡 position: sticky / GSAP pin，段内滚动进度驱动演示状态（写字 → 出图 → 结果）。段首保留 snap-start。', pro: ['滚多少看多少，节奏交给用户，这才是「视觉滚动」的价值', '每段结束态自然停在「去用这个」按钮上，解决不可点的问题', '矮视口自适应：钉住区按 vh 缩放'], con: ['需要把六段演示改成「按进度求值」的状态机，工作量中', 'GSAP ScrollTrigger 只允许在 HomeV4 内动态导入（CLAUDE.md 边界）', '手机上 pin 抖动，需要降级'], rec: true },
    { t: 'C · 横向卷轴', how: '把 deck 横过来，滚轮驱动横向平移，功能段像胶片一格格过。', pro: ['与「导演台 / 分镜」叙事贴合，识别度高'], con: ['触控板与手机手势冲突大，无障碍差', '三语文案长度不同，横向排版难控', '与应用内一律纵向滚动的心智不一致'] },
  ].map(optionCard).join('')}</div>` + wire() +
  section('落地要点', '按 CLAUDE.md 与 ui-defaults 的边界', [
    { s: 'high', t: '降级永远先做', now: 'prefers-reduced-motion 下现有演示照常播放。', fix: 'reduced-motion → 直接渲染每段的「结果态」+ 按钮，不钉住不 scrub；手机（<768）同样走结果态 + 轻微淡入，不做 pin。' },
    { s: 'high', t: '只动 transform / opacity，帧预算 16ms', now: '演示里有布局变化（chip 出现、列表增行）。', fix: '把演示元素全部预渲染，再用 opacity / translate / clip-path 揭示；图片用 <img decoding=async> 预载，视频用海报帧序列。' },
    { s: 'mid', t: 'scrub 状态机而不是时间线', now: '现在是 GSAP 时间线自动播放。', fix: '每段定义 progress 0–1 的关键帧表（0.0 空态 · 0.3 输入完 · 0.7 出图 · 1.0 结果 + CTA），ScrollTrigger scrub: 0.6 平滑；键盘翻页跳到 1.0。' },
    { s: 'mid', t: '目录与可达性', now: '右侧圆点目录只表示页。', fix: '圆点改进度条段；每段有 h2 与 aria-label，section 顶部 scroll-margin-top 让锚点可分享（/#lora）。' },
    { s: 'mid', t: '首屏性能', now: 'hero 拉公开画廊最新作品 10 张 + 品牌走马灯。', fix: 'hero 图用固定 6 张 + LQIP；GSAP 与演示资源在 hero 之后按需加载，LCP 只算标题与首图。' },
    { s: 'low', t: '模型站', now: '5 个模型站各是整屏轮播（7 张卡）。', fix: '并成一段横滑卡片列表（每模态一行），不参与 scrub；点封面进工作台预选模型。' },
  ], 3)

for (const [name, html] of [
  ['UxOverview.dc.html', page('UI/UX 总结 · 全体视角', OVERVIEW)],
  ['UxUser.dc.html', page('UI/UX 总结 · 用户视角', USER)],
  ['UxDesigner.dc.html', page('UI/UX 总结 · 设计师视角', DESIGNER)],
  ['UxHomeScroll.dc.html', page('首页视觉滚动方案', SCROLL + reply(40, '确认使用 B。', ['B · 连续滚动 + 钉住演示（scrub）已定。实现顺序：先 reduced-motion 降级与 scrub 状态机（不动演示内容），再把 13 页 deck 改长卷、每段 200–250vh，最后目录圆点改进度。', '首页在 <900px 高裁切（批注 50）与手机缩略图条（批注 51 / 52）随同一次改版一起收。', '排在进度表的首页段，位于共享组件之后。']) + reply('09-20 真机', 'B 落地后真机一看：感觉不对。图片 / LoRA / 声音 / 视频 / 画布还是之前那样自动展示更好；可以保留一个模块跳到下一个模块；模块之间的切换做上下视差；模型站也不对，回之前那样，上下切换和模型之间切换做视差。', ['改口 = 方向 A 的加强版：翻页不变、演示自动播；翻页那 600ms 前后景错速（文案快、演示卡慢，翻完对齐）；模型站回 v4 五站，站内切模型同样错速。', '处置：整体 git revert 六个 commit 回 v4，再只动两处过场（30b）。', '教训：滚动手感画板上判断不了，改版级先出能滑的原型再全量施工。']))],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
