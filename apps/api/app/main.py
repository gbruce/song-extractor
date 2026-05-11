from collections import deque
import logging
from queue import Queue

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_health import router as health_router
from app.api.routes_projects import router as projects_router
from app.config import get_settings
from app.db import bootstrap_database
from app.logging_utils import InMemoryLogHandler
from app.store import SQLiteStore

settings = get_settings()
bootstrap_database(settings.sqlite_path)
app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.state.store = SQLiteStore(settings.sqlite_path)
app.state.log_buffer = deque(maxlen=200)
app.state.log_subscribers = []
app.state.log_handler = InMemoryLogHandler(app.state.log_buffer, app.state.log_subscribers)
app.state.log_handler.setFormatter(logging.Formatter('%(levelname)s %(name)s: %(message)s'))
api_logger = logging.getLogger('songcraft.api')
api_logger.setLevel(logging.INFO)
api_logger.propagate = False
if not any(isinstance(handler, InMemoryLogHandler) for handler in api_logger.handlers):
    api_logger.addHandler(app.state.log_handler)
app.include_router(health_router, prefix='/api', tags=['health'])
app.include_router(projects_router, prefix='/api')
