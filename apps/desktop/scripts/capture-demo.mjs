import { chromium } from '@playwright/test'
import gifenc from 'gifenc'
import { PNG } from 'pngjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const { GIFEncoder, applyPalette, quantize } = gifenc

const output = resolve('../../docs/assets')
await mkdir(output, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1000, height: 633 },
  colorScheme: 'light',
})
const page = await context.newPage()
const frames = []
async function capture(delay = 850) {
  frames.push({ image: PNG.sync.read(await page.screenshot()), delay })
}

await page.goto('http://127.0.0.1:1420')
await page.getByRole('button', { name: 'Writree Demo', exact: true }).waitFor()
await capture(1200)
await page.getByRole('button', { name: '소스' }).click()
await capture()
await page.getByRole('button', { name: '편집', exact: true }).click()
await capture()
await page.locator('button[title="Git"]').click()
await page.locator('button[title="diff 보기"]').click()
await capture(1200)
await page.locator('button[title="테마 전환"]').click()
await capture(1100)
await page.locator('button[title="문서 개요"]').click()
await capture(1200)
await context.close()
await browser.close()

const gif = GIFEncoder()
for (const [index, frame] of frames.entries()) {
  const palette = quantize(frame.image.data, 128, { format: 'rgb444' })
  const pixels = applyPalette(frame.image.data, palette, 'rgb444')
  gif.writeFrame(pixels, frame.image.width, frame.image.height, {
    palette,
    delay: frame.delay,
    repeat: index === 0 ? 0 : undefined,
  })
}
gif.finish()
await writeFile(resolve(output, 'writree-demo.gif'), gif.bytes())
