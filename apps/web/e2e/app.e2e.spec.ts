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

    await expect(page.getByText('Submitted • awaiting processing')).toBeVisible()
    await expect(page.getByText('Queued • waiting to start')).toBeVisible()
    await expect(
      page.getByText('Manual source overrides unlock after the active ingest job reaches a terminal state.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply manual source override' })).toHaveCount(0)

    const jobStatusSelect = page.getByLabel(/Update status for job job_/)
    await jobStatusSelect.selectOption('running')
    await page.getByRole('button', { name: 'Apply status' }).click()
    await expect(page.getByText(/Updated job .* to running/)).toBeVisible()
    await expect(page.getByText('Processing • work is in progress')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply manual source override' })).toHaveCount(0)

    await jobStatusSelect.selectOption('completed')
    await page.getByRole('button', { name: 'Apply status' }).click()
    await expect(page.getByText(/Updated job .* to completed/)).toBeVisible()
    await expect(page.getByText('Completed • ready for downstream steps')).toBeVisible()
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
    await expect(page.getByRole('button', { name: 'Apply manual source override' })).toHaveCount(0)

    const jobStatusSelect = page.getByLabel(/Update status for job job_/)
    await jobStatusSelect.selectOption('failed')
    await page.getByRole('button', { name: 'Apply status' }).click()
    await expect(page.getByText(/Updated job .* to failed/)).toBeVisible()
    await expect(page.locator('.status-badge.status-failed').first()).toBeVisible()

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
