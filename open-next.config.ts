import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default {
  ...defineCloudflareConfig({}),
  buildCommand: 'npx next build --webpack',
}
