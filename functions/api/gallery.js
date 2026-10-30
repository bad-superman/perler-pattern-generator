import { handleGalleryRequest } from '../../server/gallery/http.mjs'
import { createD1Store } from '../../server/gallery/d1-store.mjs'

function unavailable() {
  return new Response(JSON.stringify({ error: '图库还没有就绪' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function onRequest(context) {
  if (!context.env.GALLERY_DB) return unavailable()
  return handleGalleryRequest(context.request, createD1Store(context.env.GALLERY_DB), {
    adminToken: context.env.ADMIN_GALLERY_TOKEN,
  })
}
