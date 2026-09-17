import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The plan API runs inside the dev server, so `npm run dev` is still the only command
// needed and the browser never deals with a second origin. The key is read here, in the
// Node process — it is deliberately not a VITE_ variable, so it cannot reach the bundle.
function planApi() {
  let apiKey = process.env.GEMINI_API_KEY || null
  if (!apiKey) {
    try {
      const text = readFileSync(new URL('./.env', import.meta.url), 'utf8')
      apiKey = text.split('\n').find(line => line.startsWith('GEMINI_API_KEY='))?.slice('GEMINI_API_KEY='.length).trim() || null
    } catch { /* no .env: the handler falls back to the rule-based planner */ }
  }
  return {
    name: 'path2uni-plan-api',
    configureServer(server) {
      // Mounted without a path prefix on purpose: Connect strips the prefix from request.url
      // when you mount on one, so the check below would never match.
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url, 'http://localhost').pathname
        if (!path.startsWith('/api/')) return next()
        let body = ''
        request.on('data', chunk => { body += chunk })
        request.on('end', async () => {
          // Imported lazily so edits to the router are picked up without restarting Vite.
          const { route } = await server.ssrLoadModule('/server/routes.js')
          const result = await route({
            method: request.method, path, body,
            cookie: request.headers.cookie, userAgent: request.headers['user-agent'], apiKey,
            secure: false, // the dev server is plain http; a Secure cookie would be discarded
          }).catch(error => ({ status: 500, body: { error: String(error.message) } }))
          response.setHeader('Content-Type', 'application/json')
          for (const [key, value] of Object.entries(result.headers ?? {})) response.setHeader(key, value)
          response.statusCode = result.status
          response.end(JSON.stringify(result.body))
        })
      })
    },
  }
}

export default defineConfig({ plugins: [react(), planApi()] })
