from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.store import SQLiteStore


class IngestWorker:
    def __init__(
        self,
        store: SQLiteStore,
        logger: logging.Logger,
        poll_interval_seconds: float = 0.05,
        processing_delay_seconds: float = 0.1,
    ) -> None:
        self._store = store
        self._logger = logger
        self._poll_interval_seconds = poll_interval_seconds
        self._processing_delay_seconds = processing_delay_seconds
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name='songcraft-ingest-worker', daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=2)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            job = self._store.claim_next_queued_job('ingest')
            if job is None:
                self._stop_event.wait(self._poll_interval_seconds)
                continue

            self._logger.info('Processing ingest job %s for source %s', job['id'], job['source_id'])
            try:
                if self._stop_event.wait(self._processing_delay_seconds):
                    return
                completed_job = self._store.update_job_status(
                    project_id=job['project_id'],
                    job_id=job['id'],
                    status='completed',
                )
                if completed_job is not None:
                    self._logger.info('Completed ingest job %s', completed_job['id'])
            except Exception:
                self._logger.exception('Ingest job %s failed', job['id'])
                self._store.update_job_status(
                    project_id=job['project_id'],
                    job_id=job['id'],
                    status='failed',
                )
