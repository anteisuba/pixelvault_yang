// D11 · ④ 账号入口：侧边栏底部 · 语言 · 我的主页
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"

// 真机取到的侧边栏真值（globals.css 明亮档）
const SUNKEN = '#ebebeb', SB_FG = '#454c55', SB_SUBTLE = '#555d67', SB_PRIMARY = '#0b0e12'
const SB_ACCENT = 'rgb(11 14 18 / 0.055)', SB_ACCENT_STRONG = 'rgb(11 14 18 / 0.09)'
const SB_ACTIVE = '#ffffff', SB_BORDER = 'rgb(11 14 18 / 0.08)'
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', FAINT = '#a3a3a3', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', AMBER = '#a04f00'
const SH_MENU = '0 1px 2px rgb(0 0 0 / 0.04), 0 16px 40px -18px rgb(0 0 0 / 0.28)'
const SH_CARD = '0 1px 2px rgb(0 0 0 / .04), 0 10px 26px -14px rgb(0 0 0 / .22)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  .cap { margin-top:10px; font-size:12px; line-height:1.55; color:#525252 }
  svg.ic { stroke:currentColor; fill:none; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; display:block; flex:none }
  table { border-collapse:collapse; font-size:12px } th,td { border-bottom:1px solid ${BORDER}; padding:7px 14px 7px 0; text-align:left; vertical-align:top }
  th { font-size:11px; color:${MUTED}; font-weight:500; text-transform:uppercase; letter-spacing:.05em }
`
const I = {
  images: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.4"/><path d="M21 16l-5-5-8 8"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4M14 14h4M6 16c.6-1.4 1.8-2 3-2s2.4.6 3 2"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.6-3.6 3.8-5.4 7.5-5.4s6.9 1.8 7.5 5.4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 11 5-3v8l-5-3z"/>',
  audio: '<path d="M4 11v2M8 8v8M12 5v14M16 8v8M20 11v2"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m12 12 8-4.5M12 12v9M12 12 4 7.5"/>',
  lora: '<circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M10 7h4a3 3 0 0 1 3 3v4"/>',
  tools: '<path d="M14.5 6.5a3.5 3.5 0 0 0 4.7 4.7L21 13l-8 8-2-2 8-8-1.8-1.8A3.5 3.5 0 0 0 14.5 6.5z"/><path d="m6 6 3 3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"/>',
  moon: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>', chevD: '<path d="m6 9 6 6 6-6"/>',
  out: '<path d="M15 3h6v6M21 3l-9 9"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
}
const ic = (k, color = 'currentColor', s = 15) => `<svg class="ic" viewBox="0 0 24 24" style="color:${color};width:${s}px;height:${s}px">${I[k]}</svg>`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const sec = (t, s = '') => `<div class="sec"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`
const state = (title, inner, note = '', w = 360) => `<div style="display:inline-block;vertical-align:top;margin:0 22px 22px 0;max-width:${w}px"><div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(title)}</div>${inner}${note ? `<div class="cap" style="max-width:${w}px">${note}</div>` : ''}</div>`
const frame = (inner, pad = 16) => `<div style="background:${SUNKEN};border-radius:14px;padding:${pad}px;display:inline-block;vertical-align:top">${inner}</div>`
const av = (s = 28) => `<span style="width:${s}px;height:${s}px;border-radius:50%;flex:none;background:radial-gradient(120% 120% at 32% 22%, #b9c6e0 0%, #7f8fb4 48%, #e3dbcb 100%);display:block"></span>`

// ── 侧边栏零件 ──
const navItem = (icon, label, { active = false, collapsed = false } = {}) => collapsed
  ? `<div style="position:relative;display:flex;justify-content:center;padding:5px 0">${active ? `<span style="position:absolute;left:-6px;top:6px;bottom:6px;width:2px;border-radius:1px;background:${SB_PRIMARY}"></span>` : ''}<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:7px;background:${active ? SB_ACTIVE : 'transparent'};color:${active ? SB_PRIMARY : SB_FG}">${ic(icon, active ? SB_PRIMARY : SB_FG, 15)}</span></div>`
  : `<div style="position:relative;display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border-radius:7px;background:${active ? SB_ACTIVE : 'transparent'};color:${active ? SB_PRIMARY : SB_FG};font-size:12.5px;${active ? 'font-weight:600;' : ''}">${active ? `<span style="position:absolute;left:-6px;top:5px;bottom:5px;width:2px;border-radius:1px;background:${SB_PRIMARY}"></span>` : ''}${ic(icon, active ? SB_PRIMARY : SB_FG, 15)}<span>${esc(label)}</span></div>`
