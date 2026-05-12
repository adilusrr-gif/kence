import json
from pathlib import Path
from typing import Optional
from app.core.security import hash_password, verify_password
from app.core.config import get_settings

settings = get_settings()


def _users_path() -> Path:
    p = Path(settings.USERS_FILE)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _load() -> dict:
    p = _users_path()
    if not p.exists():
        return {}
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def _save(users: dict) -> None:
    with open(_users_path(), "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


def get_user(username: str) -> Optional[dict]:
    return _load().get(username)


def create_user(username: str, password: str, role: str = "user") -> dict:
    users = _load()
    if username in users:
        raise ValueError("Пользователь уже существует")
    user = {
        "username": username,
        "hashed_password": hash_password(password),
        "role": role,
        "is_active": True,
    }
    users[username] = user
    _save(users)
    return user


def authenticate(username: str, password: str) -> Optional[dict]:
    user = get_user(username)
    if not user or not verify_password(password, user["hashed_password"]):
        return None
    return user


def list_users() -> list[dict]:
    users = _load()
    return [
        {"username": u, "role": d["role"], "is_active": d["is_active"]}
        for u, d in users.items()
    ]


def set_user_active(username: str, is_active: bool) -> bool:
    users = _load()
    if username not in users:
        return False
    users[username]["is_active"] = is_active
    _save(users)
    return True


def change_password(username: str, old_password: str, new_password: str) -> None:
    users = _load()
    if username not in users:
        raise ValueError("Пользователь не найден")
    if not verify_password(old_password, users[username]["hashed_password"]):
        raise ValueError("Неверный текущий пароль")
    if len(new_password) < 6:
        raise ValueError("Новый пароль должен содержать не менее 6 символов")
    users[username]["hashed_password"] = hash_password(new_password)
    _save(users)
