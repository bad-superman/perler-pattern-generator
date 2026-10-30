/**
 * Shared types for the AI image generation layer. This module is imported by
 * both the local Node proxy and the Cloudflare Pages Function, so it must stay
 * runtime-agnostic (no Node built-ins).
 */

/**
 * Protocols the server knows how to talk. Add a new entry here and a matching
 * adapter under `providers/` to support another vendor.
 * @typedef {'openai-images'} ProviderKind
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {ProviderKind} kind
 * @property {string} apiKey
 * @property {string} apiBase
 * @property {string} model
 * @property {number} timeoutMs
 */

/**
 * @typedef {Object} AiConfig
 * @property {ProviderConfig} default
 * @property {ProviderConfig | null} fallback
 */

/**
 * @typedef {Object} GenerateRequest
 * @property {string} prompt
 * @property {string} size
 * @property {string} [ratio]
 * @property {string} [imageDataUri]
 * @property {string} [effectImageDataUri]
 */

/**
 * @typedef {'default' | 'fallback'} ProviderRole
 */

/**
 * @typedef {Object} GenerateResult
 * @property {string} [imageBase64]
 * @property {string} [imageUrl]
 * @property {string} mimeType
 * @property {ProviderRole} provider
 * @property {string} model
 */

/**
 * Error raised by a provider adapter. `status` is the upstream HTTP status when
 * available (0 for network/timeout failures).
 */
export class ProviderError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, model?: string, cause?: unknown }} [details]
   */
  constructor(message, details = {}) {
    super(message)
    this.name = 'ProviderError'
    this.status = details.status ?? 0
    this.model = details.model ?? ''
    if (details.cause !== undefined) this.cause = details.cause
  }
}

/** Raised when environment configuration is missing or invalid. */
export class AiConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'AiConfigError'
  }
}

export {}
