"""Schemas for the real login/auth system — see app/routers/auth.py."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    """Min length only — no forced composition rules (uppercase/digit/symbol),
    per current NIST guidance that those rules push users toward predictable
    patterns rather than meaningfully stronger passwords."""
    display_name: str = Field(min_length=1, max_length=50)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UpdateProfileRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=50)


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
