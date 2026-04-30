from pydantic import BaseModel

from app.models.enums import UserRole


class UserRegister(BaseModel):
    email: str
    password: str
    role: UserRole = UserRole.BDR


class UserLogin(BaseModel):
    email: str
    password: str


class UserRead(BaseModel):
    id: int
    email: str
    role: UserRole
    phone_number: str | None = None

    model_config = {"from_attributes": True}


class CurrentUserRead(UserRead):
    has_assigned_leads: bool = False


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
