from fastapi import APIRouter

from app.config import get_settings

router = APIRouter()


@router.get("/health")
def healthcheck() -> dict[str, str | int]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
        "port": settings.api_port,
    }
