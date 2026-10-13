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

test('creates a Markdown file from the workspace button', async ({ page }) => {
  await page.goto('/')
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt')
    await dialog.accept('notes/버그 수정 확인')
  })
  await page.getByRole('button', { name: '새 Markdown 파일' }).click()
  await expect(page.getByRole('button', { name: '버그 수정 확인.md', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '버그 수정 확인' })).toBeVisible()
})

test('switches a document containing a br tag to visual editing mode', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('writree.demo.README.md', '# 줄바꿈 확인\n\n* 테스트\n* <br />\n')
  })
  await page.goto('/')
  await page.getByRole('button', { name: /README\.md/ }).click()
  await expect(page.getByRole('heading', { name: '줄바꿈 확인' })).toBeVisible()
  await page.getByRole('button', { name: '소스' }).click()
  await expect(page.locator('.cm-editor')).toBeVisible()
  await page.getByRole('button', { name: '편집', exact: true }).click()
  await expect(page.getByTestId('wysiwyg-editor')).toBeVisible()
  await expect(page.getByRole('heading', { name: '줄바꿈 확인' })).toBeVisible()
  await expect(page.getByTestId('wysiwyg-editor').locator('.ProseMirror')).toHaveCount(1)
})
