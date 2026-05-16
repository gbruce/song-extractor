import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { test, expect, type Page } from '@playwright/test'

function createWavFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'songcraft-e2e-'))
  const filePath = join(dir, 'fixture.wav')
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16000, 24)
  header.writeUInt32LE(32000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(0, 40)
  writeFileSync(filePath, header)
  return filePath
}

test.describe('songcraft baseline workflows', () => {
  async function createProjectAndOpenDetails(page: Page, projectName: string) {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
    await page.getByLabel('Project name').fill(projectName)
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByText(`Created project ${projectName}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Project details' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back to projects' })).toBeVisible()
  }

  test('submit-source form updates persistence guidance for local-file ingest', async ({ page }) => {
    const projectName = `E2E Guidance ${Date.now()}`
    await createProjectAndOpenDetails(page, projectName)

    await expect(
      page.getByText('YouTube sources persist a source_reference.url pointer during ingest.'),
    ).toBeVisible()
    await expect(page.getByLabel('Source value')).toHaveAttribute('placeholder', 'https://youtube.com/watch?v=...')

    await page.getByLabel('Source type').selectOption('local_file')
    await expect(
      page.getByText('Local file sources are copied into source_media/<filename> during ingest.'),
    ).toBeVisible()
    await expect(page.getByLabel('Source value')).toHaveAttribute('placeholder', '/path/to/reference-track.wav')

    await page.getByLabel('Source type').selectOption('upload')
    await expect(
      page.getByText('Uploaded-file sources currently ingest from a local staging path and copy it into source_media/<filename>.'),
    ).toBeVisible()
    await expect(page.getByLabel('Source value')).toHaveAttribute('placeholder', '/path/to/upload-staging/source.wav')
  })

  test('happy path: ingest auto-queues and completes transcribe after persistence', async ({ page, request }) => {
    const projectName = `E2E Happy Path ${Date.now()}`
    const localFixture = createWavFixture()

    await createProjectAndOpenDetails(page, projectName)

    await page.getByLabel('Source type').selectOption('local_file')
    await expect(
      page.getByText('Local file sources are copied into source_media/<filename> during ingest.'),
    ).toBeVisible()
    await expect(page.getByLabel('Source value')).toHaveAttribute('placeholder', '/path/to/reference-track.wav')

    await page.getByLabel('Source value').fill(localFixture)
    await page.getByRole('button', { name: 'Submit source and queue ingest job' }).click()
    await expect(page.getByText('Submitted local_file source for ingest')).toBeVisible()

    await expect(page.getByText('Manual source overrides unlock after the active ingest job reaches a terminal state.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply manual source override' })).toHaveCount(0)

    await expect.poll(async () => {
      return {
        sourceCompleted: await page.getByText('Completed • ready for downstream steps').count(),
        completedJobBadges: await page.getByText('Completed • no further action').count(),
        transcribeJobs: await page.getByText(/transcribe — source src_/).count(),
        applyStatusButtons: await page.getByRole('button', { name: 'Apply status' }).count(),
      }
    }).toEqual({
      sourceCompleted: 1,
      completedJobBadges: 3,
      transcribeJobs: 1,
      applyStatusButtons: 0,
    })

    await expect(page.getByText('3 linked jobs')).toBeVisible()
    await expect(page.getByText('0 active • 3 done • 0 failed')).toBeVisible()
    await expect(page.getByText('transcribe — source', { exact: false })).toBeVisible()
    await expect(page.getByText('No further transitions available.')).toHaveCount(3)

    await page.getByRole('button', { name: /Inspect artifacts for source src_/ }).click()
    await expect(page.getByRole('heading', { name: 'Source artifacts' })).toBeVisible()
    await expect(page.getByText('manifest.json', { exact: true })).toBeVisible()
    await expect(page.getByText('raw_source.txt', { exact: true })).toBeVisible()
    await expect(page.getByText(`source_media/${basename(localFixture)}`, { exact: true })).toBeVisible()
    await expect(page.getByText('transcription/transcript.txt', { exact: true })).toBeVisible()
    await expect(page.getByText('transcription/transcript.json', { exact: true })).toBeVisible()
    await expect(page.getByText('separation/stems.json', { exact: true })).toBeVisible()
    await expect(page.getByText('Stage: ingest • Role: manifest')).toBeVisible()
    await expect(page.getByText('Origin: ingest_worker', { exact: false })).toBeVisible()
    await expect(page.getByText('Stage: transcribe • Role: transcript_text')).toBeVisible()
    await expect(page.getByText('Origin: transcribe_worker', { exact: false })).toHaveCount(2)
    await expect(page.getByText('Stage: separate • Role: stems_manifest')).toBeVisible()
    await expect(page.getByText('Origin: separate_worker', { exact: false })).toHaveCount(3)
    await expect(page.getByText('Origin: submitted_source', { exact: false })).toHaveCount(2)
    await expect(page.getByLabel('Artifact preview for separation/stems.json')).toContainText('vocals')
    await expect(page.getByLabel('Artifact preview for raw_source.txt')).toContainText(localFixture)
    await expect(page.getByLabel('Artifact preview for transcription/transcript.txt')).toContainText('This transcript was generated from persisted media using the real transcription backend.')

    const rawArtifactLink = page.getByRole('link', { name: 'Open raw artifact raw_source.txt' })
    await expect(rawArtifactLink).toBeVisible()
    const rawArtifactHref = await rawArtifactLink.getAttribute('href')
    expect(rawArtifactHref).toBeTruthy()
    const rawArtifactResponse = await request.get(rawArtifactHref!)
    expect(rawArtifactResponse.ok()).toBeTruthy()
    await expect(rawArtifactResponse.text()).resolves.toContain(localFixture)
  })

  test('failure recovery path: failed ingest unlocks manual source recovery', async ({ page }) => {
    const projectName = `E2E Failure Path ${Date.now()}`
    const sourceValue = `https://youtube.com/watch?v=fail${Date.now()}`

    await createProjectAndOpenDetails(page, projectName)

    await expect(
      page.getByText('YouTube sources persist a source_reference.url pointer during ingest.'),
    ).toBeVisible()

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
