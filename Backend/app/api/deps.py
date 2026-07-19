"""Shared FastAPI dependencies for protected routes — currently just
`get_current_user`. A new `app/api/` convention (this project's other
dependencies live inline in their routers), warranted here because auth is
the first cross-cutting dependency shared across multiple routers.
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decodes the `Authorization: Bearer <token>` header and loads the
    corresponding user. Raises 401 for any failure mode (missing header,
    malformed/expired token, or a deleted user) — never leaks which one, same
    as the login endpoint's undifferentiated "invalid email or password"."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return user
