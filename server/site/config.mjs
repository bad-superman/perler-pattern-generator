import { isPaidFeaturePreview } from '../access/schema.mjs'

export function resolveSiteMode(env = {}, request) {
  return env.SITE_MODE === 'pro' || (request && isPaidFeaturePreview(request)) ? 'pro' : 'free'
}

export function resolvePaidSiteOrigin(env = {}, request) {
  const configured = typeof env.PAID_SITE_ORIGIN === 'string' ? env.PAID_SITE_ORIGIN.trim() : ''
  if (!configured) return new URL(request.url).origin

  const value = /^[a-z][a-z\d+.-]*:\/\//i.test(configured) ? configured : `https://${configured}`
  const origin = new URL(value)
  if (!['http:', 'https:'].includes(origin.protocol)) {
    throw new TypeError('PAID_SITE_ORIGIN 仅支持 HTTP 或 HTTPS 地址')
  }
  return origin.origin
}
