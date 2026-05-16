import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type EventSourceMessageHandler = ((event: MessageEvent<string>) => void) | null

type EventSourceErrorHandler = ((event: Event) => void) | null

type SourceArtifactEntry = {
  path: string
  kind: 'file'
  size_bytes: number
  content_type: string
  stage: string
  role: string
  origin: string
  updated_at: string
  preview: string | null
}

type SourceArtifactsResponse = {
  project_id: string
  source_id: string
  entries: SourceArtifactEntry[]
}

class MockEventSource {
  static instances: MockEventSource[] = []

  onmessage: EventSourceMessageHandler = null
  onerror: EventSourceErrorHandler = null
  readonly url: string
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  emitMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>)
  }

  emitError() {
    this.onerror?.(new Event('error'))
  }
}

vi.stubGlobal('EventSource', MockEventSource)

import App from './App'
import { api } from './api'
import type { ProjectDetail, ProjectSummary, SourceRecord } from './types'

vi.mock('./api', () => ({
  api: {
    getApiBaseUrl: vi.fn(() => 'http://localhost:8000'),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    getProject: vi.fn(),
    createSource: vi.fn(),
    createJob: vi.fn(),
    updateSourceStatus: vi.fn(),
    updateJobStatus: vi.fn(),
    getSourceArtifacts: vi.fn(),
    getSourceArtifactContentUrl: vi.fn((projectId: string, sourceId: string, artifactPath: string) =>
      `http://localhost:8000/api/projects/${projectId}/sources/${sourceId}/artifacts/${artifactPath}/content`,
    ),
    getRecentLogs: vi.fn(),
  },
}))

const mockApi = vi.mocked(api)

const projectSummary: ProjectSummary = {
  id: 'proj_123',
  name: 'Demo Project',
  created_at: '2026-05-10T00:00:00Z',
  updated_at: '2026-05-10T00:05:00Z',
  source_count: 1,
  job_count: 1,
}

const sourceRecord: SourceRecord = {
  id: 'src_123',
  project_id: 'proj_123',
  kind: 'youtube',
  value: 'https://youtube.com/watch?v=demo123',
  status: 'submitted',
  created_at: '2026-05-10T00:01:00Z',
  updated_at: '2026-05-10T00:02:00Z',
}

const secondProjectSummary: ProjectSummary = {
  id: 'proj_456',
  name: 'Archive Project',
  created_at: '2026-05-09T00:00:00Z',
  updated_at: '2026-05-09T00:03:00Z',
  source_count: 0,
  job_count: 0,
}

const secondProjectDetail: ProjectDetail = {
  ...secondProjectSummary,
  sources: [],
  jobs: [],
}

const projectDetail: ProjectDetail = {
  ...projectSummary,
  sources: [sourceRecord],
  jobs: [
    {
      id: 'job_123',
      project_id: 'proj_123',
      source_id: 'src_123',
      job_type: 'ingest',
      status: 'queued',
      created_at: '2026-05-10T00:03:00Z',
      updated_at: '2026-05-10T00:04:00Z',
    },
    {
      id: 'job_456',
      project_id: 'proj_123',
      source_id: 'src_123',
      job_type: 'transcribe',
      status: 'completed',
      created_at: '2026-05-10T00:07:00Z',
      updated_at: '2026-05-10T00:09:00Z',
    },
    {
      id: 'job_789',
      project_id: 'proj_123',
      source_id: 'src_123',
      job_type: 'separate',
      status: 'completed',
      created_at: '2026-05-10T00:10:00Z',
      updated_at: '2026-05-10T00:11:00Z',
    },
  ],
}

const recentLogsResponse = {
  entries: ['INFO songcraft.api: Health check requested', 'INFO songcraft.api: Refreshed logs'],
  total: 2,
}

