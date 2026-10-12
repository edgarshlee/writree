import { expect, test } from '@playwright/test'

test('opens the demo workspace and switches editor modes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Writree Demo', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible()
  await page.getByRole('button', { name: '소스' }).click()
  await expect(page.locator('.cm-editor')).toBeVisible()
  await page.getByRole('button', { name: 'Git', exact: true }).click()
  await expect(page.locator('button[title="diff 보기"]')).toContainText('README.md')
})
