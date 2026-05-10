export type ProjectSummary = {
  id: string
  name: string
  source_count: number
  job_count: number
}

export type SourceRecord = {
  id: string
  project_id: string
  kind: 'youtube' | 'upload' | 'local_file'
  value: string
  status: string
}

export type JobRecord = {
  id: string
  project_id: string
  source_id: string
  job_type: 'ingest' | 'transcribe' | 'separate'
  status: string
}

export type ProjectDetail = ProjectSummary & {
  sources: SourceRecord[]
  jobs: JobRecord[]
}
