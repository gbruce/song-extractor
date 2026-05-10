import type { JobRecord, ProjectDetail, ProjectSummary, SourceRecord } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  getApiBaseUrl(): string {
    return API_BASE_URL
  },
  listProjects(): Promise<ProjectSummary[]> {
    return request<ProjectSummary[]>('/api/projects')
  },
  createProject(name: string): Promise<ProjectSummary> {
    return request<ProjectSummary>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },
  getProject(projectId: string): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/api/projects/${projectId}`)
  },
  createSource(projectId: string, kind: SourceRecord['kind'], value: string): Promise<SourceRecord> {
    return request<SourceRecord>(`/api/projects/${projectId}/sources`, {
      method: 'POST',
      body: JSON.stringify({ kind, value }),
    })
  },
  createJob(projectId: string, sourceId: string, jobType: JobRecord['job_type']): Promise<JobRecord> {
    return request<JobRecord>(`/api/projects/${projectId}/jobs`, {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId, job_type: jobType }),
    })
  },
  updateJobStatus(projectId: string, jobId: string, status: JobRecord['status']): Promise<JobRecord> {
    return request<JobRecord>(`/api/projects/${projectId}/jobs/${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },
}
