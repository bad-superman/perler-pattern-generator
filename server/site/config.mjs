import { isPaidFeaturePreview } from '../access/schema.mjs'

export function resolveSiteMode(env = {}, request) {
  return env.SITE_MODE === 'pro' || (request && isPaidFeaturePreview(request)) ? 'pro' : 'free'
}
