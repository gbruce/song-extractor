import { FormEvent, useEffect, useMemo, useState } from 'react'

import { api } from './api'
import type { ProjectDetail, ProjectSummary, SourceRecord } from './types'

const apiBaseUrl = api.getApiBaseUrl()

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

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  async function loadProjects(preferredProjectId?: string) {
    const data = await api.listProjects()
    setProjects(data)

    const nextSelectedId = preferredProjectId ?? selectedProjectId ?? data[0]?.id ?? ''
    setSelectedProjectId(nextSelectedId)

    if (nextSelectedId) {
      const detail = await api.getProject(nextSelectedId)
      setProjectDetail(detail)
    } else {
      setProjectDetail(null)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadProjects()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load projects'))
      .finally(() => setLoading(false))
  }, [])

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
      setProjectDetail(detail)
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
                        <strong>{project.name}</strong>
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
                Create a placeholder ingest job now; actual download and separation come next.
              </p>
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
                  placeholder="https://youtube.com/watch?v=..."
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
                    {projectDetail.sources.map((source) => (
                      <li key={source.id} className="list-row">
                        <span>
                          <strong>{source.kind}</strong> — {source.value}
                        </span>
                        <span>{source.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="stack-sm">
                <h3>Queued jobs</h3>
                {projectDetail.jobs.length === 0 ? (
                  <p className="muted">No jobs queued yet.</p>
                ) : (
                  <ul className="list compact">
                    {projectDetail.jobs.map((job) => (
                      <li key={job.id} className="list-row">
                        <span>
                          <strong>{job.job_type}</strong> — source {job.source_id}
                        </span>
                        <span>{job.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
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