const sourceArtifactsResponse: SourceArtifactsResponse = {
  project_id: 'proj_123',
  source_id: 'src_123',
  entries: [
    {
      path: 'manifest.json',
      kind: 'file',
      size_bytes: 412,
      content_type: 'application/json',
      stage: 'ingest',
      role: 'manifest',
      origin: 'ingest_worker',
      updated_at: '2026-05-10T00:06:00Z',
      preview: '{"source_value":"https://youtube.com/watch?v=demo123","persisted_media_path":"source_reference.url"}',
    },
    {
      path: 'raw_source.txt',
      kind: 'file',
      size_bytes: 34,
      content_type: 'text/plain',
      stage: 'ingest',
      role: 'source_value',
      origin: 'submitted_source',
      updated_at: '2026-05-10T00:06:00Z',
      preview: 'https://youtube.com/watch?v=demo123',
    },
    {
      path: 'transcription/transcript.txt',
      kind: 'file',
      size_bytes: 146,
      content_type: 'text/plain',
      stage: 'transcribe',
      role: 'transcript_text',
      origin: 'transcribe_worker',
      updated_at: '2026-05-10T00:09:00Z',
      preview:
        'Transcript for source src_123 from youtube input.\nThis transcript was generated from persisted media using the real transcription backend.\nSongcraft.au and scribe reference.',
    },
    {
      path: 'separation/stems.json',
      kind: 'file',
      size_bytes: 228,
      content_type: 'application/json',
      stage: 'separate',
      role: 'stems_manifest',
      origin: 'separate_worker',
      updated_at: '2026-05-10T00:11:00Z',
      preview: '{"stems":[{"name":"vocals","status":"ready"},{"name":"instrumental","status":"ready"}]}',
    },
    {
      path: 'source_media/demo-source.wav',
      kind: 'file',
      size_bytes: 32,
      content_type: 'audio/x-wav',
      stage: 'ingest',
      role: 'source_media',
      origin: 'submitted_source',
      updated_at: '2026-05-10T00:06:00Z',
      preview: null,
    },
  ],
}

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useRealTimers()
    MockEventSource.instances = []
    mockApi.listProjects.mockResolvedValue([projectSummary, secondProjectSummary])
    mockApi.getProject.mockImplementation(async (projectId: string) =>
      projectId == 'proj_456' ? secondProjectDetail : projectDetail,
    )
    mockApi.createProject.mockResolvedValue(projectSummary)
    mockApi.createSource.mockResolvedValue(sourceRecord)
    mockApi.createJob.mockResolvedValue(projectDetail.jobs[0])
    mockApi.updateSourceStatus.mockResolvedValue({
      ...sourceRecord,
      status: 'processing',
      updated_at: '2026-05-10T00:06:30Z',
    })
    mockApi.updateJobStatus.mockResolvedValue({
      ...projectDetail.jobs[0],
      status: 'running',
      updated_at: '2026-05-10T00:06:00Z',
    })
    mockApi.getSourceArtifacts.mockResolvedValue(sourceArtifactsResponse)
    mockApi.getSourceArtifactContentUrl.mockImplementation(
      (projectId: string, sourceId: string, artifactPath: string) =>
        `http://localhost:8000/api/projects/${projectId}/sources/${sourceId}/artifacts/${artifactPath}/content`,
    )
    mockApi.getRecentLogs.mockResolvedValue(recentLogsResponse)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function openDemoProject(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /Open project Demo Project/i }))
    await screen.findByRole('heading', { name: 'Project details' })
  }

  it('renders a left sidebar with a projects navigation icon and project list view by default', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Projects navigation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Projects', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Choose a project to inspect its sources, jobs, and artifacts.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open project Demo Project/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open project Archive Project/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Project details' })).not.toBeInTheDocument()
  })

  it('drills into project details and returns to the projects list', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openDemoProject(user)

    expect(screen.getByRole('heading', { name: 'Project details' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to projects' })).toBeInTheDocument()
    expect(screen.getByText('Project ID: proj_123')).toBeInTheDocument()
    expect(screen.queryByText('Choose a project to inspect its sources, jobs, and artifacts.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to projects' }))

    expect(screen.getByRole('heading', { name: 'Projects', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Choose a project to inspect its sources, jobs, and artifacts.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Project details' })).not.toBeInTheDocument()
  })

  it('renders project, source, and job timestamps', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openDemoProject(user)

    expect(screen.getByText('Created: 2026-05-10T00:00:00Z')).toBeInTheDocument()
    expect(screen.getByText('Updated: 2026-05-10T00:05:00Z')).toBeInTheDocument()
    expect(screen.getByText('Submitted: 2026-05-10T00:01:00Z')).toBeInTheDocument()
    expect(screen.getByText('Queued at: 2026-05-10T00:03:00Z')).toBeInTheDocument()
  })

  it('renders lifecycle badges and guidance for active and terminal jobs', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openDemoProject(user)

    expect(screen.getByText('3 jobs total')).toBeInTheDocument()
    expect(screen.getByText('1 active')).toBeInTheDocument()
    expect(screen.getByText('2 done')).toBeInTheDocument()
    expect(screen.getByText('Queued • waiting to start')).toBeInTheDocument()
    expect(screen.getAllByText('Completed • no further action')).toHaveLength(2)
    expect(screen.getByText('Next transitions: running, failed')).toBeInTheDocument()
    expect(screen.getAllByText('No further transitions available.')).toHaveLength(2)
  })

  it('renders source status badges, linked job summaries, and ingest sync guidance', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openDemoProject(user)

    expect(screen.getByText('Submitted • awaiting processing')).toBeInTheDocument()
    expect(screen.getByText('3 linked jobs')).toBeInTheDocument()
    expect(screen.getByText('1 active • 2 done • 0 failed')).toBeInTheDocument()
    expect(screen.getByText('Latest job update: 2026-05-10T00:11:00Z')).toBeInTheDocument()
    expect(screen.getByText('Ingest jobs drive source status automatically.')).toBeInTheDocument()
    expect(
      screen.getByText('Use the job controls below for normal pipeline progress; only use source controls as a manual override.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply manual source override' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Manual source overrides unlock after the active ingest job reaches a terminal state.'),
    ).toBeInTheDocument()
  })

  it('updates source-ingest persistence guidance when the source type changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openDemoProject(user)

    expect(screen.getByText('Submitted • awaiting processing')).toBeInTheDocument()
    expect(
      screen.getByText('YouTube sources persist a source_reference.url pointer during ingest.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Source value')).toHaveAttribute('placeholder', 'https://youtube.com/watch?v=...')

    await user.selectOptions(screen.getByLabelText('Source type'), 'local_file')

    expect(
      screen.getByText('Local file sources are copied into source_media/<filename> during ingest.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Source value')).toHaveAttribute('placeholder', '/path/to/reference-track.wav')

    await user.selectOptions(screen.getByLabelText('Source type'), 'upload')

    expect(
      screen.getByText('Uploaded-file sources currently ingest from a local staging path and copy it into source_media/<filename>.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Source value')).toHaveAttribute('placeholder', '/path/to/upload-staging/source.wav')
  })

  it('offers source status transitions and updates the source after ingest completes', async () => {
    const user = userEvent.setup()
    mockApi.getProject.mockResolvedValue({
      ...projectDetail,
      jobs: [
        {
          ...projectDetail.jobs[0],
          status: 'completed',
          updated_at: '2026-05-10T00:10:00Z',
        },
        projectDetail.jobs[1],
      ],
    })
    render(<App />)

    await openDemoProject(user)

    const statusSelect = await screen.findByLabelText('Update status for source src_123')
    await user.selectOptions(statusSelect, 'processing')
    await user.click(screen.getByRole('button', { name: 'Apply manual source override' }))

    await waitFor(() => {
      expect(mockApi.updateSourceStatus).toHaveBeenCalledWith('proj_123', 'src_123', 'processing')
    })

    expect(await screen.findByText('Updated source src_123 to processing')).toBeInTheDocument()
  })

  it('keeps manual source overrides available after ingest fails', async () => {
    const user = userEvent.setup()
    mockApi.getProject.mockResolvedValue({
      ...projectDetail,
      sources: [
        {
          ...sourceRecord,
          status: 'failed',
          updated_at: '2026-05-10T00:10:00Z',
        },
      ],
      jobs: [
        {
          ...projectDetail.jobs[0],
          status: 'failed',
          updated_at: '2026-05-10T00:10:00Z',
        },
        projectDetail.jobs[1],
      ],
    })
    mockApi.updateSourceStatus.mockResolvedValue({
      ...sourceRecord,
      status: 'completed',
      updated_at: '2026-05-10T00:11:00Z',
    })
    render(<App />)

    await openDemoProject(user)

    const statusSelect = await screen.findByLabelText('Update status for source src_123')
    expect(screen.getByText('Next source transitions: completed')).toBeInTheDocument()
    await user.selectOptions(statusSelect, 'completed')
    await user.click(screen.getByRole('button', { name: 'Apply manual source override' }))

    await waitFor(() => {
      expect(mockApi.updateSourceStatus).toHaveBeenCalledWith('proj_123', 'src_123', 'completed')
    })

    expect(await screen.findByText('Updated source src_123 to completed')).toBeInTheDocument()
  })

  it('loads and displays source artifact previews on demand', async () => {
    const user = userEvent.setup()
    mockApi.getProject.mockResolvedValue({
      ...projectDetail,
      sources: [
        {
          ...sourceRecord,
          status: 'completed',
          updated_at: '2026-05-10T00:10:00Z',
        },
      ],
      jobs: [
        {
          ...projectDetail.jobs[0],
          status: 'completed',
          updated_at: '2026-05-10T00:07:00Z',
        },
        projectDetail.jobs[1],
        projectDetail.jobs[2],
      ],
    })
    render(<App />)

    await openDemoProject(user)
    await user.click(screen.getByRole('button', { name: 'Inspect artifacts for source src_123' }))

    await waitFor(() => {
      expect(mockApi.getSourceArtifacts).toHaveBeenCalledWith('proj_123', 'src_123')
    })

    expect(await screen.findByRole('heading', { name: 'Source artifacts' })).toBeInTheDocument()
    expect(screen.getByText('manifest.json')).toBeInTheDocument()
    expect(screen.getByText('application/json • 412 bytes')).toBeInTheDocument()
    expect(screen.getByText('Stage: ingest • Role: manifest')).toBeInTheDocument()
    expect(screen.getByText('Origin: ingest_worker • Updated: 2026-05-10T00:06:00Z')).toBeInTheDocument()
    expect(screen.getByText('raw_source.txt')).toBeInTheDocument()
    expect(screen.getByText('https://youtube.com/watch?v=demo123')).toBeInTheDocument()
    expect(screen.getByText('transcription/transcript.txt')).toBeInTheDocument()
    expect(screen.getByText(/Transcript for source src_123 from youtube input\./)).toBeInTheDocument()
    expect(screen.getByText(/This transcript was generated from persisted media using the real transcription backend\./)).toBeInTheDocument()
    expect(screen.getByText(/Songcraft\.au and scribe reference\./)).toBeInTheDocument()
    expect(screen.getByText('Stage: transcribe • Role: transcript_text')).toBeInTheDocument()
    expect(screen.getByText('Origin: transcribe_worker • Updated: 2026-05-10T00:09:00Z')).toBeInTheDocument()
    expect(screen.getByText('separation/stems.json')).toBeInTheDocument()
    expect(screen.getByText('Stage: separate • Role: stems_manifest')).toBeInTheDocument()
    expect(screen.getByText('Origin: separate_worker • Updated: 2026-05-10T00:11:00Z')).toBeInTheDocument()
    expect(screen.getByText('{"stems":[{"name":"vocals","status":"ready"},{"name":"instrumental","status":"ready"}]}')).toBeInTheDocument()
    expect(screen.getByText('source_media/demo-source.wav')).toBeInTheDocument()
    expect(screen.getByText('audio/x-wav • 32 bytes')).toBeInTheDocument()
    expect(screen.getByText('Stage: ingest • Role: source_media')).toBeInTheDocument()
    expect(screen.getByText('Binary artifact preview unavailable. Open the raw artifact to inspect its contents.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open raw artifact raw_source.txt' })).toHaveAttribute(
      'href',
      'http://localhost:8000/api/projects/proj_123/sources/src_123/artifacts/raw_source.txt/content',
    )
  })

  it('renders a server log viewer and refreshes log entries on demand', async () => {
    const user = userEvent.setup()
    const refreshedLogs = {
      entries: ['INFO songcraft.api: Health check requested', 'WARN songcraft.api: Manual refresh triggered'],
      total: 2,
    }
    mockApi.getRecentLogs.mockResolvedValueOnce(recentLogsResponse).mockResolvedValueOnce(refreshedLogs)

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Server logs' })).toBeInTheDocument()
    const logConsole = screen.getByLabelText('Recent server log lines')
    expect(logConsole).toHaveTextContent('INFO songcraft.api: Health check requested')
    expect(logConsole).toHaveTextContent('INFO songcraft.api: Refreshed logs')
    expect(screen.getByText('Showing 2 of 2 buffered log lines')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Refresh logs' }))

    await waitFor(() => {
      expect(mockApi.getRecentLogs).toHaveBeenCalledTimes(2)
      expect(screen.getByLabelText('Recent server log lines')).toHaveTextContent(
        'WARN songcraft.api: Manual refresh triggered',
      )
    })
  })

  it('streams new server log lines over SSE and falls back to manual refresh after stream errors', async () => {
    const user = userEvent.setup()
    const fallbackLogs = {
      entries: ['INFO songcraft.api: Health check requested', 'ERROR songcraft.api: Stream disconnected'],
      total: 2,
    }
    mockApi.getRecentLogs.mockResolvedValueOnce(recentLogsResponse).mockResolvedValueOnce(fallbackLogs)

    render(<App />)

    await screen.findByRole('heading', { name: 'Server logs' })
    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0].url).toBe('http://localhost:8000/api/logs/stream')

    await act(async () => {
      MockEventSource.instances[0].emitMessage('WARN songcraft.api: Live stream connected')
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Recent server log lines')).toHaveTextContent(
        'WARN songcraft.api: Live stream connected',
      )
    })

    await act(async () => {
      MockEventSource.instances[0].emitError()
    })

    await waitFor(() => {
      expect(screen.getByText('Live stream disconnected. Use Refresh logs to retry.')).toBeInTheDocument()
      expect(MockEventSource.instances[0].closed).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: 'Refresh logs' }))

    await waitFor(() => {
      expect(mockApi.getRecentLogs).toHaveBeenCalledTimes(2)
      expect(screen.getByLabelText('Recent server log lines')).toHaveTextContent(
        'ERROR songcraft.api: Stream disconnected',
      )
    })
  })

  it('auto-refreshes project detail through ingest and transcribe completion', async () => {
    vi.useFakeTimers()

    mockApi.getProject
      .mockResolvedValueOnce({
        ...projectDetail,
        jobs: [
          {
            ...projectDetail.jobs[0],
            status: 'queued',
            updated_at: '2026-05-10T00:04:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        ...projectDetail,
        sources: [
          {
            ...sourceRecord,
            status: 'processing',
            updated_at: '2026-05-10T00:06:00Z',
          },
        ],
        jobs: [
          {
            ...projectDetail.jobs[0],
            status: 'running',
            updated_at: '2026-05-10T00:06:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        ...projectDetail,
        sources: [
          {
            ...sourceRecord,
            status: 'completed',
            updated_at: '2026-05-10T00:07:00Z',
          },
        ],
        jobs: [
          {
            ...projectDetail.jobs[0],
            status: 'completed',
            updated_at: '2026-05-10T00:07:00Z',
          },
          {
            ...projectDetail.jobs[1],
            status: 'queued',
            created_at: '2026-05-10T00:07:30Z',
            updated_at: '2026-05-10T00:07:30Z',
          },
        ],
      })
      .mockResolvedValue({
        ...projectDetail,
        sources: [
          {
            ...sourceRecord,
            status: 'completed',
            updated_at: '2026-05-10T00:08:00Z',
          },
        ],
        jobs: [
          {
            ...projectDetail.jobs[0],
            status: 'completed',
            updated_at: '2026-05-10T00:07:00Z',
          },
          {
            ...projectDetail.jobs[1],
            status: 'completed',
            updated_at: '2026-05-10T00:08:00Z',
          },
        ],
      })

    render(<App />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      screen.getByRole('button', { name: /Open project Demo Project/i }).click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { name: 'Project details' })).toBeInTheDocument()
    expect(screen.getByText('Queued • waiting to start')).toBeInTheDocument()
    expect(mockApi.getProject).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockApi.getProject).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Running • currently processing')).toBeInTheDocument()
    expect(screen.getByText('Processing • work is in progress')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockApi.getProject).toHaveBeenCalledTimes(3)
    expect(screen.getByText('2 linked jobs')).toBeInTheDocument()
    expect(screen.getByText('1 active • 1 done • 0 failed')).toBeInTheDocument()
    expect(screen.getByText('Update status for job job_456')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockApi.getProject).toHaveBeenCalledTimes(4)
    expect(screen.getAllByText('Completed • no further action')).toHaveLength(2)
    expect(screen.getByText('2 linked jobs')).toBeInTheDocument()
    expect(screen.getByText('0 active • 2 done • 0 failed')).toBeInTheDocument()
    expect(screen.getByText('Latest job update: 2026-05-10T00:08:00Z')).toBeInTheDocument()
  }, 15000)

  it('offers valid job status transitions and updates the job', async () => {
    const user = userEvent.setup()
    mockApi.getProject
      .mockResolvedValueOnce(projectDetail)
      .mockResolvedValueOnce({
        ...projectDetail,
        sources: [
          {
            ...sourceRecord,
            status: 'processing',
            updated_at: '2026-05-10T00:06:00Z',
          },
        ],
        jobs: [
          {
            ...projectDetail.jobs[0],
            status: 'running',
            updated_at: '2026-05-10T00:06:00Z',
          },
          projectDetail.jobs[1],
        ],
      })
    render(<App />)

    await openDemoProject(user)

    const statusSelect = await screen.findByLabelText('Update status for job job_123')
    await user.selectOptions(statusSelect, 'running')
    await user.click(screen.getByRole('button', { name: 'Apply status' }))

    await waitFor(() => {
      expect(mockApi.updateJobStatus).toHaveBeenCalledWith('proj_123', 'job_123', 'running')
    })

    expect(await screen.findByText('Updated job job_123 to running')).toBeInTheDocument()
    expect(await screen.findByText('Running • currently processing')).toBeInTheDocument()
    expect(await screen.findByText('Processing • work is in progress')).toBeInTheDocument()
  })
})
