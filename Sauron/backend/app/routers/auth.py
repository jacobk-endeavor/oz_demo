from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.models.enums import UserRole
from app.models.lead import Lead
from app.models.user import User
from app.repositories.user_repo import UserRepo
from app.schemas.user import CurrentUserRead, UserLogin, UserRead, UserRegister, Token

router = APIRouter(prefix="/api/auth", tags=["auth"])


def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({**data, "exp": expire}, settings.secret_key, algorithm="HS256")


@router.post("/register", response_model=UserRead)
async def register(user_in: UserRegister, db: AsyncSession = Depends(get_db)):
    repo = UserRepo(db)
    if await repo.get_by_email(user_in.email):
        raise HTTPException(400, "Email already exists")
    user = await repo.create(
        email=user_in.email,
        password=user_in.password,
        role=user_in.role,
    )
    await repo.commit()
    await repo.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login(user_in: UserLogin, db: AsyncSession = Depends(get_db)):
    repo = UserRepo(db)
    user = await repo.get_by_email(user_in.email)
    if not user or user.password != user_in.password:
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=CurrentUserRead)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    has_assigned_leads = False
    if user.role == UserRole.AE:
        assigned_lead_id = (
            await db.execute(select(Lead.id).where(Lead.user_id == user.id).limit(1))
        ).scalar_one_or_none()
        has_assigned_leads = assigned_lead_id is not None

    return CurrentUserRead(
        id=user.id,
        email=user.email,
        role=user.role,
        phone_number=user.phone_number,
        has_assigned_leads=has_assigned_leads,
    )
