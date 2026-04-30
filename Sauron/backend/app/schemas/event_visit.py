from pydantic import BaseModel


class EventVisitCompanyBase(BaseModel):
    company_id: int
    event_id: int
    is_sponsor: bool = False


class EventVisitCompanyCreate(EventVisitCompanyBase):
    pass


class EventVisitCompanyRead(EventVisitCompanyBase):
    id: int

    model_config = {"from_attributes": True}


class EventVisitPersonBase(BaseModel):
    person_id: int
    event_id: int
    is_keynote_speaker: bool = False


class EventVisitPersonCreate(EventVisitPersonBase):
    pass


class EventVisitPersonRead(EventVisitPersonBase):
    id: int

    model_config = {"from_attributes": True}
