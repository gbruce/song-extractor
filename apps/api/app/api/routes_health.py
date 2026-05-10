import logging
from collections import deque

from fastapi import APIRouter, Request

from app.config import get_settings
from app.logging_utils import get_recent_entries

router = APIRouter()
logger = logging.getLogger('songcraft.api')


@router.get('/health')
def healthcheck() -> dict[str, str | int]:
    settings = get_settings()
    logger.info('Health check requested')
    return {
        'status': 'ok',
        'service': settings.app_name,
        'environment': settings.app_env,
        'port': settings.api_port,
    }


@router.get('/logs/recent')
def recent_logs(request: Request, limit: int = 50) -> dict[str, object]:
    buffer = getattr(request.app.state, 'log_buffer', deque())
    entries = get_recent_entries(buffer, limit)
    return {
        'entries': entries,
        'total': len(list(buffer)),
    }
