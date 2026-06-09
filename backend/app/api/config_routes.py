from fastapi import APIRouter, Depends
from app.api.auth_routes import get_current_user
from app.core.features import get_edition_flags
from app.services.org_service import get_user_orgs

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/features")
async def get_features(current_user: dict = Depends(get_current_user)):
    """Return feature flags for the caller's first/primary org plan."""
    orgs = get_user_orgs(current_user["username"])
    plan = orgs[0]["plan"] if orgs else "free"
    return {"plan": plan, "flags": get_edition_flags(plan)}
