"""Conversational WhatsApp registration flow for the AMC bot.

This module handles the entire step-by-step registration process over WhatsApp,
allowing parents to register their child without needing the web form.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timedelta

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, Session, mapped_column

from conversation_models import Message
from database import Base
from models import Registration
from whatsapp_messages import send_text

logger = logging.getLogger("amc.registration_flow")


def _save_bot_message(phone: str, body: str, db: Session) -> None:
    """Save an outbound bot message to the conversation history."""
    try:
        msg = Message(
            phone=phone,
            direction="out",
            body=body,
            sender="bot",
        )
        db.add(msg)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save bot message for {phone}: {e}")
        db.rollback()

FRONTEND_URL = os.getenv("FRONTEND_URL", "")
SESSION_EXPIRY_MINUTES = 30

__all__ = [
    "start_registration_flow",
    "handle_registration_step",
    "cancel_flow",
    "RegistrationSession",
]


class RegistrationSession(Base):
    """Tracks the current registration flow state for a phone number."""

    __tablename__ = "registration_sessions"

    phone: Mapped[str] = mapped_column(String(20), primary_key=True)
    step: Mapped[str] = mapped_column(String(50), nullable=False)
    data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


STEPS = [
    "ask_child_name",
    "ask_age_group",
    "ask_grade",
    "ask_villa",
    "ask_special",
    "ask_batch",
    "ask_parent_name",
    "ask_email",
    "confirm",
    "done",
]

CONTACT_NUMBERS = "7015410570 / 8050312758"


def _get_price(age_group: str) -> str:
    """Return the price string based on age group."""
    if age_group == "6-9 years":
        return "₹7,499"
    elif age_group == "10-14 years":
        return "₹11,999"
    return "TBD"


def _last_10_digits(phone: str) -> str:
    """Extract last 10 digits from a phone number."""
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 10 else digits


def _get_session_data(session: RegistrationSession) -> dict:
    """Parse session data JSON safely."""
    if not session.data:
        return {}
    try:
        return json.loads(session.data)
    except (json.JSONDecodeError, TypeError):
        return {}


def _set_session_data(session: RegistrationSession, data: dict) -> None:
    """Store data dict as JSON in session."""
    session.data = json.dumps(data)


async def _send_and_save(phone: str, msg: str, db: Session | None) -> None:
    """Send a message and save it to the conversation history."""
    await send_text(phone, msg)
    if db:
        _save_bot_message(phone, msg, db)


async def _send_error_message(phone: str, db: Session | None = None) -> None:
    """Send a generic error message."""
    msg = f"Something went wrong — please try again or contact us:\n📞 {CONTACT_NUMBERS}"
    await _send_and_save(phone, msg, db)


async def _send_expired_message(phone: str, db: Session | None = None) -> None:
    """Send session expired message."""
    msg = "Your registration session expired ⏰\n\nSay Hi to start again"
    if FRONTEND_URL:
        msg += f" or visit:\n{FRONTEND_URL}"
    await _send_and_save(phone, msg, db)


async def _send_cancel_message(phone: str, db: Session | None = None) -> None:
    """Send cancellation confirmation."""
    msg = "No problem! Registration cancelled 😊\n\nYou can register anytime"
    if FRONTEND_URL:
        msg += f" at:\n{FRONTEND_URL}\n\n"
    else:
        msg += ".\n\n"
    msg += "Or say Hi to start again!"
    await _send_and_save(phone, msg, db)


async def start_registration_flow(phone: str, db: Session) -> None:
    """Called when parent taps 'Register My Child' from menu.
    
    Creates/resets a RegistrationSession for this phone at step ask_child_name.
    Sends the first message.
    """
    try:
        session = db.query(RegistrationSession).filter(
            RegistrationSession.phone == phone
        ).first()

        if session:
            session.step = "ask_child_name"
            session.data = "{}"
            session.updated_at = datetime.utcnow()
        else:
            session = RegistrationSession(
                phone=phone,
                step="ask_child_name",
                data="{}",
            )
            db.add(session)

        db.commit()
    except Exception as e:
        logger.error(f"Failed to start registration flow for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone)
        return

    await _send_and_save(phone, "What's your child's name? 👦", db)


async def handle_registration_step(phone: str, text: str, db: Session) -> bool:
    """Called from webhook when a phone has an active session.
    
    Processes the text input for the current step, advances to next step.
    Returns True if this phone is in an active flow (so webhook skips Groq).
    Returns False if no active session exists.
    """
    try:
        session = db.query(RegistrationSession).filter(
            RegistrationSession.phone == phone
        ).first()
    except Exception as e:
        logger.error(f"Failed to query registration session for {phone}: {e}")
        return False

    if not session:
        return False

    if session.step == "done":
        try:
            db.delete(session)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to delete completed session for {phone}: {e}")
            db.rollback()
        return False

    if session.updated_at and datetime.utcnow() - session.updated_at > timedelta(minutes=SESSION_EXPIRY_MINUTES):
        try:
            db.delete(session)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to delete expired session for {phone}: {e}")
            db.rollback()
        await _send_expired_message(phone, db)
        return True

    text_lower = text.strip().lower()
    if text_lower in ("cancel", "stop"):
        await cancel_flow(phone, db)
        return True

    data = _get_session_data(session)
    current_step = session.step

    try:
        if current_step == "ask_child_name":
            await _handle_ask_child_name(phone, text, session, data, db)
        elif current_step == "ask_age_group":
            await _handle_ask_age_group(phone, text, session, data, db)
        elif current_step == "ask_grade":
            await _handle_ask_grade(phone, text, session, data, db)
        elif current_step == "ask_villa":
            await _handle_ask_villa(phone, text, session, data, db)
        elif current_step == "ask_special":
            await _handle_ask_special(phone, text, session, data, db)
        elif current_step == "ask_batch":
            await _handle_ask_batch(phone, text, session, data, db)
        elif current_step == "ask_parent_name":
            await _handle_ask_parent_name(phone, text, session, data, db)
        elif current_step == "ask_email":
            await _handle_ask_email(phone, text, session, data, db)
        elif current_step == "confirm":
            await _handle_confirm(phone, text, session, data, db)
        else:
            logger.warning(f"Unknown step {current_step} for {phone}")
            await _send_error_message(phone, db)
    except Exception as e:
        logger.error(f"Error handling step {current_step} for {phone}: {e}")
        await _send_error_message(phone, db)

    return True


async def cancel_flow(phone: str, db: Session) -> None:
    """Deletes the session for this phone and sends cancellation message."""
    try:
        session = db.query(RegistrationSession).filter(
            RegistrationSession.phone == phone
        ).first()
        if session:
            db.delete(session)
            db.commit()
    except Exception as e:
        logger.error(f"Failed to cancel flow for {phone}: {e}")
        db.rollback()

    await _send_cancel_message(phone, db)


async def _handle_ask_child_name(
    phone: str, text: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Handle child name input."""
    child_name = text.strip()
    if not child_name:
        await _send_and_save(phone, "Please enter your child's name 👦", db)
        return

    data["child_name"] = child_name
    _set_session_data(session, data)
    session.step = "ask_age_group"
    session.updated_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save child name for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone, db)
        return

    await _send_age_group_options(phone, child_name, db)


