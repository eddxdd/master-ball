"""Real login/auth system — email/password signup + login with stateless
JWT sessions. See the auth plan's "v1 scope boundary" for what's explicitly
deferred (client_id linking, email verification/password reset, refresh-token
rotation).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    SignupRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user, from_attributes=True),
    )


@router.post("/signup", response_model=TokenResponse)
async def signup(request: SignupRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    existing = (
        await db.execute(select(User).where(User.email == request.email))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        email=request.email,
        hashed_password=hash_password(request.password),
        display_name=request.display_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = (
        await db.execute(select(User).where(User.email == request.email))
    ).scalar_one_or_none()
    # Undifferentiated error message regardless of whether the email exists
    # or the password is wrong, to avoid leaking which emails are registered.
    if user is None or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return _token_response(user)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user, from_attributes=True)


@router.patch("/me", response_model=UserOut)
async def update_me(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    current_user.display_name = request.display_name
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user, from_attributes=True)
