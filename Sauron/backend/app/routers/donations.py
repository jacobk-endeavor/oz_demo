from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_non_basic
from app.repositories.donation_repo import DonationRepo
from app.schemas.donation import DonationRead

router = APIRouter(
    prefix="/api/donations", tags=["donations"], dependencies=[Depends(require_non_basic)]
)


@router.get("", response_model=list[DonationRead])
async def list_donations(db: AsyncSession = Depends(get_db)):
    repo = DonationRepo(db)
    return await repo.list_all()


@router.get("/{id}", response_model=DonationRead)
async def get_donation(id: int, db: AsyncSession = Depends(get_db)):
    repo = DonationRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Donation not found")
    return item


@router.delete("/{id}", status_code=204)
async def delete_donation(id: int, db: AsyncSession = Depends(get_db)):
    repo = DonationRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Donation not found")
    await repo.delete(item)
    await repo.commit()
