from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError
from pydantic import BaseModel
from datetime import timedelta
from typing import Optional

from app.core.security import create_access_token, decode_token
from app.services.user_service import authenticate, create_user, get_user, list_users, set_user_active, change_password
from app.core.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ── Dependency ──────────────────────────────────────────────────────────────

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Токен недействителен или истёк",
        headers={"WWW-Authenticate": "Bearer"},
    )
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


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Доступ только для администраторов")
    return current_user


# ── Schemas ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    admin_token: Optional[str] = None  # required for non-user roles


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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
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
async def register(req: RegisterRequest):
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
    return UserInfo(username=user["username"], role=user["role"], is_active=user["is_active"])