async def _send_age_group_options(phone: str, child_name: str, db: Session | None = None) -> None:
    """Send age group selection message."""
    msg = f"""👦 How old is {child_name}?

Reply *1* for Ages 5–9
✈️ Summer Workshop · ₹7,499 · 4–15 May

Reply *2* for Ages 10–14
🛩 Summer Camp · ₹11,999 · 20 Apr–1 May"""
    await _send_and_save(phone, msg, db)


async def _handle_ask_age_group(
    phone: str, text: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Handle age group selection."""
    choice = text.strip()

    if choice == "1":
        data["age_group"] = "6-9 years"
    elif choice == "2":
        data["age_group"] = "10-14 years"
    else:
        child_name = data.get("child_name", "your child")
        await _send_age_group_options(phone, child_name, db)
        return

    _set_session_data(session, data)
    session.step = "ask_grade"
    session.updated_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save age group for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone, db)
        return

    child_name = data.get("child_name", "your child")
    await _send_and_save(phone, f"What class/grade is {child_name} in? 📚", db)


async def _handle_ask_grade(
    phone: str, text: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Handle grade input."""
    grade = text.strip()
    if not grade:
        child_name = data.get("child_name", "your child")
        await _send_and_save(phone, f"What class/grade is {child_name} in? 📚", db)
        return

    data["class_grade"] = grade
    _set_session_data(session, data)
    session.step = "ask_villa"
    session.updated_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save grade for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone, db)
        return

    await _send_and_save(phone, "What's your villa or flat number at Palm Meadows? 🏠", db)


async def _handle_ask_villa(
    phone: str, text: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Handle villa/flat number input."""
    villa = text.strip()
    if not villa:
        await _send_and_save(phone, "What's your villa or flat number at Palm Meadows? 🏠", db)
        return

    data["villa_flat_number"] = villa
    _set_session_data(session, data)
    session.step = "ask_special"
    session.updated_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save villa for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone, db)
        return

    await _send_and_save(phone, "Any special requirements? (Reply 'none' if not) 📝", db)


async def _handle_ask_special(
    phone: str, text: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Handle special requirements input."""
    special = text.strip()
    if not special:
        await _send_and_save(phone, "Any special requirements? (Reply 'none' if not) 📝", db)
        return

    if special.lower() in ("none", "no"):
        data["special_requirements"] = None
    else:
        data["special_requirements"] = special

    _set_session_data(session, data)
    session.step = "ask_batch"
    session.updated_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save special requirements for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone, db)
        return

    await _send_batch_options(phone, db)


