from sqlalchemy import select

from app.models.donation import Donation
from app.repositories._base_repo import BaseRepo


class DonationRepo(BaseRepo[Donation]):
    _model = Donation

    async def list_all(self) -> list[Donation]:
        result = await self._db.execute(select(Donation))
        return list(result.scalars().all())
