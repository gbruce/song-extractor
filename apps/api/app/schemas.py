from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SourceCreate(BaseModel):
    kind: str = Field(pattern="^(youtube|upload|local_file)$")
    value: str = Field(min_length=1, max_length=2000)


class SourceStatusUpdate(BaseModel):
    status: str = Field(pattern="^(submitted|processing|completed|failed)$")


class JobCreate(BaseModel):
    source_id: str = Field(min_length=1, max_length=200)
    job_type: str = Field(pattern="^(ingest|transcribe|separate)$")


class JobStatusUpdate(BaseModel):
    status: str = Field(pattern="^(queued|running|completed|failed)$")


class JobRecord(BaseModel):
    id: str
    project_id: str
    source_id: str
    job_type: str
    status: str
    created_at: str
    updated_at: str


class SourceRecord(BaseModel):
    id: str
    project_id: str
    kind: str
    value: str
    status: str
    created_at: str
    updated_at: str


class ProjectSummary(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    source_count: int
    job_count: int


class ProjectDetail(ProjectSummary):
    sources: list[SourceRecord]
    jobs: list[JobRecord]


class SourceArtifactEntry(BaseModel):
    path: str
    kind: str
    size_bytes: int
    content_type: str
    preview: str | None


class SourceArtifactsResponse(BaseModel):
    project_id: str
    source_id: str
    entries: list[SourceArtifactEntry]
