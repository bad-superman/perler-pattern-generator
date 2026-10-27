import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), claritySnippet(env.VITE_CLARITY_PROJECT_ID)],
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
