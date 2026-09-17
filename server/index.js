// Standalone API server, for running the app outside `npm run dev`.
// In development the same router is mounted into Vite (see vite.config.js), so there is
// one code path and no second process to remember.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import './env.js'
import { route } from './routes.js'

const apiKey = process.env.GEMINI_API_KEY || null
const port = Number(process.env.PORT || 8787)

// Serving the built frontend from this same origin is what makes cookie auth work without
// CORS. A wildcard Access-Control-Allow-Origin cannot carry credentials anyway, so a
// cross-origin split would need an explicit allowlist — same origin is simpler and safer.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

async function serveStatic(path, response) {
  // normalize + the prefix check keep `..` from escaping dist/.
  const target = normalize(join(DIST, path === '/' ? 'index.html' : path))
  if (!target.startsWith(DIST)) { response.writeHead(403).end(); return true }
  try {
    const info = await stat(target)
    if (info.isDirectory()) return false
    response.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' })
    response.end(await readFile(target))
    return true
  } catch { return false }
}

createServer((request, response) => {
  const send = ({ status, body, headers = {} }) => {
    response.writeHead(status, { 'Content-Type': 'application/json', ...headers })
    response.end(JSON.stringify(body))
  }
  const path = new URL(request.url, 'http://localhost').pathname

  if (!path.startsWith('/api/')) {
    if (request.method !== 'GET') return send({ status: 405, body: { error: 'Method not allowed' } })
    serveStatic(path, response).then(async served => {
      if (served) return
      // Single-page app: unknown paths fall back to index.html.
      try { response.writeHead(200, { 'Content-Type': TYPES['.html'] }); response.end(await readFile(join(DIST, 'index.html'))) }
      catch { send({ status: 404, body: { error: 'Not found. Run `npm run build` first.' } }) }
    })
    return
  }

  let body = ''
  request.on('data', chunk => { body += chunk; if (body.length > 64_000) request.destroy() })
  request.on('end', () => {
    route({
      method: request.method, path, body,
      cookie: request.headers.cookie, userAgent: request.headers['user-agent'], apiKey,
      // Behind a terminating proxy the socket is plain http, so the header is the only
      // signal. Trust it only when TRUST_PROXY is set — otherwise any client could claim
      // TLS and talk the server into issuing Secure cookies it will never send back.
      secure: request.socket.encrypted === true
        || (process.env.TRUST_PROXY === '1' && request.headers['x-forwarded-proto'] === 'https'),
    })
      .then(send)
      .catch(error => send({ status: 500, body: { error: String(error.message) } }))
  })
}).listen(port, () => {
  console.log(`path2uni on http://localhost:${port}`)
  console.log(apiKey ? 'GEMINI_API_KEY loaded' : 'no GEMINI_API_KEY — plans fall back to the rule-based planner')
})
