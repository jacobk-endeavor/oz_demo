from sqlalchemy import func, or_, select

from app.models.enums import UserRole
from app.models.user import User
from app.repositories._base_repo import BaseRepo


class UserRepo(BaseRepo[User]):
    _model = User

    async def create(  # type: ignore[override]
        self,
        email: str,
        password: str,
        role: UserRole = UserRole.BDR,
    ) -> User:
        user = User(email=email, password=password, role=role)
        self._db.add(user)
        await self._db.flush()
        return user

    async def get_by_email(self, email: str) -> User | None:
        result = await self._db.execute(
            select(User).where(func.lower(User.email) == email.lower())
        )
        return result.scalar_one_or_none()

    async def search(self, pattern: str, limit: int) -> list[User]:
        user_pattern = f"%{pattern}%"
        result = await self._db.execute(
            select(User)
            .where(
                or_(
                    User.first_name.ilike(user_pattern),
                    User.last_name.ilike(user_pattern),
                    User.nick_name.ilike(user_pattern),
                    User.email.ilike(user_pattern),
                )
            )
            .order_by(User.first_name.asc(), User.last_name.asc(), User.email.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_id_email_pairs(self) -> list[tuple[int, str]]:
        result = await self._db.execute(select(User.id, User.email))
        return list(result.all())

    async def list_known_emails(self, emails: list[str]) -> set[str]:
        result = await self._db.execute(
            select(func.lower(User.email)).where(
                func.lower(User.email).in_(emails)
            )
        )
        return set(result.scalars().all())