async def _send_batch_options(phone: str, db: Session | None = None) -> None:
    """Send batch selection message."""
    msg = """📅 Which batch do you prefer?

Reply *1* for Batch A
🛩 Summer Camp: 20 Apr – 1 May (Ages 10-14)
✈️ Workshop: 4 May – 15 May (Ages 5-9)

Reply *2* for Batch B (if available)
Or type your preferred dates"""
    await _send_and_save(phone, msg, db)


async def _handle_ask_batch(
    phone: str, text: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Handle batch preference input."""
    choice = text.strip()
    if not choice:
        await _send_batch_options(phone, db)
        return

    if choice == "1":
        data["batch_preference"] = "Batch A"
    elif choice == "2":
        data["batch_preference"] = "Batch B"
    else:
        data["batch_preference"] = choice

    _set_session_data(session, data)
    session.step = "ask_parent_name"
    session.updated_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save batch for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone, db)
        return

    await _send_and_save(phone, "And your name, please? 👨", db)


async def _handle_ask_parent_name(
    phone: str, text: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Handle parent name input."""
    parent_name = text.strip()
    if not parent_name:
        await _send_and_save(phone, "And your name, please? 👨", db)
        return

    data["parent_name"] = parent_name
    _set_session_data(session, data)
    session.step = "ask_email"
    session.updated_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save parent name for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone, db)
        return

    await _send_and_save(phone, "What's your email address? 📧", db)


async def _handle_ask_email(
    phone: str, text: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Handle email input with basic validation."""
    email = text.strip()

    if not email or "@" not in email or "." not in email:
        await _send_and_save(phone, "Please enter a valid email address 📧", db)
        return

    data["email"] = email
    _set_session_data(session, data)
    session.step = "confirm"
    session.updated_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save email for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone, db)
        return

    await _send_confirmation_summary(phone, data, db)


async def _send_confirmation_summary(phone: str, data: dict, db: Session | None = None) -> None:
    """Send registration summary for confirmation."""
    child_name = data.get("child_name", "—")
    class_grade = data.get("class_grade", "—")
    villa = data.get("villa_flat_number", "—")
    parent_name = data.get("parent_name", "—")
    email = data.get("email", "—")
    batch = data.get("batch_preference", "—")
    age_group = data.get("age_group", "")
    price = _get_price(age_group)

    msg = f"""✅ *Registration Summary*

👦 Child: {child_name}
📚 Grade: {class_grade}
🏠 Villa: {villa}
👨 Parent: {parent_name}
📧 Email: {email}
📅 Batch: {batch}
💰 Amount: {price}

Reply *YES* to confirm registration
Reply *NO* to start over
Reply *CANCEL* to exit"""
    await _send_and_save(phone, msg, db)


async def _handle_confirm(
    phone: str, text: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Handle confirmation response."""
    response = text.strip().lower()

    if response == "yes":
        await _complete_registration(phone, session, data, db)
    elif response == "no":
        try:
            db.delete(session)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to delete session for restart for {phone}: {e}")
            db.rollback()
        await start_registration_flow(phone, db)
    elif response == "cancel":
        await cancel_flow(phone, db)
    else:
        await _send_confirmation_summary(phone, data, db)


async def _complete_registration(
    phone: str, session: RegistrationSession, data: dict, db: Session
) -> None:
    """Create the Registration record and send confirmation."""
    last_10 = _last_10_digits(phone)
    formatted_phone = f"+91{last_10}"

    child_name = data.get("child_name", "")
    age_group = data.get("age_group", "")
    price = _get_price(age_group)

    try:
        registration = Registration(
            parent_name=data.get("parent_name", ""),
            child_name=child_name,
            phone_country_code="+91",
            phone=formatted_phone,
            email=data.get("email", ""),
            age_group=age_group,
            class_grade=data.get("class_grade", ""),
            villa_flat_number=data.get("villa_flat_number"),
            special_requirements=data.get("special_requirements"),
            batch_preference=data.get("batch_preference"),
            payment_status="pending",
        )
        db.add(registration)
        db.delete(session)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to create registration for {phone}: {e}")
        db.rollback()
        await _send_error_message(phone, db)
        return

    confirmation_msg = f"""🎉 *{child_name} is registered!*

We'll contact you within 24 hours with payment details.

💰 Amount due: {price}
📞 Questions? {CONTACT_NUMBERS}

Say *Hi* anytime to check your registration status 😊"""
    await _send_and_save(phone, confirmation_msg, db)
