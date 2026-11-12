import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePaidSiteOrigin } from './config.mjs'

const request = new Request('https://project.pages.dev/api/admin/passes')

test('paid links use the current request origin when no custom origin is configured', () => {
  assert.equal(resolvePaidSiteOrigin({}, request), 'https://project.pages.dev')
  assert.equal(resolvePaidSiteOrigin({ PAID_SITE_ORIGIN: '   ' }, request), 'https://project.pages.dev')
})

test('paid links use the configured custom origin', () => {
  assert.equal(resolvePaidSiteOrigin({ PAID_SITE_ORIGIN: 'https://pro.example.com/' }, request), 'https://pro.example.com')
  assert.equal(resolvePaidSiteOrigin({ PAID_SITE_ORIGIN: 'pro.example.com' }, request), 'https://pro.example.com')
})

test('paid link origin rejects unsupported protocols', () => {
  assert.throws(
    () => resolvePaidSiteOrigin({ PAID_SITE_ORIGIN: 'ftp://files.example.com' }, request),
    /HTTP 或 HTTPS/,
  )
})
