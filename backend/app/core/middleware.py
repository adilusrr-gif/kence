"""Request ID + timing middleware.

Injects a unique X-Request-ID into every request (uses caller-supplied header
if present, otherwise generates a new UUID4). Logs method / path / status /
duration at INFO level after each response so every request is traceable.

Pure ASGI implementation (no BaseHTTPMiddleware) so it never interferes with
the CORSMiddleware response-header injection — including on 500 error paths.
"""
import logging
import time
import uuid
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("kence.requests")

_SKIP_PATHS = frozenset({"/", "/metrics", "/docs", "/openapi.json", "/redoc"})


class RequestTracingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        request_id = (
            headers.get(b"x-request-id", b"").decode() or str(uuid.uuid4())
        )

        start = time.perf_counter()
        status_holder: list[int] = []

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                raw_headers = list(message.get("headers", []))
                raw_headers.append(
                    (b"x-request-id", request_id.encode())
                )
                message = {**message, "headers": raw_headers}
                status_holder.append(message.get("status", 0))
            await send(message)

        await self.app(scope, receive, send_with_id)

        duration_ms = (time.perf_counter() - start) * 1000
        path = scope.get("path", "")
        method = scope.get("method", "")
        status = status_holder[0] if status_holder else 0

        if path not in _SKIP_PATHS:
            logger.info(
                "%s %s %d",
                method,
                path,
                status,
                extra={
                    "request_id": request_id,
                    "method": method,
                    "path": path,
                    "status": status,
                    "duration_ms": round(duration_ms, 1),
                },
            )
