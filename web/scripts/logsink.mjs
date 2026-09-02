import { createServer } from 'node:http'
import { appendFileSync } from 'node:fs'

const FILE = process.env.NAGARE_LOG ?? '/tmp/nagare-harness.log'

createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type')
  if (req.method === 'OPTIONS') return res.end()
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    try {
      const { line } = JSON.parse(body)
      appendFileSync(FILE, line + '\n')
    } catch {}
    res.end('ok')
  })
}).listen(3031, () => console.log('log sink on 3031 ->', FILE))
