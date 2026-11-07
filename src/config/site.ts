export type SiteMode = 'free' | 'pro'

export const SITE_MODE: SiteMode = import.meta.env.VITE_SITE_MODE === 'pro' ? 'pro' : 'free'
export const IS_PRO_SITE = SITE_MODE === 'pro'