const groupLabel = (t) => `<div style="padding:9px 8px 3px;${MONO}font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:${SB_SUBTLE}">${esc(t)}</div>`

const GO = [['images', '画廊'], ['file', '提示词'], ['archive', '素材库'], ['idcard', '卡片'], ['book', '分镜']]
const TOOLS = [['images', '图片', true], ['video', '视频'], ['audio', '音频'], ['cube', '3D'], ['lora', 'LoRA'], ['tools', '工具']]

const sidebar = ({ after = false, collapsed = false, menuOpen = false } = {}) => {
  const W = collapsed ? 40 : 144
  const brand = collapsed
    ? `<div style="display:flex;flex-direction:column;align-items:center;gap:7px;padding:2px 0 6px">${av(26)}<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:7px;color:${SB_FG}">${ic('panel', SB_FG, 15)}</span></div>`
    : `<div style="display:flex;align-items:center;gap:6px;padding:1px 4px 7px"><span style="font-size:13px;font-weight:700;letter-spacing:.02em">ANTEI</span><span style="flex:1"></span>${av(26)}<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:7px;color:${SB_FG}">${ic('panel', SB_FG, 15)}</span></div>`
  const brandAfter = collapsed
    ? `<div style="display:flex;flex-direction:column;align-items:center;gap:7px;padding:2px 0 6px"><span style="width:22px;height:22px;border-radius:6px;background:${SB_PRIMARY};display:block"></span><span style="display:grid;place-items:center;width:26px;height:26px;border-radius:7px;color:${SB_FG}">${ic('panel', SB_FG, 15)}</span></div>`
    : `<div style="display:flex;align-items:center;gap:7px;padding:1px 4px 7px"><span style="width:20px;height:20px;border-radius:6px;background:${SB_PRIMARY};display:block"></span><span style="font-size:13px;font-weight:700;letter-spacing:.02em">ANTEI</span><span style="flex:1"></span><span style="display:grid;place-items:center;width:26px;height:26px;border-radius:7px;color:${SB_FG}">${ic('panel', SB_FG, 15)}</span></div>`
  const go = GO.concat(after ? [['user', '我的主页']] : [])
  const foot = after
    ? (collapsed
      ? `<div style="border-top:1px solid ${SB_BORDER};margin-top:7px;padding-top:7px;display:flex;justify-content:center">${av(28)}</div>`
      : `<div style="border-top:1px solid ${SB_BORDER};margin-top:7px;padding-top:7px"><div style="display:flex;align-items:center;gap:7px;height:34px;padding:0 6px;border-radius:8px;background:${menuOpen ? SB_ACCENT_STRONG : 'transparent'}">${av(24)}<span style="flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">ANTEI</span>${ic('chevD', SB_FG, 13)}</div></div>`)
    : (collapsed
      ? `<div style="border-top:1px solid ${SB_BORDER};margin-top:7px;padding-top:7px;display:flex;justify-content:center"><span style="display:grid;place-items:center;width:28px;height:28px;border-radius:7px;color:${SB_FG}">${ic('gear', SB_FG, 15)}</span></div>`
      : `<div style="border-top:1px solid ${SB_BORDER};margin-top:7px;padding-top:7px"><div style="display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border-radius:7px;color:${SB_FG};font-size:12.5px">${ic('gear', SB_FG, 15)}<span>设置</span></div></div>`)
  return `<div style="width:${W}px;box-sizing:content-box;padding:8px 6px;background:${SB_ACTIVE};border:1px solid ${SB_BORDER};border-radius:12px;box-shadow:${SH_CARD}">
    ${after ? brandAfter : brand}
    ${collapsed ? '' : groupLabel('去处')}
    ${go.map(([i, l]) => navItem(i, l, { collapsed })).join('')}
    ${collapsed ? `<div style="height:7px"></div>` : groupLabel('工具')}
    ${TOOLS.map(([i, l, a]) => navItem(i, l, { active: a, collapsed })).join('')}
    ${foot}
  </div>`
}

