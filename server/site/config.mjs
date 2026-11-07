export function resolveSiteMode(env = {}) {
  return env.SITE_MODE === 'pro' ? 'pro' : 'free'
}
