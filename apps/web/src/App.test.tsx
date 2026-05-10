import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { api } from './api'
import type { ProjectDetail, ProjectSummary } from './types'

vi.mock('./api', () => ({
  api: {
    getApiBaseUrl: vi.fn(() => 'http://localhost:8000'),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    getProject: vi.fn(),
    createSource: vi.fn(),
    createJob: vi.fn(),
    updateJobStatus: vi.fn(),
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

const projectDetail: ProjectDetail = {
  ...projectSummary,
  sources: [
    {
      id: 'src_123',
      project_id: 'proj_123',
      kind: 'youtube',
      value: 'https://youtube.com/watch?v=demo123',
      status: 'submitted',
      created_at: '2026-05-10T00:01:00Z',
      updated_at: '2026-05-10T00:02:00Z',
    },
  ],
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

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.listProjects.mockResolvedValue([projectSummary])
    mockApi.getProject.mockResolvedValue(projectDetail)
    mockApi.createProject.mockResolvedValue(projectSummary)
    mockApi.createSource.mockResolvedValue(projectDetail.sources[0])
    mockApi.createJob.mockResolvedValue(projectDetail.jobs[0])
    mockApi.updateJobStatus.mockResolvedValue({
      ...projectDetail.jobs[0],
      status: 'running',
      updated_at: '2026-05-10T00:06:00Z',
    })
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

  it('renders source status badges and linked job summaries', async () => {
    render(<App />)

    expect(await screen.findByText('Submitted • awaiting processing')).toBeInTheDocument()
    expect(screen.getByText('2 linked jobs')).toBeInTheDocument()
    expect(screen.getByText('1 active • 1 done • 0 failed')).toBeInTheDocument()
    expect(screen.getByText('Latest job update: 2026-05-10T00:09:00Z')).toBeInTheDocument()
  })

  it('offers valid job status transitions and updates the job', async () => {
    const user = userEvent.setup()
    render(<App />)

    const statusSelect = await screen.findByLabelText('Update status for job job_123')
    await user.selectOptions(statusSelect, 'running')
    await user.click(screen.getByRole('button', { name: 'Apply status' }))

    await waitFor(() => {
      expect(mockApi.updateJobStatus).toHaveBeenCalledWith('proj_123', 'job_123', 'running')
    })

    expect(await screen.findByText('Updated job job_123 to running')).toBeInTheDocument()
  })
})
