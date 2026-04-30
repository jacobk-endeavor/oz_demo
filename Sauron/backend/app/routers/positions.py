from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_non_basic
from app.repositories.person_repo import PersonRepo
from app.repositories.position_repo import PositionRepo
from app.schemas.position import PositionRead, PositionUpdate

router = APIRouter(
    prefix="/api/positions", tags=["positions"], dependencies=[Depends(require_non_basic)]
)


@router.get("", response_model=list[PositionRead])
async def list_positions(db: AsyncSession = Depends(get_db)):
    repo = PositionRepo(db)
    return await repo.list_all()


@router.get("/{id}", response_model=PositionRead)
async def get_position(id: int, db: AsyncSession = Depends(get_db)):
    repo = PositionRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Position not found")
    return item


@router.patch("/{id}", response_model=PositionRead)
async def update_position(id: int, data: PositionUpdate, db: AsyncSession = Depends(get_db)):
    repo = PositionRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Position not found")
    await repo.update(item, data.model_dump(exclude_unset=True))
    await repo.commit()
    await repo.refresh(item)
    return item


@router.delete("/{id}", status_code=204)
async def delete_position(id: int, db: AsyncSession = Depends(get_db)):
    repo = PositionRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Position not found")
    person_id = item.person_id
    await repo.delete(item)
    remaining = await repo.count_for_person(person_id)
    if remaining == 0:
        person_repo = PersonRepo(db)
        person = await person_repo.get_by_id(person_id)
        if person:
            await person_repo.delete(person)
    await repo.commit()
