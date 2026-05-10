from fastapi import FastAPI

from app.api.routes_health import router as health_router
from app.api.routes_projects import router as projects_router
from app.config import get_settings
from app.store import SQLiteStore

settings = get_settings()
app = FastAPI(title=settings.app_name)
app.state.store = SQLiteStore(settings.sqlite_path)
app.include_router(health_router, prefix="/api", tags=["health"])
app.include_router(projects_router, prefix="/api")
