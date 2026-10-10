"""Projects, tasks, time tracking, calendar events."""

from __future__ import annotations

import datetime as dt
from datetime import date, datetime
from typing import Optional

from sqlmodel import Field

from .base import Base, JSONField


class Project(Base, table=True):
    __tablename__ = "projects"

    name: str = Field(index=True)
    code: Optional[str] = None
    status: str = Field(default="active", index=True)  # planned|active|on_hold|completed|cancelled
    health: str = "on_track"  # on_track|at_risk|off_track
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id", index=True)
    deal_id: Optional[int] = Field(default=None, foreign_key="deals.id")
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id")
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    billing_mode: str = "fixed"  # fixed|time|retainer|non_billable
    budget_amount: float = 0
    budget_hours: float = 0
    hourly_rate: float = 0
    progress: int = 0
    color: str = "#5b6cff"
    description: Optional[str] = None
    tags: list = JSONField(list)


class Task(Base, table=True):
    __tablename__ = "tasks"

    title: str
    description: Optional[str] = None
    status: str = Field(default="todo", index=True)  # todo|in_progress|review|done|cancelled
    priority: str = "medium"  # low|medium|high|urgent
    type: str = "todo"  # todo|call|email|meeting|follow_up|deadline
    due_date: Optional[date] = Field(default=None, index=True)
    due_time: Optional[str] = None
    assignee_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    created_by_id: Optional[int] = Field(default=None, foreign_key="users.id")
    project_id: Optional[int] = Field(default=None, foreign_key="projects.id", index=True)
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id", index=True)
    deal_id: Optional[int] = Field(default=None, foreign_key="deals.id", index=True)
    ticket_id: Optional[int] = Field(default=None, foreign_key="tickets.id")
    position: float = 0
    completed_at: Optional[datetime] = None
    estimate_hours: Optional[float] = None
    checklist: list = JSONField(list)
    tags: list = JSONField(list)


class TimeEntry(Base, table=True):
    __tablename__ = "time_entries"

    user_id: int = Field(foreign_key="users.id", index=True)
    project_id: Optional[int] = Field(default=None, foreign_key="projects.id", index=True)
    task_id: Optional[int] = Field(default=None, foreign_key="tasks.id")
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id")
    date: dt.date = Field(index=True)
    minutes: int = 0
    description: Optional[str] = None
    billable: bool = True
    hourly_rate: Optional[float] = None
    invoice_id: Optional[int] = Field(default=None, foreign_key="invoices.id")
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class Event(Base, table=True):
    __tablename__ = "events"

    title: str
    description: Optional[str] = None
    start_at: datetime = Field(index=True)
    end_at: datetime
    all_day: bool = False
    location: Optional[str] = None
    meeting_url: Optional[str] = None
    type: str = "meeting"  # meeting|call|demo|deadline|focus|personal|other
    status: str = "confirmed"
    color: Optional[str] = None
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id")
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id")
    deal_id: Optional[int] = Field(default=None, foreign_key="deals.id")
    project_id: Optional[int] = Field(default=None, foreign_key="projects.id")
    attendees: list = JSONField(list)
    reminder_minutes: Optional[int] = 15
