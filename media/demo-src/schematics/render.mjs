import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '..', 'schematics')
fs.mkdirSync(OUT, { recursive: true })

const stage = 'file://' + path.join(__dirname, 'stage.html')
const SHEETS = ['flow', 'vesting', 'keys']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
try {
  await page.goto(stage, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  for (const id of SHEETS) {
    const dest = path.join(OUT, `${id}.png`)
    await page.locator(`#${id}`).screenshot({ path: dest })
    console.log(`  ${id} -> ${path.relative(path.join(__dirname, '..', '..', '..'), dest)}`)
  }
} catch (e) {
  console.error('render failed:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
