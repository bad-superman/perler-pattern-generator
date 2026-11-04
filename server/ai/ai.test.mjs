import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAiConfig } from './config.mjs'
import { generate } from './providers/openaiResponses.mjs'

test('ModelMux Responses is the built-in default', () => {
  const config = resolveAiConfig({ AI_DEFAULT_API_KEY: 'test-modelmux-key' })
  assert.deepEqual(config.default, {
    kind: 'openai-responses',
    apiKey: 'test-modelmux-key',
    apiBase: 'https://modelmux.io/v1',
    model: 'gpt-5.6-sol',
    timeoutMs: 150_000,
  })
  assert.equal(config.fallback, null)
})

test('vendor-specific environment variables are not used implicitly', () => {
  assert.throws(
    () => resolveAiConfig({ MODELMUX_API_KEY: 'ignored', AGNES_API_KEY: 'ignored' }),
    /AI_DEFAULT_API_KEY/,
  )
})

test('Responses adapter sends image-guided generation and reads base64 output', async () => {
  const originalFetch = globalThis.fetch
  /** @type {{ url?: string, body?: any }} */
  const captured = {}
  globalThis.fetch = async (url, init) => {
    captured.url = String(url)
    captured.body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'image_generation_call', result: 'aW1hZ2U=' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const result = await generate({
      prompt: 'Make a bead pattern',
      size: '1K',
      ratio: '4:3',
      imageDataUri: 'data:image/png;base64,c291cmNl',
      effectImageDataUri: 'data:image/png;base64,ZWZmZWN0',
    }, {
      kind: 'openai-responses',
      apiKey: 'test-key',
      apiBase: 'https://modelmux.io/v1/',
      model: 'gpt-5.6-sol',
      timeoutMs: 150_000,
    }, new AbortController().signal)

    assert.equal(captured.url, 'https://modelmux.io/v1/responses')
    assert.equal(captured.body.model, 'gpt-5.6-sol')
    assert.equal(captured.body.tools[0].type, 'image_generation')
    assert.equal(captured.body.tools[0].size, '1536x1024')
    assert.equal(captured.body.tool_choice.type, 'image_generation')
    assert.deepEqual(captured.body.input[0].content.map((item) => item.type), [
      'input_text',
      'input_image',
      'input_image',
    ])
    assert.equal(result.imageBase64, 'aW1hZ2U=')
    assert.equal(result.mimeType, 'image/png')
    assert.equal(result.model, 'gpt-5.6-sol')
  } finally {
    globalThis.fetch = originalFetch
  }
})
