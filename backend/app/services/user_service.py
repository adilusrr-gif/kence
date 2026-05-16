from typing import Optional
from sqlalchemy.exc import IntegrityError
from app.core.database import SessionLocal
from app.core.security import hash_password, verify_password
from app.models.models import User


def _db():
    return SessionLocal()


def get_user(username: str) -> Optional[dict]:
    with _db() as db:
        user = db.get(User, username)
        if not user:
            return None
        return {
            "username": user.username,
            "hashed_password": user.hashed_password,
            "role": user.role,
            "is_active": user.is_active,
        }


def create_user(username: str, password: str, role: str = "user") -> dict:
    with _db() as db:
        if db.get(User, username):
            raise ValueError("Пользователь уже существует")
        user = User(
            username=username,
            hashed_password=hash_password(password),
            role=role,
            is_active=True,
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise ValueError("Пользователь уже существует")
        return {
            "username": user.username,
            "hashed_password": user.hashed_password,
            "role": user.role,
            "is_active": user.is_active,
        }


def authenticate(username: str, password: str) -> Optional[dict]:
    user = get_user(username)
    if not user or not verify_password(password, user["hashed_password"]):
        return None
    if not user["is_active"]:
        return None
    return user


def list_users() -> list[dict]:
    with _db() as db:
        users = db.query(User).all()
        return [
            {"username": u.username, "role": u.role, "is_active": u.is_active}
            for u in users
        ]


def set_user_active(username: str, is_active: bool) -> bool:
    with _db() as db:
        user = db.get(User, username)
        if not user:
            return False
        user.is_active = is_active
        db.commit()
        return True


def change_password(username: str, old_password: str, new_password: str) -> None:
    with _db() as db:
        user = db.get(User, username)
        if not user:
            raise ValueError("Пользователь не найден")
        if not verify_password(old_password, user.hashed_password):
            raise ValueError("Неверный текущий пароль")
        if len(new_password) < 6:
            raise ValueError("Новый пароль должен содержать не менее 6 символов")
        user.hashed_password = hash_password(new_password)
        db.commit()
