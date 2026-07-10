# pixelvault-civitai-image-proxy

Civitai 封面/来源图的**边缘缓存代理**。让浏览器不再直连 `image.civitai.com`，从而
绕开 Civitai 对单客户端突发请求的限流（429/503）。

## 为什么需要它

公开 LoRA 库的封面、详情大图、来源图配方缩略图此前都从浏览器**直连**
`image.civitai.com`。打开一页会一次性并发几十张 `<img>`，Civitai 的 Cloudflare
按单客户端限流，这波突发被回 **HTTP 429 / 503** → 封面几乎全部加载失败（黑格，
只有抢先挤过限流器的一两张能出）。

实测对照（同一批全新图）：

| 方式                               | 结果                                 |
| ---------------------------------- | ------------------------------------ |
| 串行 curl（逐个请求）              | **全 200**                           |
| 并发突发（9 张一次，模拟整页加载） | **0 成功**（429×7 + 404 + 连接失败） |

串行全过、并发全挂 —— 说明图片本身可服务，问题是**单客户端突发直连**触发了限流。

## 它怎么解决

浏览器改打 `img.anteisuba.com`：

```
img.anteisuba.com/<bucket>/<uuid>/<transform>/<file>
  → https://image.civitai.com/<bucket>/<uuid>/<transform>/<file>
```

- 命中 Cloudflare 边缘缓存 → 直接回，永远不碰 Civitai。
- 未命中 → Worker 服务端拉 Civitai（跟随 `image.civitai.com` → `image-b2` 的
  301），Cloudflare→Cloudflare 非单客户端突发，不触发浏览器那种限流，然后长期缓存。
- 封面在所有用户间共享，缓存很快焐热；Civitai 只会看到零星回源。

目标 host 硬编码为 `image.civitai.com`（不是开放代理，无 SSRF 面）。

## 部署（owner）

前置：`anteisuba.com` 这个 zone 已托管在 Cloudflare（`cdn.anteisuba.com` 已在用，
满足）。

```bash
cd workers/civitai-image-proxy
npx wrangler deploy   # 首次可能需要 npx wrangler login
```

`wrangler deploy` 会用 esbuild 打包 `src/index.ts`（无需本地 `npm install`），并按
`wrangler.jsonc` 里的 `custom_domain` 路由，自动在该 zone 下创建 `img.anteisuba.com`
的 DNS 记录 + 证书并指向本 Worker。

> 本目录不带 `package.json` / `tsconfig.json`（仓库对这两个文件名有写保护，助手无法
> 创建）。`npx wrangler deploy` 不需要它们。如果你想固定 wrangler 版本或本地
> `tsc` 类型检查，手动创建这两个文件即可：
>
> `package.json`
>
> ```json
> {
>   "name": "pixelvault-civitai-image-proxy",
>   "private": true,
>   "type": "module",
>   "scripts": {
>     "dev": "wrangler dev",
>     "deploy": "wrangler deploy",
>     "typecheck": "tsc --noEmit"
>   },
>   "devDependencies": {
>     "@cloudflare/workers-types": "^4",
>     "typescript": "^5",
>     "wrangler": "^4.0.0"
>   }
> }
> ```
>
> `tsconfig.json`
>
> ```json
> {
>   "compilerOptions": {
>     "target": "ES2022",
>     "module": "ESNext",
>     "moduleResolution": "bundler",
>     "lib": ["ES2022"],
>     "types": ["@cloudflare/workers-types"],
>     "strict": true,
>     "noEmit": true,
>     "skipLibCheck": true
>   },
>   "include": ["src/**/*.ts"]
> }
> ```
>
> 建好后把 `src/index.ts` 顶部的 `// @ts-nocheck` 删掉即可获得真实类型检查（该注释
> 只是为了让应用侧的根 `tsc` 跳过这个 Worker 文件——它的 Cloudflare 全局与应用的
> DOM lib 冲突，而根 tsconfig 受写保护无法加 exclude）。

## 前端接线（部署后必做）

给下面这个 env 设值，前端才会把 civitai 图改写成走代理（**未设 = 回退直连**，
封面在突发加载时仍会 429/503）：

```
NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE=https://img.anteisuba.com
```

- Vercel：Project → Settings → Environment Variables（Production/Preview 都加），
  然后**重新部署**（`NEXT_PUBLIC_*` 在构建期内联，改完必须重建）。
- 本地：写进 `.env.local`。

代码侧只接管 `image.civitai.com` 的图；R2 / 自家 CDN / 其它源一律原样放行，改写
逻辑见 `src/lib/civitai-image-url.ts` 的 `proxyCivitaiImageUrl`。

## 验证

部署 + 配好 env + 重建后，打开 `/studio/lora?section=community`，封面网格应正常出图；
DevTools Network 里封面请求应指向 `img.anteisuba.com` 且返回 200（重复访问带
`cf-cache-status: HIT`）。

直接探一张（未命中会回源、命中直接回）：

```bash
curl -sI "https://img.anteisuba.com/xG1nkqKTMzGDvpLrqFT7WA/<uuid>/width=450,optimized=true/<id>.jpeg"
# 期望 HTTP/2 200、content-type: image/...、cache-control: public, max-age=604800, immutable
```

## 未来可选增强

- **R2 持久镜像层**：给 Worker 绑一个 R2 bucket，回源后 write-through 落 R2，边缘
  缓存被驱逐后仍由 R2 兜底（当前纯边缘缓存已足够解决突发限流，先不做）。
- **referer 白名单**：只放行 `anteisuba.com` 的 referer，防止被当作免费 Civitai
  CDN 白嫖（代价是要处理各家 referer policy 差异，暂缓）。
