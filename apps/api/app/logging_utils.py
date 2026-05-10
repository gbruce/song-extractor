from collections import deque
from collections.abc import Iterable
from logging import Handler, LogRecord


class InMemoryLogHandler(Handler):
    def __init__(self, buffer: deque[str]) -> None:
        super().__init__()
        self.buffer = buffer

    def emit(self, record: LogRecord) -> None:
        try:
            message = self.format(record)
        except Exception:
            message = record.getMessage()
        self.buffer.append(message)


def get_recent_entries(buffer: Iterable[str], limit: int) -> list[str]:
    if limit <= 0:
        return []
    entries = list(buffer)
    return entries[-limit:]