// ── 账号菜单 ──
const mRow = (icon, label, value = null, { chev = false, danger = false } = {}) => `<div style="display:flex;align-items:center;gap:9px;height:32px;padding:0 9px;border-radius:7px;font-size:12.5px;color:${danger ? '#b3261e' : FG}">${ic(icon, danger ? '#b3261e' : MUTED, 15)}<span style="flex:1">${esc(label)}</span>${value ? `<span style="font-size:11.5px;color:${FAINT}">${esc(value)}</span>` : ''}${chev ? ic('chevR', FAINT, 13) : ''}</div>`
const ACCOUNT_MENU = `<div style="width:216px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_MENU};padding:5px;box-sizing:border-box">
  <div style="display:flex;align-items:center;gap:9px;padding:7px 9px 9px">${av(32)}<span style="min-width:0;display:flex;flex-direction:column;gap:1px"><span style="font-size:12.5px;font-weight:500">ANTEI</span><span style="font-size:11px;color:${FAINT}">@antei</span></span></div>
  <div style="height:1px;background:${BORDER};margin:0 -5px 5px"></div>
  ${mRow('globe', '语言', '简体中文', { chev: true })}
  ${mRow('gear', '设置')}
  <div style="height:1px;background:${BORDER};margin:5px -5px"></div>
  ${mRow('out', '退出登录', null, { danger: true })}
</div>`

const langRow = (t, { on = false } = {}) => `<div style="display:flex;align-items:center;gap:9px;height:32px;padding:0 9px;border-radius:7px;font-size:12.5px;background:${on ? MUTEDBG : 'transparent'};${on ? 'font-weight:500;' : ''}"><span style="flex:1">${esc(t)}</span>${on ? `<span style="width:5px;height:5px;border-radius:50%;background:${FG};display:block"></span>` : ''}</div>`
const LANG_MENU = `<div style="width:176px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_MENU};padding:5px;box-sizing:border-box">
  ${langRow('English')}${langRow('日本語')}${langRow('简体中文', { on: true })}
</div>`

const withMenu = (sb, menu, { up = true } = {}) => `<div style="display:flex;align-items:flex-end;gap:10px">${sb}<div style="padding-bottom:${up ? 0 : 0}px">${menu}</div></div>`

const B1 = header('PixelVault · D11 · ④ UI 画板 · 2026-09-20', '账号入口 · 侧边栏底部', 'owner 09-20 ① 三答：头像挪到侧边栏最底、和「设置」合成账号入口；语言做成账号菜单里一行带当前值（像 PixAI 菜单里那行 Language English ›）；个人主页拆成「去处」段的常规导航项，和画廊并列。⚠ PixAI 外面那颗常驻地球是给未登录访客用的，我们是登录后的侧边栏工具，不抄。')
  + sec('展开 144', '改前 → 改后')
  + state('改前 · 现在线上', frame(sidebar()), '头像在顶部和品牌、折叠钮挤一排，点了直接跳个人主页，没有账号菜单。底部只有一行「设置」。语言在应用里没有任何入口，只能进设置 → 偏好。', 320)
  + state('改后', frame(sidebar({ after: true })), '顶部只剩品牌 + 折叠钮。「我的主页」进了去处段，排在分镜后面。底部一行：头像 + 名字 + ▾，这一行就是账号入口，点开向上弹菜单。', 320)
  + state('改后 · 菜单打开', withMenu(frame(sidebar({ after: true, menuOpen: true })), ACCOUNT_MENU), '菜单向上弹，锚在底部那一行，底行进 pressed 底色。头部是头像 + 名字 + @用户名，⛔ 不放额度、不放 key 数、不挂红点 —— 那三样各有各的页（沿用 D3 的收口结论）。', 460)
  + sec('语言子菜单', '像图一那样：行上带当前值，展开是列表')
  + state('语言展开', LANG_MENU, '当前项用<b>选中底色 + 字重</b>说话，右边一颗小圆点。⚠ 这和助手历史那颗被砍掉的 ✓ 不冲突：历史那颗是和改名 / 删除两颗按钮排在同一条线上、看起来像第三颗按钮却按不了；语言是单选表，一行里没有任何按钮，圆点不抢位置。⛔ 三档只有 en / ja / zh，不要照抄 PixAI 那十几种。', 260)
  + state('收起 40', frame(sidebar({ after: true, collapsed: true })), '底部只剩头像，hover 出 tooltip「账号」，点开菜单锚到右侧。⚠ 头像在收起态是<b>唯一</b>的账号入口，所以它必须是一颗真 `button`，键盘到得了。', 240)

