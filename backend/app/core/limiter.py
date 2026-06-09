"""Shared slowapi Limiter instance — import from here to avoid creating multiple instances."""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
