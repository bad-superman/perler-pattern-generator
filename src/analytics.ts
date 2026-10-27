import Clarity from '@microsoft/clarity'
import posthog from 'posthog-js'
import { DEFAULT_PALETTE_BRAND } from './palettes'

export type AnalyticsValue = string | number | boolean

export type PatternTrigger =
  | 'upload'
  | 'regenerate'
  | 'ai'
  | 'candidate'
  | 'palette'
  | 'quantize'
  | 'grid_size'
  | 'max_colors'
  | 'shape'

const CLARITY_EVENTS = new Set([
  'pattern_generated',
  'pattern_generate_failed',
  'ai_generate_completed',
  'ai_generate_failed',
  'board_created',
  'edit_entered',
  'pattern_exported',
  'pattern_export_failed',
])

let enabled = false

export function initAnalytics() {
  if (enabled || import.meta.env.DEV || navigator.webdriver) return

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY
  const clarityId = import.meta.env.VITE_CLARITY_PROJECT_ID
  if (!posthogKey && !clarityId) return

  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
      ui_host: 'https://us.posthog.com',
      autocapture: false,
      capture_dead_clicks: false,
      capture_pageview: false,
      capture_pageleave: true,
      disable_session_recording: false,
      disable_surveys: true,
      advanced_disable_feature_flags: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-analytics-mask]',
      },
      persistence: 'localStorage+cookie',
      person_profiles: 'identified_only',
      loaded(client) {
        client.register(defaultContext())
        client.capture('$pageview')
      },
    })
  }

  if (clarityId) {
    const clarityQueue = (window as Window & { clarity?: unknown }).clarity
    if (typeof clarityQueue !== 'function') Clarity.init(clarityId)
    for (const [key, value] of Object.entries(defaultContext())) Clarity.setTag(key, value)
  }
  enabled = true
}

function defaultContext() {
  const viewport = window.matchMedia('(max-width: 620px)').matches ? 'mobile' : 'desktop'
  return {
    viewport,
    source_mode: 'local',
    palette_brand: DEFAULT_PALETTE_BRAND,
  }
}

export function registerContext(properties: Record<string, string>) {
  if (!enabled) return
  posthog.register(properties)
  for (const [key, value] of Object.entries(properties)) Clarity.setTag(key, value)
}

export function track(event: string, properties?: Record<string, AnalyticsValue>) {
  if (!enabled) return
  posthog.capture(event, properties)
  if (!CLARITY_EVENTS.has(event)) return
  if (event === 'pattern_exported' && properties?.outcome === 'share_aborted') return
  Clarity.event(event)
}

export function fileTraits(file: File) {
  const kb = file.size / 1024
  const sizeBucket = kb < 256 ? 'lt_256kb' : kb < 1024 ? '256kb_1mb' : kb < 4096 ? '1mb_4mb' : 'gte_4mb'
  return { mime: file.type || 'unknown', size_bucket: sizeBucket }
}
