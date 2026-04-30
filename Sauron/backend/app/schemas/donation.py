from datetime import datetime

from pydantic import BaseModel


class DonationBase(BaseModel):
    person_id: int
    committee: str
    amount: float
    timestamp: datetime


class DonationCreate(DonationBase):
    pass


class DonationRead(DonationBase):
    id: int

    model_config = {"from_attributes": True}
