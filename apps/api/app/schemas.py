from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SourceCreate(BaseModel):
    kind: str = Field(pattern="^(youtube|upload|local_file)$")
    value: str = Field(min_length=1, max_length=2000)


class JobCreate(BaseModel):
    source_id: str = Field(min_length=1, max_length=200)
    job_type: str = Field(pattern="^(ingest|transcribe|separate)$")


class JobStatusUpdate(BaseModel):
    status: str = Field(pattern="^(queued|running|completed|failed)$")
