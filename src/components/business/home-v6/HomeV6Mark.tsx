/**
 * 名单里一行的品牌标。OpenAI / Gemini 的路径照搬自 v4 首页（`HomeV4ModelLogo`，⛔ 重画别人的标）；
 * 其余是 `public/homepage/v6/marks/` 里的文件（来源见同目录 `_manifest.md`）；LoRA 不是品牌，是一个叠层小图标。
 */
import { HOME_V6_MARK_FILES, type HomeV6MarkKey } from '@/constants/homepage-v6'

const OPENAI_D =
  'M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.571-.428-.738l-5.97-3.473 1.95-1.117a.48.48 0 01.5 0l4.542 2.617c1.309.761 2.189 2.378 2.189 3.948 0 1.808-1.07 3.474-2.783 4.163zM7.802 12.94l-1.951-1.142a.474.474 0 01-.238-.428V6.135c0-2.545 1.95-4.471 4.59-4.471 1 0 1.927.333 2.712.928L8.229 5.303a.812.812 0 00-.427.738v6.898zm4.186 2.426L9.205 13.8v-3.33l2.783-1.594 2.783 1.593v3.331l-2.783 1.565zm1.594 5.279c-1 0-1.927-.333-2.712-.928l4.686-2.711a.812.812 0 00.428-.738V9.369l1.974 1.142a.474.474 0 01.238.428v5.235c0 2.545-1.974 4.47-4.614 4.47zm-4.35-3.14l-4.543-2.617c-1.308-.761-2.188-2.378-2.188-3.948 0-1.832 1.094-3.474 2.806-4.163v5.422c0 .333.143.571.428.738l5.947 3.449-1.951 1.118a.48.48 0 01-.5 0zm-.809 1.784c-2.735 0-4.733-2.052-4.733-4.4 0-.167.024-.357.048-.547l4.686 2.711c.262.143.571.143.856 0l5.97-3.449v2.26c0 .19-.071.333-.237.428l-4.543 2.616a4.252 4.252 0 01-2.047.38z'
const GEMINI_D =
  'M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.503.503 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z'

export function HomeV6Mark({
  mark,
  name,
}: {
  mark: HomeV6MarkKey
  name: string
}) {
  if (mark === 'openai')
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        fillRule="evenodd"
        role="img"
        aria-label={name}
      >
        <path d={OPENAI_D} />
      </svg>
    )
  if (mark === 'gemini')
    return (
      <svg viewBox="0 0 24 24" role="img" aria-label={name}>
        <defs>
          <linearGradient
            id="homeV6GeminiMark"
            x1="0%"
            x2="90%"
            y1="12%"
            y2="90%"
          >
            <stop offset="0%" stopColor="#1C7DFF" />
            <stop offset="52%" stopColor="#1C69FF" />
            <stop offset="100%" stopColor="#F0DCD6" />
          </linearGradient>
        </defs>
        <path fill="url(#homeV6GeminiMark)" d={GEMINI_D} />
      </svg>
    )
  if (mark === 'lora')
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l8 4.5-8 4.5-8-4.5z" />
        <path d="M4 12l8 4.5 8-4.5" />
        <path d="M4 16.5L12 21l8-4.5" />
      </svg>
    )
  const file = HOME_V6_MARK_FILES[mark]
  // eslint-disable-next-line @next/next/no-img-element -- 26px 的品牌标，next/image 只会多一层包装
  return file ? <img src={file} alt={name} /> : null
}
