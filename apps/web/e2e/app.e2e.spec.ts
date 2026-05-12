import { test, expect } from '@playwright/test'

test.describe('songcraft baseline workflows', () => {
  test('happy path: ingest progresses from queued to completed', async ({ page }) => {
    const projectName = `E2E Happy Path ${Date.now()}`
    const sourceValue = `https://youtube.com/watch?v=happy${Date.now()}`

    await page.goto('/')

    await page.getByLabel('Project name').fill(projectName)
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByText(`Created project ${projectName}`)).toBeVisible()

    await page.getByLabel('Source value').fill(sourceValue)
    await page.getByRole('button', { name: 'Submit source and queue ingest job' }).click()
    await expect(page.getByText('Submitted youtube source for ingest')).toBeVisible()

    await expect(page.getByText('Manual source overrides unlock after the active ingest job reaches a terminal state.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply manual source override' })).toHaveCount(0)

    await expect.poll(async () => {
      return {
        sourceCompleted: await page.getByText('Completed • ready for downstream steps').count(),
        jobCompleted: await page.getByText('Completed • no further action').count(),
        applyStatusButtons: await page.getByRole('button', { name: 'Apply status' }).count(),
      }
    }).toEqual({
      sourceCompleted: 1,
      jobCompleted: 1,
      applyStatusButtons: 0,
    })

    await expect(page.getByText('No further transitions available.')).toBeVisible()
  })

  test('failure recovery path: failed ingest unlocks manual source recovery', async ({ page }) => {
    const projectName = `E2E Failure Path ${Date.now()}`
    const sourceValue = `https://youtube.com/watch?v=fail${Date.now()}`

    await page.goto('/')

    await page.getByLabel('Project name').fill(projectName)
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByText(`Created project ${projectName}`)).toBeVisible()

    await page.getByLabel('Source value').fill(sourceValue)
    await page.getByRole('button', { name: 'Submit source and queue ingest job' }).click()
    await expect(page.getByText('Submitted youtube source for ingest')).toBeVisible()

    await expect.poll(async () => ({
      failedBadgeCount: await page.locator('.status-badge.status-failed').count(),
      sourceOverrideCount: await page.getByRole('button', { name: 'Apply manual source override' }).count(),
      completedBadgeCount: await page.getByText('Completed • no further action').count(),
    })).toEqual({
      failedBadgeCount: 2,
      sourceOverrideCount: 1,
      completedBadgeCount: 0,
    })

    const sourceStatusSelect = page.getByLabel(/Update status for source src_/)
    await expect(sourceStatusSelect).toBeVisible()
    await expect(page.getByText('Next source transitions: completed')).toBeVisible()
    await sourceStatusSelect.selectOption('completed')
    await page.getByRole('button', { name: 'Apply manual source override' }).click()
    await expect(page.getByText(/Updated source .* to completed/)).toBeVisible()
    await expect(page.getByText('Completed • ready for downstream steps')).toBeVisible()
  })

  test('log viewer streams new health-check lines and supports manual refresh fallback', async ({ page, request }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Server logs' })).toBeVisible()
    const logConsole = page.getByLabel('Recent server log lines')
    await expect(logConsole).toContainText('Health check requested')

    const baselineText = await logConsole.textContent()
    await request.get('http://127.0.0.1:8000/api/health')

    await expect.poll(async () => await logConsole.textContent()).not.toBe(baselineText)
    await expect(logConsole).toContainText('Health check requested')

    await page.getByRole('checkbox', { name: 'Auto-refresh' }).uncheck()
    await page.getByRole('button', { name: 'Refresh logs' }).click()
    await expect(logConsole).toContainText('Health check requested')
  })
})
