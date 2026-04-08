# n8n Workflow Configuration Guide

PixelVault 使用 n8n 作为外部自动化工作流引擎，补充 GitHub Actions 无法覆盖的场景。

## 部署方式

推荐 Railway 自托管（~$5/月）或 n8n Cloud 免费版。

```bash
# Railway one-click
railway login
railway init
railway add --plugin postgresql
railway up -d ghcr.io/n8n-io/n8n
```

## 环境变量

n8n 需要以下凭证（在 n8n Credentials 中配置）：

| 名称                 | 值                               | 用途              |
| -------------------- | -------------------------------- | ----------------- |
| `PROD_URL`           | `https://your-domain.vercel.app` | 生产环境域名      |
| `HEALTH_CHECK_TOKEN` | 与 Vercel/GitHub Secret 一致     | Bearer token 认证 |
| `SENTRY_API_TOKEN`   | Sentry 后台生成                  | 周报错误统计      |
| `VERCEL_TOKEN`       | Vercel Account Settings          | 部署统计          |

---

## Workflow 1: 部署后健康检查

**触发**: Vercel Deploy Hook (Webhook)
**用途**: 部署完成后验证生产环境可用性

### 节点链

```
[Webhook] → [Wait 60s] → [HTTP GET /api/health] → [IF status != ok]
                                                        ├── Yes → [Slack/Email 通知]
                                                        └── No  → [HTTP GET /en]
                                                                      └── [IF HTTP != 200]
                                                                            ├── Yes → [通知]
                                                                            └── No  → [结束]
```

### 配置步骤

1. 在 n8n 创建 Webhook 节点，复制 webhook URL
2. 在 Vercel → Project → Settings → Git → Deploy Hooks 添加该 URL
3. Wait 节点设置 60 秒（等 CDN 传播）
4. HTTP Request 节点：
   - URL: `{{ $env.PROD_URL }}/api/health`
   - Method: GET
5. IF 节点检查 `{{ $json.status }}` 是否为 `ok`
6. 通知节点配置 Slack Webhook 或 Email

---

## Workflow 2: AI 提供商定期监控

**触发**: Cron (每 6 小时)
**用途**: 主动发现 AI 模型服务降级或不可用

### 节点链

```
[Cron 0 */6 * * *] → [HTTP POST /api/health/providers] → [Function: 解析结果]
                                                               ├── unavailable > 0 → [通知]
                                                               └── all available   → [结束]
```

### 配置步骤

1. Schedule Trigger 节点：Cron `0 */6 * * *`
2. HTTP Request 节点：
   - URL: `{{ $env.PROD_URL }}/api/health/providers`
   - Method: POST
   - Headers: `Authorization: Bearer {{ $env.HEALTH_CHECK_TOKEN }}`
3. Function 节点：

```javascript
const { summary, data } = $input.first().json
const down = data.filter((r) => r.status === 'unavailable')

if (down.length === 0) {
  return [] // 无异常，不触发后续
}

return [
  {
    json: {
      title: `AI Provider Outage: ${down.length} model(s) unavailable`,
      models: down.map((r) => `${r.modelId}: ${r.error || 'No response'}`),
      summary,
    },
  },
]
```

4. 通知节点：Slack/Email/Telegram

---

## Workflow 3: 周报摘要

**触发**: Cron (每周一 9:00 AM)
**用途**: 聚合一周运营数据发送摘要

### 节点链

```
[Cron Mon 9AM] → [HTTP: Sentry 错误统计]
               → [HTTP: Vercel 部署统计]
               → [Merge] → [Function: 格式化] → [通知]
```

### 配置步骤

1. Schedule Trigger：Cron `0 9 * * 1`
2. 并行两个 HTTP Request：
   - Sentry: `GET https://sentry.io/api/0/projects/{org}/{project}/stats/` + Bearer token
   - Vercel: `GET https://api.vercel.com/v6/deployments?projectId=xxx&limit=50` + Bearer token
3. Merge 节点合并结果
4. Function 节点格式化为摘要文本
5. 通知节点发送

---

## 注意事项

- n8n 的 Webhook URL 不应公开暴露，建议在 n8n 中配置 Basic Auth
- `HEALTH_CHECK_TOKEN` 必须与 Vercel 和 GitHub Secrets 中的值一致
- Workflow 2 与 GitHub Actions `health-monitor.yml` 功能重叠，二选一即可
  - GitHub Actions: 零成本，但受限于 GitHub 调度精度
  - n8n: 更灵活，可接入更多通知渠道（Slack/Telegram/Webhook）
