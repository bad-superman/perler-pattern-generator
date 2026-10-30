import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PALETTE_SIZES } from './limits.mjs'
import { createMemoryStore } from './memory-store.mjs'
import { handleGalleryRequest } from './http.mjs'
import { beadCodesToPaletteIndices } from '../../src/gallery/paletteIndex.ts'
import { validateShare } from './validate.mjs'

function countPaletteEntries(file) {
  return (readFileSync(file, 'utf8').match(/^\s+\['/gm) || []).length
}

function pattern(overrides = {}) {
  return {
    nickname: '阿豆',
    brand: 'mard',
    cols: 2,
    rows: 2,
    mirrored: false,
    cells: [0, 1, 1, -1],
    ...overrides,
  }
}

async function postShare(store, body, ip = '1.1.1.1', token = 'secret') {
  return handleGalleryRequest(new Request('http://local/api/gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), store, { adminToken: token, ip, now: 1_700_000_000_000 })
}

test('palette sizes stay aligned with the bead catalogs', () => {
  assert.equal(PALETTE_SIZES.mard, countPaletteEntries(new URL('../../src/palettes/mard221.ts', import.meta.url)))
  assert.equal(PALETTE_SIZES.hama, countPaletteEntries(new URL('../../src/palettes/hama.ts', import.meta.url)))
})

test('a reduced-palette index is stored as the bead code’s catalog index', () => {
  const text = readFileSync(new URL('../../src/palettes/mard221.ts', import.meta.url), 'utf8')
  const codes = [...text.matchAll(/\['([^']+)'/g)].map((match) => match[1])
  const h07 = codes.indexOf('H07')
  assert.ok(h07 > 20)
  assert.deepEqual(
    beadCodesToPaletteIndices(codes, [
      { colorIndex: 0, symbol: 'H07' },
      { colorIndex: 1, symbol: 'A01' },
      { colorIndex: -1, symbol: '' },
    ]),
    [h07, 0, -1],
  )
})

test('validateShare accepts a pattern from the site palette', async () => {
  const result = await validateShare(pattern())
  assert.equal(result.ok, true)
  assert.equal(result.value.colorCount, 2)
  assert.equal(result.value.nickname, '阿豆')
  assert.equal(result.value.contentHash.length, 64)
})

test('validateShare rejects anything that is not a site pattern', async () => {
  const cases = [
    pattern({ nickname: '  ' }),
    pattern({ nickname: '一二三四五六七八九十一二三四五六七' }),
    pattern({ brand: 'other' }),
    pattern({ cols: 0 }),
    pattern({ cols: 209 }),
    pattern({ cells: [0, 1] }),
    pattern({ cells: [0, 1, 999, -1] }),
    pattern({ cells: [-1, -1, -1, -1] }),
    pattern({ mirrored: 'yes' }),
  ]
  const tooMany = pattern({
    cols: 8,
    rows: 8,
    cells: Array.from({ length: 64 }, (_, index) => index % 51),
  })
  for (const input of [...cases, tooMany]) {
    const result = await validateShare(input)
    assert.equal(result.ok, false, JSON.stringify(input))
  }
})

test('a share stays pending until an admin approves it', async () => {
  const store = createMemoryStore()
  const created = await postShare(store, pattern())
  assert.equal(created.status, 201)
  const createdBody = await created.json()

  const hidden = await handleGalleryRequest(new Request('http://local/api/gallery?page=1&pageSize=18'), store, { adminToken: 'secret' })
  const hiddenBody = await hidden.json()
  assert.equal(hiddenBody.total, 0)

  const approved = await handleGalleryRequest(new Request(`http://local/api/admin/gallery/${createdBody.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
    body: JSON.stringify({ status: 'approved' }),
  }), store, { adminToken: 'secret', now: 1_700_000_100_000 })
  assert.equal(approved.status, 200)

  const listed = await handleGalleryRequest(new Request('http://local/api/gallery?page=1&pageSize=18'), store, { adminToken: 'secret' })
  const listedBody = await listed.json()
  assert.equal(listedBody.total, 1)
  assert.equal(listedBody.items[0].nickname, '阿豆')
  assert.equal(listedBody.items[0].cells.length, 4)
})

test('public list is paged and ignores page sizes above 18', async () => {
  const store = createMemoryStore()
  for (let index = 0; index < 20; index += 1) {
    const response = await postShare(store, pattern({ nickname: `豆${index}`, cells: [index, 1, 1, -1] }), `10.0.0.${index}`)
    const body = await response.json()
    await handleGalleryRequest(new Request(`http://local/api/admin/gallery/${body.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: JSON.stringify({ status: 'approved' }),
    }), store, { adminToken: 'secret', now: 1_700_000_100_000 + index })
  }
  const page = await handleGalleryRequest(new Request('http://local/api/gallery?page=2&pageSize=40'), store, { adminToken: 'secret' })
  const body = await page.json()
  assert.equal(body.pageSize, 18)
  assert.equal(body.page, 2)
  assert.equal(body.total, 20)
  assert.equal(body.items.length, 2)
})

test('the same pattern and the sixth share from one address are refused', async () => {
  const store = createMemoryStore()
  assert.equal((await postShare(store, pattern())).status, 201)
  assert.equal((await postShare(store, pattern())).status, 409)
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await postShare(store, pattern({ cells: [index + 2, 1, 1, -1] }))).status, 201)
  }
  assert.equal((await postShare(store, pattern({ cells: [8, 1, 1, -1] }))).status, 429)
})

test('admin can rename, hide, reject, and delete', async () => {
  const store = createMemoryStore()
  const created = await (await postShare(store, pattern())).json()
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer secret' }
  const rename = await handleGalleryRequest(new Request(`http://local/api/admin/gallery/${created.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ nickname: '小满' }),
  }), store, { adminToken: 'secret' })
  assert.equal((await rename.json()).nickname, '小满')

  await handleGalleryRequest(new Request(`http://local/api/admin/gallery/${created.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'approved' }),
  }), store, { adminToken: 'secret', now: 1_700_000_100_000 })
  await handleGalleryRequest(new Request(`http://local/api/admin/gallery/${created.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'hidden' }),
  }), store, { adminToken: 'secret' })
  const hidden = await (await handleGalleryRequest(new Request('http://local/api/gallery'), store, { adminToken: 'secret' })).json()
  assert.equal(hidden.total, 0)

  const removed = await handleGalleryRequest(new Request(`http://local/api/admin/gallery/${created.id}`, { method: 'DELETE', headers }), store, { adminToken: 'secret' })
  assert.equal(removed.status, 200)
  const queue = await (await handleGalleryRequest(new Request('http://local/api/admin/gallery?status=hidden', { headers }), store, { adminToken: 'secret' })).json()
  assert.equal(queue.items.length, 0)
})

test('admin routes reject a missing or wrong token', async () => {
  const store = createMemoryStore()
  const missing = await handleGalleryRequest(new Request('http://local/api/admin/gallery'), store, {})
  assert.equal(missing.status, 503)
  const wrong = await handleGalleryRequest(new Request('http://local/api/admin/gallery', {
    headers: { Authorization: 'Bearer no' },
  }), store, { adminToken: 'secret' })
  assert.equal(wrong.status, 401)
})
