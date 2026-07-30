"""Structured JSON logging configuration.

Call setup_logging() once at process startup (before any loggers are used).
After that, all loggers emit JSON lines with timestamp, level, logger name,
message, and any extra fields passed via logger.info("msg", extra={...}).
"""
import logging
import logging.config
import sys
from app.core.config import get_settings

settings = get_settings()


def setup_logging() -> None:
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    if settings.LOG_FORMAT == "json":
        try:
            from pythonjsonlogger import jsonlogger

            class _Formatter(jsonlogger.JsonFormatter):
                def add_fields(self, log_record, record, message_dict):
                    super().add_fields(log_record, record, message_dict)
                    log_record["logger"] = record.name
                    log_record.pop("name", None)

            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(
                _Formatter("%(asctime)s %(levelname)s %(message)s")
            )
        except ImportError:
            # Fallback to plain text if library not installed yet
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(
                logging.Formatter("%(asctime)s %(levelname)-8s %(name)s  %(message)s")
            )
    else:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-8s %(name)s  %(message)s")
        )

    root = logging.getLogger()
    root.setLevel(log_level)
    # Replace any default handlers (avoids duplicate lines in uvicorn)
    root.handlers.clear()
    root.addHandler(handler)

    # Quiet noisy third-party loggers
    for noisy in ("urllib3", "httpx", "httpcore", "neo4j", "chromadb", "PIL"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
