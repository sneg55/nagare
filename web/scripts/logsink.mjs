import { createServer } from 'node:http'
import { appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'

const FILE = process.env.NAGARE_LOG ?? '/tmp/nagare-harness.log'
const KEYS = '/tmp/nagare-keys.json'

createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type')
  if (req.method === 'OPTIONS') return res.end()

  if (req.url === '/keys' && req.method === 'GET') {
    res.setHeader('content-type', 'application/json')
    return res.end(existsSync(KEYS) ? readFileSync(KEYS, 'utf8') : '{}')
  }

  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    if (req.url === '/keys') {
      writeFileSync(KEYS, body)
      appendFileSync(FILE, `[sink] stored ${Object.keys(JSON.parse(body || '{}')).length} keys\n`)
      return res.end('ok')
    }
    try {
      appendFileSync(FILE, JSON.parse(body).line + '\n')
    } catch {}
    res.end('ok')
  })
}).listen(3031, () => console.log('log sink on 3031 ->', FILE))
