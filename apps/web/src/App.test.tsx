import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type EventSourceMessageHandler = ((event: MessageEvent<string>) => void) | null

type EventSourceErrorHandler = ((event: Event) => void) | null

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
import type { JobRecord, ProjectDetail, ProjectSummary, SourceRecord } from './types'

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
  ],
}

const recentLogsResponse = {
  entries: ['INFO songcraft.api: Health check requested', 'INFO songcraft.api: Refreshed logs'],
  total: 2,
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockEventSource.instances = []
    mockApi.listProjects.mockResolvedValue([projectSummary])
    mockApi.getProject.mockResolvedValue(projectDetail)
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
    mockApi.getRecentLogs.mockResolvedValue(recentLogsResponse)
  })

  it('renders project, source, and job timestamps', async () => {
    render(<App />)

    expect(await screen.findAllByText('Created: 2026-05-10T00:00:00Z')).toHaveLength(2)
    expect(screen.getAllByText('Updated: 2026-05-10T00:05:00Z')).toHaveLength(2)
    expect(screen.getByText('Submitted: 2026-05-10T00:01:00Z')).toBeInTheDocument()
    expect(screen.getByText('Queued at: 2026-05-10T00:03:00Z')).toBeInTheDocument()
  })

  it('renders lifecycle badges and guidance for active and terminal jobs', async () => {
    render(<App />)

    expect(await screen.findByText('2 jobs total')).toBeInTheDocument()
    expect(screen.getByText('1 active')).toBeInTheDocument()
    expect(screen.getByText('1 done')).toBeInTheDocument()
    expect(screen.getByText('Queued • waiting to start')).toBeInTheDocument()
    expect(screen.getByText('Completed • no further action')).toBeInTheDocument()
    expect(screen.getByText('Next transitions: running, failed')).toBeInTheDocument()
    expect(screen.getByText('No further transitions available.')).toBeInTheDocument()
  })

  it('renders source status badges, linked job summaries, and ingest sync guidance', async () => {
    render(<App />)

    expect(await screen.findByText('Submitted • awaiting processing')).toBeInTheDocument()
    expect(screen.getByText('2 linked jobs')).toBeInTheDocument()
    expect(screen.getByText('1 active • 1 done • 0 failed')).toBeInTheDocument()
    expect(screen.getByText('Latest job update: 2026-05-10T00:09:00Z')).toBeInTheDocument()
    expect(screen.getByText('Ingest jobs drive source status automatically.')).toBeInTheDocument()
    expect(
      screen.getByText('Use the job controls below for normal pipeline progress; only use source controls as a manual override.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply manual source override' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Manual source overrides unlock after the active ingest job reaches a terminal state.'),
    ).toBeInTheDocument()
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

    const statusSelect = await screen.findByLabelText('Update status for source src_123')
    expect(screen.getByText('Next source transitions: completed')).toBeInTheDocument()
    await user.selectOptions(statusSelect, 'completed')
    await user.click(screen.getByRole('button', { name: 'Apply manual source override' }))

    await waitFor(() => {
      expect(mockApi.updateSourceStatus).toHaveBeenCalledWith('proj_123', 'src_123', 'completed')
    })

    expect(await screen.findByText('Updated source src_123 to completed')).toBeInTheDocument()
  })

  it('renders a server log viewer and refreshes log entries on demand', async () => {
    const user = userEvent.setup()
    const refreshedLogs = {
      entries: ['INFO songcraft.api: Health check requested', 'WARN songcraft.api: Manual refresh triggered'],
      total: 2,
    }
    mockApi.getRecentLogs
      .mockResolvedValueOnce(recentLogsResponse)
      .mockResolvedValueOnce(refreshedLogs)

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
    mockApi.getRecentLogs
      .mockResolvedValueOnce(recentLogsResponse)
      .mockResolvedValueOnce(fallbackLogs)

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

    const statusSelect = await screen.findByLabelText('Update status for job job_123')
    await user.selectOptions(statusSelect, 'running')
    await user.click(screen.getByRole('button', { name: 'Apply status' }))

    await waitFor(() => {
      expect(mockApi.updateJobStatus).toHaveBeenCalledWith('proj_123', 'job_123', 'running')
    })

    expect(await screen.findByText('Updated job job_123 to running')).toBeInTheDocument()
    expect(await screen.findByText('Processing • work is in progress')).toBeInTheDocument()
  })
})
