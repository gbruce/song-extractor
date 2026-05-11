from collections import deque
from collections.abc import Iterable
from logging import Handler, LogRecord
from queue import Full, Queue


class InMemoryLogHandler(Handler):
    def __init__(self, buffer: deque[str], subscribers: list[Queue[str]]) -> None:
        super().__init__()
        self.buffer = buffer
        self.subscribers = subscribers

    def emit(self, record: LogRecord) -> None:
        try:
            message = self.format(record)
        except Exception:
            message = record.getMessage()
        self.emit_plain_text(message)

    def emit_plain_text(self, message: str) -> None:
        self.buffer.append(message)
        for subscriber in list(self.subscribers):
            try:
                subscriber.put_nowait(message)
            except Full:
                continue


def get_recent_entries(buffer: Iterable[str], limit: int) -> list[str]:
    if limit <= 0:
        return []
    entries = list(buffer)
    return entries[-limit:]
