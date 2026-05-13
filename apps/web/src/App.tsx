import { FormEvent, useEffect, useMemo, useState } from 'react'

import { api } from './api'
import type { JobRecord, ProjectDetail, ProjectSummary, RecentLogsResponse, SourceArtifactsResponse, SourceRecord } from './types'

const apiBaseUrl = api.getApiBaseUrl()

const allowedNextStatuses: Record<JobRecord['status'], JobRecord['status'][]> = {
  queued: ['running', 'failed'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
}

const allowedNextSourceStatuses: Record<SourceRecord['status'], SourceRecord['status'][]> = {
  submitted: ['processing', 'failed'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: ['completed'],
}

const jobStatusMeta: Record<
  JobRecord['status'],
  {
    label: string
    hint: string
    tone: 'queued' | 'running' | 'completed' | 'failed'
  }
> = {
  queued: {
    label: 'Queued',
    hint: 'waiting to start',
    tone: 'queued',
  },
  running: {
    label: 'Running',
    hint: 'currently processing',
    tone: 'running',
  },
  completed: {
    label: 'Completed',
    hint: 'no further action',
    tone: 'completed',
  },
  failed: {
    label: 'Failed',
    hint: 'needs attention',
    tone: 'failed',
  },
}

function getSourceStatusMeta(status: SourceRecord['status']) {
  switch (status) {
    case 'submitted':
      return {
        label: 'Submitted',
        hint: 'awaiting processing',
        tone: 'submitted',
      } as const
    case 'processing':
      return {
        label: 'Processing',
        hint: 'work is in progress',
        tone: 'running',
      } as const
    case 'completed':
      return {
        label: 'Completed',
        hint: 'ready for downstream steps',
        tone: 'completed',
      } as const
    case 'failed':
      return {
        label: 'Failed',
        hint: 'needs attention',
        tone: 'failed',
      } as const
  }
}

function formatTimestamp(label: string, value: string) {
  return `${label}: ${value}`
}

function getSourceValuePlaceholder(kind: SourceRecord['kind']): string {
  switch (kind) {
    case 'youtube':
      return 'https://youtube.com/watch?v=...'
    case 'local_file':
      return '/path/to/reference-track.wav'
    case 'upload':
      return '/path/to/upload-staging/source.wav'
  }
}

function getSourcePersistenceGuidance(kind: SourceRecord['kind']): string {
  switch (kind) {
    case 'youtube':
      return 'YouTube sources persist a source_reference.url pointer during ingest.'
    case 'local_file':
      return 'Local file sources are copied into source_media/<filename> during ingest.'
    case 'upload':
      return 'Uploaded-file sources currently ingest from a local staging path and copy it into source_media/<filename>.'
  }
}

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null)
  const [projectName, setProjectName] = useState('')
  const [sourceKind, setSourceKind] = useState<SourceRecord['kind']>('youtube')
  const [sourceValue, setSourceValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [sourceStatusSelections, setSourceStatusSelections] = useState<Record<string, SourceRecord['status']>>({})
  const [jobStatusSelections, setJobStatusSelections] = useState<Record<string, JobRecord['status']>>({})
  const [recentLogs, setRecentLogs] = useState<RecentLogsResponse>({ entries: [], total: 0 })
  const [selectedArtifactSourceId, setSelectedArtifactSourceId] = useState('')
  const [sourceArtifacts, setSourceArtifacts] = useState<SourceArtifactsResponse | null>(null)
  const [artifactLoading, setArtifactLoading] = useState(false)
  const [artifactError, setArtifactError] = useState('')
  const [logError, setLogError] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const jobLifecycleSummary = useMemo(() => {
    const jobs = projectDetail?.jobs ?? []
    return {
      total: jobs.length,
      active: jobs.filter((job) => job.status === 'queued' || job.status === 'running').length,
      done: jobs.filter((job) => job.status === 'completed').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
    }
  }, [projectDetail])

  async function loadRecentLogs(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false
    if (!silent) {
      setLogsLoading(true)
    }
    setLogError('')

    try {
      const data = await api.getRecentLogs(50)
      setRecentLogs(data)
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to load recent logs')
    } finally {
      if (!silent) {
        setLogsLoading(false)
      }
    }
  }

  function syncProjectDetail(detail: ProjectDetail | null) {
    if (!detail) {
      setProjectDetail(null)
      setSourceStatusSelections({})
      setJobStatusSelections({})
      setSelectedArtifactSourceId('')
      setSourceArtifacts(null)
      setArtifactError('')
      return
    }

    setProjectDetail(detail)
    setSourceStatusSelections(
      Object.fromEntries(
        detail.sources
          .filter((source) => allowedNextSourceStatuses[source.status].length > 0)
          .map((source) => [source.id, allowedNextSourceStatuses[source.status][0]]),
      ) as Record<string, SourceRecord['status']>,
    )
    setJobStatusSelections(
      Object.fromEntries(
        detail.jobs
          .filter((job) => allowedNextStatuses[job.status].length > 0)
          .map((job) => [job.id, allowedNextStatuses[job.status][0]]),
      ) as Record<string, JobRecord['status']>,
    )
  }

  async function loadProjects(preferredProjectId?: string) {
    const data = await api.listProjects()
    setProjects(data)

    const nextSelectedId = preferredProjectId || selectedProjectId || data[0]?.id || ''
    setSelectedProjectId(nextSelectedId)

    if (nextSelectedId) {
      const detail = await api.getProject(nextSelectedId)
      syncProjectDetail(detail)
    } else {
      syncProjectDetail(null)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadProjects()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load projects'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadRecentLogs().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!selectedProjectId || !projectDetail) {
      return undefined
    }

    const hasActiveJob = projectDetail.jobs.some(
      (job) => job.status === 'queued' || job.status === 'running',
    )

    if (!hasActiveJob) {
      return undefined
    }

    const refreshProjectDetail = async () => {
      try {
        const detail = await api.getProject(selectedProjectId)
        syncProjectDetail(detail)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh project detail')
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshProjectDetail()
    }, 250)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [selectedProjectId, projectDetail])

  useEffect(() => {
    if (!autoRefreshLogs) {
      return undefined
    }

    const stream = new EventSource(`${apiBaseUrl}/api/logs/stream`)

    stream.onmessage = (event) => {
      setLogError('')
      setLogsLoading(false)
      setRecentLogs((current) => ({
        entries: [...current.entries, event.data].slice(-50),
        total: current.total + 1,
      }))
    }

    stream.onerror = () => {
      setLogError('Live stream disconnected. Use Refresh logs to retry.')
      setLogsLoading(false)
      stream.close()
    }

    return () => {
      stream.close()
    }
  }, [autoRefreshLogs])

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectName.trim()) return

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const project = await api.createProject(projectName.trim())
      setProjectName('')
      await loadProjects(project.id)
      setMessage(`Created project ${project.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId)
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const detail = await api.getProject(projectId)
      syncProjectDetail(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project detail')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProjectId || !sourceValue.trim()) return

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const source = await api.createSource(selectedProjectId, sourceKind, sourceValue.trim())
      await api.createJob(selectedProjectId, source.id, 'ingest')
      await loadProjects(selectedProjectId)
      setSourceValue('')
      setMessage(`Submitted ${source.kind} source for ingest`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit source')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateSourceStatus(sourceId: string) {
    if (!selectedProjectId) return

    const nextStatus = sourceStatusSelections[sourceId]
    if (!nextStatus) return

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const updatedSource = await api.updateSourceStatus(selectedProjectId, sourceId, nextStatus)
      await loadProjects(selectedProjectId)
      setMessage(`Updated source ${updatedSource.id} to ${updatedSource.status}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update source status')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateJobStatus(jobId: string) {
    if (!selectedProjectId) return

    const nextStatus = jobStatusSelections[jobId]
    if (!nextStatus) return

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const updatedJob = await api.updateJobStatus(selectedProjectId, jobId, nextStatus)
      await loadProjects(selectedProjectId)
      setMessage(`Updated job ${updatedJob.id} to ${updatedJob.status}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job status')
    } finally {
      setLoading(false)
    }
  }

  async function handleInspectArtifacts(sourceId: string) {
    if (!selectedProjectId) return

    setArtifactLoading(true)
    setArtifactError('')
    setSelectedArtifactSourceId(sourceId)

    try {
      const artifacts = await api.getSourceArtifacts(selectedProjectId, sourceId)
      setSourceArtifacts(artifacts)
    } catch (err) {
      setSourceArtifacts(null)
      setArtifactError(err instanceof Error ? err.message : 'Failed to load source artifacts')
    } finally {
      setArtifactLoading(false)
    }
  }

  return (
    <main className="page">
      <section className="card stack-lg">
        <header className="stack-sm">
          <p className="eyebrow">songcraft</p>
          <h1>Local-first song extraction workspace</h1>
          <p className="lead">
            This scaffold now includes the first workflow layer: local projects, source submission,
            and queued ingest jobs for future YouTube/audio processing.
          </p>
        </header>

        <div className="grid two-up">
          <section className="panel stack-md">
            <div>
              <h2>Create project</h2>
              <p className="muted">Start a local workspace for one song or experiment.</p>
            </div>
            <form className="stack-sm" onSubmit={handleCreateProject}>
              <label className="stack-xs">
                <span>Project name</span>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="My reference track"
                />
              </label>
              <button type="submit" disabled={loading || !projectName.trim()}>
                Create project
              </button>
            </form>

            <div className="stack-sm">
              <h3>Projects</h3>
              {projects.length === 0 ? (
                <p className="muted">No projects yet.</p>
              ) : (
                <ul className="list">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <button
                        className={project.id === selectedProject?.id ? 'list-button active' : 'list-button'}
                        onClick={() => handleSelectProject(project.id)}
                        type="button"
                      >
                        <span className="stack-xs">
                          <strong>{project.name}</strong>
                          <span>{formatTimestamp('Created', project.created_at)}</span>
                          <span>{formatTimestamp('Updated', project.updated_at)}</span>
                        </span>
                        <span>
                          {project.source_count} sources • {project.job_count} jobs
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel stack-md">
            <div>
              <h2>Submit source</h2>
              <p className="muted">
                Queue ingest to persist source media into the project workspace before downstream processing.
              </p>
              <p className="muted">{getSourcePersistenceGuidance(sourceKind)}</p>
            </div>

            <form className="stack-sm" onSubmit={handleSubmitSource}>
              <label className="stack-xs">
                <span>Target project</span>
                <select
                  value={selectedProjectId}
                  onChange={(event) => handleSelectProject(event.target.value)}
                  disabled={projects.length === 0}
                >
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="stack-xs">
                <span>Source type</span>
                <select
                  value={sourceKind}
                  onChange={(event) => setSourceKind(event.target.value as SourceRecord['kind'])}
                >
                  <option value="youtube">YouTube URL</option>
                  <option value="upload">Uploaded file</option>
                  <option value="local_file">Local file path</option>
                </select>
              </label>

              <label className="stack-xs">
                <span>Source value</span>
                <input
                  value={sourceValue}
                  onChange={(event) => setSourceValue(event.target.value)}
                  placeholder={getSourceValuePlaceholder(sourceKind)}
                />
              </label>

              <button type="submit" disabled={loading || !selectedProjectId || !sourceValue.trim()}>
                Submit source and queue ingest job
              </button>
            </form>
          </section>
        </div>

        <section className="panel stack-md">
          <h2>Selected project</h2>
          {!projectDetail ? (
            <p className="muted">Choose or create a project to inspect its submitted sources and jobs.</p>
          ) : (
            <div className="grid two-up">
              <div className="stack-sm">
                <h3>{projectDetail.name}</h3>
                <p className="muted">Project ID: {projectDetail.id}</p>
                <p>{formatTimestamp('Created', projectDetail.created_at)}</p>
                <p>{formatTimestamp('Updated', projectDetail.updated_at)}</p>
                <p>
                  Sources: {projectDetail.source_count} • Jobs: {projectDetail.job_count}
                </p>
              </div>
              <div className="stack-sm">
                <h3>API</h3>
                <p>
                  Health endpoint:{' '}
                  <a href={`${apiBaseUrl}/api/health`} target="_blank" rel="noreferrer">
                    {apiBaseUrl}/api/health
                  </a>
                </p>
                <p>
                  API docs:{' '}
                  <a href={`${apiBaseUrl}/docs`} target="_blank" rel="noreferrer">
                    {apiBaseUrl}/docs
                  </a>
                </p>
              </div>

              <div className="stack-sm">
                <h3>Submitted sources</h3>
                {projectDetail.sources.length === 0 ? (
                  <p className="muted">No sources submitted yet.</p>
                ) : (
                  <ul className="list compact">
                    {projectDetail.sources.map((source) => {
                      const sourceStatusMeta = getSourceStatusMeta(source.status)
                      const nextSourceStatuses = allowedNextSourceStatuses[source.status]
                      const selectedSourceStatus = sourceStatusSelections[source.id] ?? nextSourceStatuses[0]
                      const sourceJobs = projectDetail.jobs.filter((job) => job.source_id === source.id)
                      const sourceJobSummary = {
                        total: sourceJobs.length,
                        active: sourceJobs.filter(
                          (job) => job.status === 'queued' || job.status === 'running',
                        ).length,
                        done: sourceJobs.filter((job) => job.status === 'completed').length,
                        failed: sourceJobs.filter((job) => job.status === 'failed').length,
                        latestUpdatedAt:
                          sourceJobs.length > 0
                            ? sourceJobs
                                .map((job) => job.updated_at)
                                .sort((left, right) => right.localeCompare(left))[0]
                            : null,
                      }
                      const hasActiveIngestJob = sourceJobs.some(
                        (job) =>
                          job.job_type === 'ingest' &&
                          (job.status === 'queued' || job.status === 'running'),
                      )

                      return (
                        <li key={source.id} className="list-row detail-card">
                          <div className="stack-xs grow">
                            <div className="job-header-row">
                              <span>
                                <strong>{source.kind}</strong> — {source.value}
                              </span>
                              <span className={`status-badge status-${sourceStatusMeta.tone}`}>
                                {sourceStatusMeta.label} • {sourceStatusMeta.hint}
                              </span>
                            </div>
                            <span>{formatTimestamp('Submitted', source.created_at)}</span>
                            <span>{formatTimestamp('Updated', source.updated_at)}</span>
                            <span className="muted">{sourceJobSummary.total} linked jobs</span>
                            <span className="muted">
                              {sourceJobSummary.active} active • {sourceJobSummary.done} done •{' '}
                              {sourceJobSummary.failed} failed
                            </span>
                            <div className="pipeline-note stack-xs" role="note" aria-label={`Pipeline guidance for source ${source.id}`}>
                              <strong>Ingest jobs drive source status automatically.</strong>
                              <span className="muted">
                                Use the job controls below for normal pipeline progress; only use source controls as a manual override.
                              </span>
                            </div>
                            {sourceJobSummary.latestUpdatedAt ? (
                              <span className="muted">
                                {formatTimestamp('Latest job update', sourceJobSummary.latestUpdatedAt)}
                              </span>
                            ) : (
                              <span className="muted">No linked jobs yet.</span>
                            )}
                            {nextSourceStatuses.length > 0 ? (
                              hasActiveIngestJob ? (
                                <span className="muted override-locked-message">
                                  Manual source overrides unlock after the active ingest job reaches a terminal state.
                                </span>
                              ) : (
                                <>
                                  <span className="muted">
                                    Next source transitions: {nextSourceStatuses.join(', ')}
                                  </span>
                                  <div className="inline-actions">
                                    <label className="stack-xs grow">
                                      <span>Update status for source {source.id}</span>
                                      <select
                                        aria-label={`Update status for source ${source.id}`}
                                        value={selectedSourceStatus}
                                        onChange={(event) =>
                                          setSourceStatusSelections((current) => ({
                                            ...current,
                                            [source.id]: event.target.value as SourceRecord['status'],
                                          }))
                                        }
                                      >
                                        {nextSourceStatuses.map((statusOption) => (
                                          <option key={statusOption} value={statusOption}>
                                            {statusOption}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button
                                      type="button"
                                      disabled={loading || !selectedSourceStatus}
                                      onClick={() => handleUpdateSourceStatus(source.id)}
                                    >
                                      Apply manual source override
                                    </button>
                                  </div>
                                </>
                              )
                            ) : (
                              <span className="muted">No further source transitions available.</span>
                            )}
                            <div className="inline-actions">
                              <button
                                type="button"
                                disabled={artifactLoading && selectedArtifactSourceId === source.id}
                                onClick={() => handleInspectArtifacts(source.id)}
                              >
                                {artifactLoading && selectedArtifactSourceId === source.id
                                  ? `Loading artifacts for source ${source.id}…`
                                  : `Inspect artifacts for source ${source.id}`}
                              </button>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="stack-sm">
                <h3>Queued jobs</h3>
                <div className="summary-row">
                  <span className="summary-pill">{jobLifecycleSummary.total} jobs total</span>
                  <span className="summary-pill summary-pill-active">{jobLifecycleSummary.active} active</span>
                  <span className="summary-pill summary-pill-done">{jobLifecycleSummary.done} done</span>
                  {jobLifecycleSummary.failed > 0 ? (
                    <span className="summary-pill summary-pill-failed">{jobLifecycleSummary.failed} failed</span>
                  ) : null}
                </div>
                {projectDetail.jobs.length === 0 ? (
                  <p className="muted">No jobs queued yet.</p>
                ) : (
                  <ul className="list compact">
                    {projectDetail.jobs.map((job) => {
                      const nextStatuses = allowedNextStatuses[job.status]
                      const selectedStatus = jobStatusSelections[job.id] ?? nextStatuses[0]
                      const statusMeta = jobStatusMeta[job.status]

                      return (
                        <li key={job.id} className="list-row detail-card">
                          <div className="stack-xs grow">
                            <div className="job-header-row">
                              <span>
                                <strong>{job.job_type}</strong> — source {job.source_id}
                              </span>
                              <span className={`status-badge status-${statusMeta.tone}`}>
                                {statusMeta.label} • {statusMeta.hint}
                              </span>
                            </div>
                            <span>{formatTimestamp('Queued at', job.created_at)}</span>
                            <span>{formatTimestamp('Updated', job.updated_at)}</span>
                            {nextStatuses.length > 0 ? (
                              <>
                                <span className="muted">
                                  Next transitions: {nextStatuses.join(', ')}
                                </span>
                                <div className="inline-actions">
                                  <label className="stack-xs grow">
                                    <span>Update status for job {job.id}</span>
                                    <select
                                      aria-label={`Update status for job ${job.id}`}
                                      value={selectedStatus}
                                      onChange={(event) =>
                                        setJobStatusSelections((current) => ({
                                          ...current,
                                          [job.id]: event.target.value as JobRecord['status'],
                                        }))
                                      }
                                    >
                                      {nextStatuses.map((statusOption) => (
                                        <option key={statusOption} value={statusOption}>
                                          {statusOption}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <button
                                    type="button"
                                    disabled={loading || !selectedStatus}
                                    onClick={() => handleUpdateJobStatus(job.id)}
                                  >
                                    Apply status
                                  </button>
                                </div>
                              </>
                            ) : (
                              <span className="muted">No further transitions available.</span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="panel stack-md">
          <div className="stack-xs">
            <h2>Source artifacts</h2>
            <p className="muted">
              Inspect persisted source and transcription artifacts created under the local project workspace.
            </p>
          </div>
          {!selectedArtifactSourceId ? (
            <p className="muted">Choose “Inspect artifacts” on a source to preview its saved files.</p>
          ) : artifactLoading ? (
            <p className="muted">Loading artifacts for source {selectedArtifactSourceId}…</p>
          ) : artifactError ? (
            <p className="error">{artifactError}</p>
          ) : sourceArtifacts && sourceArtifacts.entries.length > 0 ? (
            <div className="stack-sm">
              <p className="muted">
                Showing {sourceArtifacts.entries.length} artifacts for source {sourceArtifacts.source_id}
              </p>
              <ul className="list compact">
                {sourceArtifacts.entries.map((entry) => (
                  <li key={entry.path} className="list-row detail-card">
                    <div className="stack-xs grow">
                      <strong>{entry.path}</strong>
                      <span className="muted">
                        {entry.content_type} • {entry.size_bytes} bytes
                      </span>
                      <div className="inline-actions">
                        <a
                          href={api.getSourceArtifactContentUrl(
                            sourceArtifacts.project_id,
                            sourceArtifacts.source_id,
                            entry.path,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open raw artifact {entry.path}
                        </a>
                      </div>
                      <pre className="log-console" aria-label={`Artifact preview for ${entry.path}`}>
                        {entry.preview}
                      </pre>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted">No artifacts found for source {selectedArtifactSourceId}.</p>
          )}
        </section>

        <section className="panel stack-md">
          <div className="log-panel-header">
            <div className="stack-xs">
              <h2>Server logs</h2>
              <p className="muted">
                Recent buffered API log lines from the backend. Auto-refresh is on by default.
              </p>
            </div>
            <div className="inline-actions log-panel-controls">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={autoRefreshLogs}
                  onChange={(event) => setAutoRefreshLogs(event.target.checked)}
                />
                <span>Auto-refresh</span>
              </label>
              <button type="button" onClick={() => loadRecentLogs()} disabled={logsLoading}>
                {logsLoading ? 'Refreshing…' : 'Refresh logs'}
              </button>
            </div>
          </div>
          <p className="muted">Showing {recentLogs.entries.length} of {recentLogs.total} buffered log lines</p>
          {logError ? <p className="error">{logError}</p> : null}
          {recentLogs.entries.length === 0 ? (
            <p className="muted">No log lines captured yet.</p>
          ) : (
            <pre className="log-console" aria-label="Recent server log lines">
              {recentLogs.entries.join('\n')}
            </pre>
          )}
        </section>

        {(error || message) && (
          <section className="panel stack-sm">
            {error ? <p className="error">{error}</p> : null}
            {message ? <p className="success">{message}</p> : null}
          </section>
        )}
      </section>
    </main>
  )
}

export default App
