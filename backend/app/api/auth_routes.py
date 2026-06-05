from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError
from pydantic import BaseModel, field_validator
from datetime import timedelta
from typing import Optional
import re
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.security import create_access_token, decode_token
from app.services.user_service import authenticate, create_user, get_user, list_users, set_user_active, change_password, delete_user, set_user_role
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
limiter = Limiter(key_func=get_remote_address)


# ── Dependencies ─────────────────────────────────────────────────────────────

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Токен недействителен или истёк",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise exc
    try:
        payload = decode_token(token)
        username: str = payload.get("sub")
        if not username:
            raise exc
    except JWTError:
        raise exc
    user = get_user(username)
    if not user or not user.get("is_active"):
        raise exc
    return user


async def get_current_user_or_api_key(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
) -> dict:
    """Accepts Bearer JWT token OR X-API-Key header."""
    # Try JWT first
    if token:
        try:
            payload = decode_token(token)
            username: str = payload.get("sub")
            if username:
                user = get_user(username)
                if user and user.get("is_active"):
                    return user
        except JWTError:
            pass

    # Fall back to API key
    api_key = request.headers.get("X-API-Key")
    if api_key:
        from app.services.api_key_service import validate_api_key
        result = validate_api_key(api_key)
        if result:
            return result

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Требуется аутентификация",
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_token(raw_token: str) -> dict:
    """Decode and validate JWT without FastAPI Depends. Used for SSE endpoints."""
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Токен недействителен или истёк",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(raw_token)
        username: str = payload.get("sub")
        if not username:
            raise exc
    except JWTError:
        raise exc
    user = get_user(username)
    if not user or not user.get("is_active"):
        raise exc
    return user


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Доступ только для администраторов")
    return current_user


def require_org_member(org_id: int, current_user: dict) -> dict:
    """Returns membership dict or raises 403. Call inline, not as Depends."""
    from app.services.org_service import get_membership
    m = get_membership(org_id, current_user["username"])
    if not m:
        raise HTTPException(status_code=403, detail="Вы не состоите в этой организации")
    return m


def require_org_admin(org_id: int, current_user: dict) -> dict:
    m = require_org_member(org_id, current_user)
    if m["org_role"] not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Требуется роль admin или owner в организации")
    return m


def require_org_owner(org_id: int, current_user: dict) -> dict:
    m = require_org_member(org_id, current_user)
    if m["org_role"] != "owner":
        raise HTTPException(status_code=403, detail="Требуется роль owner в организации")
    return m


# ── Schemas ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    admin_token: Optional[str] = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 32:
            raise ValueError("Имя пользователя должно быть от 3 до 32 символов")
        if not re.match(r'^[a-zA-Z0-9_.-]+$', v):
            raise ValueError("Имя пользователя может содержать только буквы, цифры, _, ., -")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Пароль должен содержать не менее 10 символов")
        if not re.search(r'[A-Z]', v):
            raise ValueError("Пароль должен содержать хотя бы одну заглавную букву")
        if not re.search(r'[a-z]', v):
            raise ValueError("Пароль должен содержать хотя бы одну строчную букву")
        if not re.search(r'\d', v):
            raise ValueError("Пароль должен содержать хотя бы одну цифру")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


class UserInfo(BaseModel):
    username: str
    role: str
    is_active: bool


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class CreateUserAdminRequest(BaseModel):
    username: str
    password: str
    role: str = "user"