const B2 = header('PixelVault · D11 · ④ UI 画板 · 2026-09-20', '账号入口 · 判据与动效', '')
  + sec('三条判据', '实现时按这个对')
  + `<div style="max-width:940px"><table>
    <tr><th>问题</th><th>答案</th><th>为什么</th></tr>
    <tr><td style="font-weight:500">头像点了去哪</td><td>开账号菜单</td><td>它不再是「我的主页」的快捷方式 —— 主页已经是导航里的一项，一件事只留一个家。</td></tr>
    <tr><td style="font-weight:500">「设置」那一行还在吗</td><td>不在，收进菜单</td><td>底部只能有一个常驻入口。两颗并排会让人每次都要挑一次。</td></tr>
    <tr><td style="font-weight:500">语言改完谁来记</td><td>和设置 → 偏好同一个真值</td><td>⛔ 不在菜单里另存一份。两处写同一条路，否则「界面显示的」和「服务端认得的」会开始漂。</td></tr>
    <tr><td style="font-weight:500">外观（浅 / 深）也进来吗</td><td>不进（owner 09-23 定）</td><td>应用没有主题切换机制，菜单只放能真正生效的项；代码 AccountMenu 本就没做这一行，画板随代码删掉。</td></tr>
    <tr><td style="font-weight:500">退出登录</td><td>菜单最底，红字，上有分隔线</td><td>唯一的破坏性项，和上面隔开。⛔ 不做二次确认 —— 退出不丢数据。</td></tr>
  </table></div>`
  + sec('动效', '沿用既有档位，不新开')
  + `<div style="max-width:940px"><table>
    <tr><th>动作</th><th>时长 · 曲线</th><th>动什么</th><th>⛔</th></tr>
    <tr><td style="font-weight:500">账号菜单 开</td><td class="tok" style="${MONO}font-size:11px">120ms · ease-out</td><td>opacity 0→1，translateY 4px→0，origin 贴底行</td><td style="color:${AMBER}">不缩放</td></tr>
    <tr><td style="font-weight:500">账号菜单 关</td><td class="tok" style="${MONO}font-size:11px">--duration-fast · ease-standard</td><td>只淡出</td><td style="color:${AMBER}">不位移</td></tr>
    <tr><td style="font-weight:500">语言子菜单</td><td class="tok" style="${MONO}font-size:11px">同上</td><td>从父项右缘展开</td><td style="color:${AMBER}">不做二级滑入</td></tr>
    <tr><td style="font-weight:500">底行 hover / pressed</td><td class="tok" style="${MONO}font-size:11px">--duration-fast</td><td>背景走 accent → accent-strong</td><td style="color:${AMBER}">不动字重，行不能抖</td></tr>
    <tr><td colspan="4" style="padding-top:9px;color:${MUTED};border-bottom:0">全部包 <b>motion-reduce:transition-none</b>。底色三档必须分得开：hover 往暗（<b>--sidebar-accent</b>）、pressed 更暗（<b>--sidebar-accent-strong</b>）、激活浮片往亮（<b>--sidebar-active-surface</b>）—— 这条反极性是侧边栏既有的硬规矩，⛔ 不许账号入口自己破例。</td></tr>
  </table></div>`
  + sec('沿用的真值', '真机从 globals.css 取的，⛔ 不要另造')
  + `<div style="max-width:940px"><table>
    <tr><th>用途</th><th>token</th><th>值</th></tr>
    ${[['壳底', '--sidebar', SUNKEN], ['未选中标签', '--sidebar-foreground', SB_FG], ['段标题', '--sidebar-subtle', SB_SUBTLE], ['激活墨 / 竖条 / focus 环', '--sidebar-primary', SB_PRIMARY], ['hover（往暗）', '--sidebar-accent', SB_ACCENT], ['pressed', '--sidebar-accent-strong', SB_ACCENT_STRONG], ['激活浮片（往亮）', '--sidebar-active-surface', SB_ACTIVE], ['卡描边', '--sidebar-border', SB_BORDER]].map((r) => `<tr><td>${esc(r[0])}</td><td class="tok" style="${MONO}font-size:11px">${esc(r[1])}</td><td class="tok" style="${MONO}font-size:11px;color:${MUTED}">${esc(r[2])}</td></tr>`).join('')}
    <tr><td colspan="3" style="padding-top:9px;color:${MUTED};border-bottom:0">轨宽：展开 <b>144</b>（外 160 − 16）· 收起 <b>40</b>（外 56 − 16）。144 是按三语零截断算出来的，⛔ 不为账号行改宽。</td></tr>
  </table></div>`

for (const [name, html] of [['DesignD11Account.dc.html', page('D11 ④ 账号入口', B1)], ['DesignD11Rules.dc.html', page('D11 ④ 判据与动效', B2)]]) {
  writeFileSync(join(OUT, name), html)
  console.log('wrote', name)
}
