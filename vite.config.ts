import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
// Plain JS modules shared with the Pages function. Types live in the tests.
// @ts-expect-error no declaration file for the gallery HTTP handler
import { handleGalleryRequest } from './server/gallery/http.mjs'
// @ts-expect-error no declaration file for the local gallery store
import { createFileStore } from './server/gallery/file-store.mjs'

function claritySnippet(projectId: string | undefined): Plugin {
  return {
    name: 'clarity-snippet',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!projectId || ctx.server) return html
        const snippet = `    <script type="text/javascript">
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${projectId}");
    </script>`
        return html.replace('</head>', `${snippet}\n  </head>`)
      },
    },
  }
}

function galleryDevApi(adminToken: string): Plugin {
  const store = createFileStore(fileURLToPath(new URL('./.wrangler/gallery-dev.json', import.meta.url)))
  return {
    name: 'gallery-dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''
        if (!url.startsWith('/api/gallery') && !url.startsWith('/api/admin/gallery')) {
          next()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          void (async () => {
            const body = Buffer.concat(chunks)
            const headers = new Headers()
            for (const [key, value] of Object.entries(req.headers)) {
              if (value == null || key === 'host' || key === 'content-length') continue
              headers.set(key, Array.isArray(value) ? value.join(', ') : value)
            }
            const request = new Request(`http://${req.headers.host || '127.0.0.1'}${url}`, {
              method: req.method,
              headers,
              body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
            })
            const response = await handleGalleryRequest(request, store, { adminToken })
            res.statusCode = response.status
            response.headers.forEach((value: string, key: string) => res.setHeader(key, value))
            res.end(Buffer.from(await response.arrayBuffer()))
          })().catch(next)
        })
      })
    },
  }
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), claritySnippet(env.VITE_CLARITY_PROJECT_ID), galleryDevApi(env.ADMIN_GALLERY_TOKEN || 'dev-gallery-admin')],
    server: {
      proxy: {
        '/api/agnes': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
  }
})