class ChangeRoleRequest(BaseModel):
    role: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Учётная запись заблокирована")
    token = create_access_token(
        {"sub": user["username"]},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(access_token=token, username=user["username"], role=user["role"])


@router.post("/register", response_model=TokenResponse)
@limiter.limit("3/minute")
async def register(request: Request, req: RegisterRequest):
    # Only admins can create admin/manager roles
    if req.role in ("admin", "manager"):
        # Verify admin_token belongs to an admin
        if not req.admin_token:
            raise HTTPException(status_code=403, detail="Требуется токен администратора")
        try:
            payload = decode_token(req.admin_token)
            caller = get_user(payload.get("sub", ""))
            if not caller or caller.get("role") != "admin":
                raise HTTPException(status_code=403, detail="Недостаточно прав")
        except JWTError:
            raise HTTPException(status_code=403, detail="Токен администратора недействителен")

    try:
        user = create_user(req.username, req.password, req.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    token = create_access_token(
        {"sub": user["username"]},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(access_token=token, username=user["username"], role=user["role"])


@router.get("/me", response_model=UserInfo)
async def me(current_user: dict = Depends(get_current_user)):
    return UserInfo(
        username=current_user["username"],
        role=current_user["role"],
        is_active=current_user["is_active"],
    )


@router.get("/users", response_model=list[UserInfo])
async def users(admin: dict = Depends(require_admin)):
    return list_users()


@router.post("/users/{username}/deactivate")
async def deactivate_user(username: str, admin: dict = Depends(require_admin)):
    if username == admin["username"]:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать самого себя")
    ok = set_user_active(username, False)
    if not ok:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {"message": f"Пользователь {username} заблокирован"}


@router.post("/users/{username}/activate")
async def activate_user(username: str, admin: dict = Depends(require_admin)):
    ok = set_user_active(username, True)
    if not ok:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {"message": f"Пользователь {username} активирован"}


@router.post("/change-password")
async def change_password_endpoint(
    req: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        change_password(current_user["username"], req.current_password, req.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Пароль успешно изменён"}


@router.post("/users", response_model=UserInfo)
async def admin_create_user(req: CreateUserAdminRequest, admin: dict = Depends(require_admin)):
    try:
        user = create_user(req.username, req.password, req.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    logger.info("[audit] admin=%s created user=%s role=%s", admin["username"], req.username, req.role)
    return UserInfo(username=user["username"], role=user["role"], is_active=user["is_active"])


@router.delete("/users/{username}")
async def admin_delete_user(username: str, admin: dict = Depends(require_admin)):
    if username == admin["username"]:
        raise HTTPException(status_code=400, detail="Нельзя удалить собственный аккаунт")
    ok = delete_user(username)
    if not ok:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    logger.info("[audit] admin=%s deleted user=%s", admin["username"], username)
    return {"message": f"Пользователь {username} удалён"}


@router.patch("/users/{username}/role")
async def admin_change_role(username: str, req: ChangeRoleRequest, admin: dict = Depends(require_admin)):
    if username == admin["username"]:
        raise HTTPException(status_code=400, detail="Нельзя изменить собственную роль")
    allowed_roles = {"user", "manager", "admin"}
    if req.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Допустимые роли: {', '.join(allowed_roles)}")
    ok = set_user_role(username, req.role)
    if not ok:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    logger.info("[audit] admin=%s changed role of user=%s to %s", admin["username"], username, req.role)
    return {"message": f"Роль пользователя {username} изменена на {req.role}"}


@router.get("/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    from app.core.session import session_manager
    from app.core.config import get_settings
    import os, shutil
    cfg = get_settings()
    all_users = list_users()
    active_sessions = len(session_manager._mem)
    upload_dir = cfg.UPLOAD_DIR
    try:
        total, used, free = shutil.disk_usage(upload_dir)
        disk_free_gb = round(free / (1024**3), 1)
    except Exception:
        disk_free_gb = None
    return {
        "users_total": len(all_users),
        "users_active": sum(1 for u in all_users if u["is_active"]),
        "users_blocked": sum(1 for u in all_users if not u["is_active"]),
        "active_sessions": active_sessions,
        "llm_model": cfg.LLM_MODEL,
        "embedding_model": cfg.EMBEDDING_MODEL,
        "disk_free_gb": disk_free_gb,
        "chunk_size": cfg.CHUNK_SIZE,
        "session_timeout_min": cfg.SESSION_TIMEOUT // 60,
    }
