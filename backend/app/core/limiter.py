"""Shared slowapi Limiter instance — import from here to avoid creating multiple instances.

Rate limits are keyed per *caller*, not per source IP. The whole app sits behind an
nginx reverse proxy (frontend/nginx.conf), so slowapi's default get_remote_address would
see only the proxy's IP and throttle every user with one shared bucket. Instead we key by
the authenticated username when a valid JWT is present, falling back to the real client IP
that nginx forwards in X-Forwarded-For / X-Real-IP.
"""
from slowapi import Limiter
from starlette.requests import Request


def _client_key(request: Request) -> str:
    # Prefer the authenticated user — correct even when many users share one
    # NAT/proxy IP. Best-effort: never let a bad/absent token break rate limiting.
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        try:
            from app.core.security import decode_token
            username = decode_token(token).get("sub")
            if username:
                return f"user:{username}"
        except Exception:
            pass

    # Anonymous (e.g. /auth/login, /auth/register) — use the real client IP that
    # nginx forwards, so distinct clients get distinct buckets behind the proxy.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "anonymous"


limiter = Limiter(key_func=_client_key)
