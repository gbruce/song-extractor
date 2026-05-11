import json
import logging
from collections import deque
from collections.abc import Generator
from queue import Empty, Queue

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

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


@router.get('/logs/stream')
def stream_logs(request: Request) -> StreamingResponse:
    buffer = getattr(request.app.state, 'log_buffer', deque())
    subscribers = getattr(request.app.state, 'log_subscribers', [])
    subscriber: Queue[str] = Queue(maxsize=200)
    subscribers.append(subscriber)

    def generate() -> Generator[str, None, None]:
        try:
            for entry in list(buffer):
                yield f'data: {entry}\n\n'

            while True:
                try:
                    entry = subscriber.get(timeout=15)
                    yield f'data: {entry}\n\n'
                except Empty:
                    yield ': keepalive\n\n'
        finally:
            if subscriber in subscribers:
                subscribers.remove(subscriber)

    return StreamingResponse(generate(), media_type='text/event-stream')
