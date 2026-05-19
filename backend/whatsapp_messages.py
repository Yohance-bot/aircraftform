"""High-level WhatsApp message senders for the AMC bot.

Every public function is async and ultimately delegates to
:func:`whatsapp_client.send_whatsapp`. Phone numbers passed in are
in Meta's format (``91XXXXXXXXXX``, no leading ``+``).

Several senders accept an optional ``registration_context`` dict produced by
:func:`webhook_router.get_registration_context`. When provided, copy is
personalised (parent's first name, child's name, child-specific batch);
when ``None`` everything falls back to generic copy so unregistered users
still get a friendly response.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Iterable

from sqlalchemy.orm import Session

from models import Registration
from whatsapp_client import send_whatsapp

logger = logging.getLogger("amc.whatsapp")


# ---------------------------------------------------------------------------
# Phone helpers
# ---------------------------------------------------------------------------


def _to_meta_phone(stored_phone: str | None) -> str:
    """Normalize a stored phone (e.g. ``+919812345678``) to Meta format.

    Meta expects the wa_id without the leading ``+``, e.g. ``919812345678``.
    """
    if not stored_phone:
        return ""
    return re.sub(r"\D", "", stored_phone)


def _last_n_digits(phone: str | None, n: int = 10) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-n:] if len(digits) >= n else digits


# ---------------------------------------------------------------------------
# Batch helpers
# ---------------------------------------------------------------------------

WORKSHOP_PRICE = "Rs 7,499/-"
CAMP_PRICE = "Rs 11,999/-"
WORKSHOP_NAME = "Summer Workshop"
CAMP_NAME = "Summer Camp"


def _is_workshop_age(age_group: str | None) -> bool:
    """Return True if the registered age group falls into the 5-9 Workshop bracket.

    Heuristic: the lowercase age string contains any digit in 5-9 (workshop ages)
    while not matching the 10-14 Camp range. Works for the existing values
    ("6-9 years", "10-14 years") and for the older form ("6-8 years", "9-11
    years", "12-14 years").
    """
    if not age_group:
        return False
    age_str = age_group.lower()
    return any(d in age_str for d in ("5", "6", "7", "8", "9"))


def _batch_name_and_price(age_group: str | None) -> tuple[str, str]:
    if _is_workshop_age(age_group):
        return WORKSHOP_NAME, WORKSHOP_PRICE
    return CAMP_NAME, CAMP_PRICE


# ---------------------------------------------------------------------------
# Interactive menu (personalised)
# ---------------------------------------------------------------------------

_MENU_SECTIONS = [
    {
        "title": "Registration & Payment",
        "rows": [
            {
                "id": "register_child",
                "title": "📝 Register My Child",
                "description": "Register via WhatsApp chat",
            },
            {
                "id": "check_registration",
                "title": "Check My Registration",
                "description": "View your registration status",
            },
            {
                "id": "payment_info",
                "title": "Payment Information",
                "description": "Payment details and status",
            },
        ],
    },
    {
        "title": "Camp Information",
        "rows": [
            {
                "id": "schedule",
                "title": "Schedule & Timings",
                "description": "When and how long",
            },
            {
                "id": "what_to_bring",
                "title": "What to Bring",
                "description": "Packing checklist",
            },
            {
                "id": "age_eligibility",
                "title": "Age & Eligibility",
                "description": "Who can join",
            },
            {
                "id": "food",
                "title": "Food & Snacks",
                "description": "Meals and refreshments",
            },
            {
                "id": "location",
                "title": "Location & Logistics",
                "description": "Where we are",
            },
        ],
    },
    {
        "title": "Support",
        "rows": [
            {
                "id": "speak_to_us",
                "title": "Speak to Us",
                "description": "Talk to our team",
            },
        ],
    },
]


def _build_menu_interactive(registration_context: dict | None) -> dict:
    """Return the ``interactive`` block for the list menu, personalised when possible.

    WhatsApp list-message header text is limited to 60 characters, so the
    parent-greeting goes there in compact form and the longer welcome
    sentence (with payment nudge if any) goes in the body.
    """
    if registration_context:
        parent_first_name = registration_context.get("parent_name") or "there"
        child_name = registration_context.get("child_name") or "your child"
        payment = registration_context.get("payment_status") or "pending"
        siblings = bool(registration_context.get("siblings"))
        sibling_count = int(registration_context.get("sibling_count") or 0)

        header_text = f"Hi {parent_first_name}! 👋"
        # Header is capped at 60 chars by Meta.
        if len(header_text) > 60:
            header_text = header_text[:60]

        if siblings:
            body_text = (
                f"Welcome back! I can see {sibling_count + 1} children "
                "registered on this number 😊\n"
                "How can I help you today?"
            )
        else:
            body_text = (
                f"Welcome back! {child_name} is all set 🛩\n"
                "How can I help you today?"
            )

        if payment == "pending":
            body_text += (
                f"\n\n💳 Reminder: Payment is still pending for "
                f"{child_name}'s spot."
            )
    else:
        header_text = "🛩 AMC Aeromodelling Camp"
        body_text = (
            "Welcome to AMC Aeromodelling Camp! 🛩\n\n"
            "We have camps at *Palm Meadows* and *Prestige White Meadows*.\n\n"
            "Register your child or ask me anything!"
        )

    return {
        "type": "list",
        "header": {"type": "text", "text": header_text},
        "body": {"text": body_text},
        "footer": {"text": "💬 Or just type your question below!"},
        "action": {"button": "View Options", "sections": _MENU_SECTIONS},
    }


async def send_interactive_menu(
    phone: str,
    registration_context: dict | None = None,
) -> None:
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "interactive",
        "interactive": _build_menu_interactive(registration_context),
    }
    await send_whatsapp(payload)


# ---------------------------------------------------------------------------
# Plain text + back-to-menu button
# ---------------------------------------------------------------------------


async def send_text(phone: str, message: str) -> None:
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": message, "preview_url": False},
    }
    await send_whatsapp(payload)


async def send_back_to_menu_button(phone: str) -> None:
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": "Anything else I can help with?"},
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {"id": "back_to_menu", "title": "🏠 Main Menu"},
                    }
                ]
            },
        },
    }
    await send_whatsapp(payload)


# ---------------------------------------------------------------------------
# Registration check
# ---------------------------------------------------------------------------


def _format_registration_line(reg: Registration) -> str:
    batch = reg.batch_preference or "TBD"
    payment = reg.payment_status or "pending"
    return (
        f"• *{reg.child_name}*\n"
        f"   📅 Batch: {batch}\n"
        f"   💳 Payment: {payment}"
    )


async def handle_registration_check(
    phone: str,
    db: Session,
    registration_context: dict | None = None,
) -> None:
    """Reply with the parent's registration(s).

    If ``registration_context`` is supplied (already fetched by the
    dispatcher), we build the reply directly from it and skip the DB
    round-trip. Otherwise we fall back to the original last-10-digits
    lookup so the function still works standalone.
    """
    frontend_url = os.getenv("FRONTEND_URL", "").strip() or "the registration form"

    if registration_context is not None:
        parent_first = registration_context.get("parent_name") or "there"
        all_children = registration_context.get("all_children") or []
        siblings = bool(registration_context.get("siblings"))

        if siblings and len(all_children) > 1:
            # Multi-child case — re-fetch the rows so we can show batch +
            # payment status per child without bloating the context dict.
            last10 = _last_n_digits(phone, 10)
            matches = (
                db.query(Registration)
                .filter(Registration.phone.like(f"%{last10}%"))
                .order_by(Registration.created_at.desc())
                .all()
            )
            lines = "\n\n".join(_format_registration_line(r) for r in matches)
            message = (
                f"Hi {parent_first}! ✅\n\n"
                f"We found *{len(matches)} registrations* on this number 🛩\n\n"
                f"{lines}\n\n"
                "Questions? Just ask or tap Menu below."
            )
        else:
            child_name = registration_context.get("child_name") or "your child"
            batch = registration_context.get("batch_preference") or "TBD"
            payment = registration_context.get("payment_status") or "pending"
            message = (
                f"Hi {parent_first}! ✅\n\n"
                f"*{child_name}* is registered for AMC Camp 🛩\n"
                f"📅 Batch: {batch}\n"
                f"💳 Payment: {payment}\n\n"
                "Questions? Just ask or tap Menu below."
            )

        await send_text(phone, message)
        await send_back_to_menu_button(phone)
        return

    # ---- legacy / unregistered path: do the lookup ourselves -------------
    last10 = _last_n_digits(phone, 10)
    if not last10:
        await send_text(
            phone,
            "We couldn't read your number — please try again later 🙏",
        )
        await send_back_to_menu_button(phone)
        return

    pattern = f"%{last10}%"
    matches = (
        db.query(Registration)
        .filter(Registration.phone.like(pattern))
        .order_by(Registration.created_at.desc())
        .all()
    )

    if not matches:
        await send_text(
            phone,
            (
                "We couldn't find a registration for this number 🔍\n\n"
                f"Register here: {frontend_url}\n"
                "Or tap Menu for other options."
            ),
        )
        await send_back_to_menu_button(phone)
        return

    parent_name = matches[0].parent_name
    if len(matches) == 1:
        reg = matches[0]
        message = (
            f"Hi {parent_name}! ✅\n\n"
            f"*{reg.child_name}* is registered for AMC Camp 🛩\n"
            f"📅 Batch: {reg.batch_preference or 'TBD'}\n"
            f"💳 Payment: {reg.payment_status or 'pending'}\n\n"
            "Questions? Just ask or tap Menu below."
        )
    else:
        lines = "\n\n".join(_format_registration_line(reg) for reg in matches)
        message = (
            f"Hi {parent_name}! ✅\n\n"
            f"We found *{len(matches)} registrations* on this number 🛩\n\n"
            f"{lines}\n\n"
            "Questions? Just ask or tap Menu below."
        )

    await send_text(phone, message)
    await send_back_to_menu_button(phone)


# ---------------------------------------------------------------------------
# FAQ replies (personalised)
# ---------------------------------------------------------------------------

# Generic FAQ copy — used when the parent has no registration on file.
_GENERIC_FAQ: dict[str, str] = {
    "schedule": (
        "📅 *Camp Schedules*\n\n"
        "*Palm Meadows (10-day camp):*\n"
        "🛩 Ages 10–14 · 20 Apr–1 May · 10AM-12PM · ₹11,999\n"
        "✈️ Ages 5–9 · 4–15 May · 10AM-12PM · ₹7,499\n\n"
        "*Prestige White Meadows (5-day camp):*\n"
        "🛩 Ages 6–14 · 25-29 May or 1-5 June\n"
        "⏰ 9-11 AM or 3-5 PM slots\n\n"
        "📍 All materials included!"
    ),
    "bring": (
        "🎒 *What to Bring*\n\n"
        "✅ Water bottle\n"
        "✅ Comfortable clothes\n"
        "✅ Enthusiasm!\n\n"
        "Everything else is provided 😊"
    ),
    "age": (
        "✈️ *Age & Eligibility*\n\n"
        "👦 Ages 5–14 · Grades 1–10\n"
        "All skill levels welcome!"
    ),
    "food": (
        "🍫 *Food & Snacks*\n\n"
        "✅ Water & small snack provided\n"
        "❌ No full meals\n\n"
        "Please have breakfast before camp!"
    ),
    "location": (
        "📍 *Our Locations*\n\n"
        "*Palm Meadows:*\n"
        "Whitefield, Bangalore\n"
        "Exclusive for Palm Meadows residents\n\n"
        "*Prestige White Meadows:*\n"
        "Whitefield, Bangalore\n"
        "Exclusive for PWM residents"
    ),
}


def _personalised_schedule(registration_context: dict) -> str:
    child_name = registration_context.get("child_name") or "your child"
    age_group = registration_context.get("age_group")
    society = registration_context.get("society")
    timing_slot = registration_context.get("timing_slot")
    batch = registration_context.get("batch_preference") or "TBD"

    # Prestige White Meadows - 5 day camp
    if society == "prestige-white-meadows":
        return (
            f"📅 *{child_name}'s Schedule*\n\n"
            "🛩 Prestige White Meadows Camp (5 days)\n"
            f"   📅 Batch: {batch}\n"
            f"   ⏰ Timing: {timing_slot or 'TBD'}\n"
            "   📍 Prestige White Meadows"
        )

    # Palm Meadows - 10 day camp
    if _is_workshop_age(age_group):
        return (
            f"📅 *{child_name}'s Schedule*\n\n"
            "✈️ Summer Workshop (Ages 5-9)\n"
            "   📅 4th May - 15th May\n"
            "   ⏰ 10:00 AM - 12:00 PM\n"
            "   💰 Rs 7,499/- (All materials included!)\n"
            "   📍 Palm Meadows"
        )

    return (
        f"📅 *{child_name}'s Schedule*\n\n"
        "🛩 Summer Camp (Ages 10-14)\n"
        "   📅 20th April - 1st May\n"
        "   ⏰ 10:00 AM - 12:00 PM\n"
        "   💰 Rs 11,999/-\n"
        "   📍 Palm Meadows"
    )


def _personalised_what_to_bring(registration_context: dict) -> str:
    child_name = registration_context.get("child_name") or "your child"
    return (
        f"🎒 *What {child_name} needs to bring*\n\n"
        "✅ Water bottle\n"
        "✅ Comfortable clothes\n"
        "✅ Lots of enthusiasm!\n\n"
        "🎉 Everything else is provided — "
        "all materials included in the fee!"
    )


def _personalised_age(registration_context: dict) -> str:
    child_name = registration_context.get("child_name") or "your child"
    age_group = registration_context.get("age_group") or "your age group"
    batch = registration_context.get("batch_preference") or "your batch"
    return (
        f"✅ *{child_name} is all set!*\n\n"
        f"Age group: {age_group}\n"
        f"Registered for: {batch}\n\n"
        "They're in the right batch 😊\n"
        "Questions? 📞 9953517691 / 8050312758"
    )


async def send_faq_answer(
    phone: str,
    topic: str,
    registration_context: dict | None = None,
) -> None:
    if registration_context:
        if topic == "schedule":
            await send_text(phone, _personalised_schedule(registration_context))
            await send_back_to_menu_button(phone)
            return
        if topic == "bring":
            await send_text(phone, _personalised_what_to_bring(registration_context))
            await send_back_to_menu_button(phone)
            return
        if topic == "age":
            await send_text(phone, _personalised_age(registration_context))
            await send_back_to_menu_button(phone)
            return
        # food + location are not parent-specific — fall through to generic copy.

    body = _GENERIC_FAQ.get(topic)
    if body is None:
        logger.warning("send_faq_answer: unknown topic %r", topic)
        await send_text(
            phone,
            "Sorry — I don't have an answer for that yet. Tap Menu for other options 😊",
        )
        await send_back_to_menu_button(phone)
        return
    await send_text(phone, body)
    await send_back_to_menu_button(phone)


# ---------------------------------------------------------------------------
# Misc menu items (personalised where it helps)
# ---------------------------------------------------------------------------


_GENERIC_PAYMENT_INFO = (
    "💳 *Payment Information*\n\n"
    "🛩 Summer Camp (Ages 10-14): Rs 11,999/-\n"
    "✈️ Summer Workshop (Ages 5-9): Rs 7,499/-\n\n"
    "Payment details are shared within 24 hours of registration.\n\n"
    "📞 Contact us: 9953517691 / 8050312758"
)


async def send_payment_info(
    phone: str,
    registration_context: dict | None = None,
) -> None:
    if registration_context:
        child_name = registration_context.get("child_name") or "your child"
        payment = registration_context.get("payment_status") or "pending"
        age_group = registration_context.get("age_group")
        batch_name, price = _batch_name_and_price(age_group)

        if payment == "confirmed":
            msg = (
                f"💳 *Payment Status for {child_name}*\n\n"
                "✅ Payment confirmed!\n"
                f"Batch: {batch_name}\n"
                f"Amount: {price}\n\n"
                "See you at camp! 🛩"
            )
        else:
            msg = (
                f"💳 *Payment for {child_name}*\n\n"
                "⏳ Payment pending\n"
                f"Batch: {batch_name}\n"
                f"Amount: {price}\n\n"
                f"Please complete payment to confirm {child_name}'s spot.\n"
                "📞 Contact us: 9953517691 / 8050312758"
            )
        await send_text(phone, msg)
    else:
        await send_text(phone, _GENERIC_PAYMENT_INFO)

    await send_back_to_menu_button(phone)


async def send_speak_to_us(phone: str) -> None:
    contact_number = os.getenv("CONTACT_NUMBER", "+91XXXXXXXXXX").strip()
    await send_text(
        phone,
        (
            "🙏 *Contact Us*\n\n"
            f"📞 {contact_number}\n"
            "🌐 www.airmodelcrafts.com\n\n"
            "We'll get back to you shortly!"
        ),
    )
    await send_back_to_menu_button(phone)


# ---------------------------------------------------------------------------
# Post-registration confirmation
# ---------------------------------------------------------------------------


async def send_whatsapp_confirmation(registration: Registration) -> None:
    """Fire-and-forget confirmation message after a successful registration.

    Called from `/api/register` via FastAPI BackgroundTasks. Wrapped in a
    try/except so the registration response is never affected by a Meta
    or network failure.
    """
    try:
        phone = _to_meta_phone(registration.phone)
        if not phone:
            logger.warning(
                "send_whatsapp_confirmation: empty phone for registration id=%s",
                registration.id,
            )
            return
        batch = registration.batch_preference or "TBD"
        society = getattr(registration, "society", None) or "palm-meadows"
        timing_slot = getattr(registration, "timing_slot", None)

        # Determine location name
        if society == "prestige-white-meadows":
            location = "Prestige White Meadows"
            timing_info = f"⏰ Timing: {timing_slot}\n" if timing_slot else ""
        else:
            location = "Palm Meadows"
            timing_info = ""

        await send_text(
            phone,
            (
                f"Hi {registration.parent_name}! 🛩✅\n\n"
                f"We've received *{registration.child_name}'s* "
                f"registration for AMC Aeromodelling Camp!\n\n"
                f"📅 Batch: {batch}\n"
                f"{timing_info}"
                f"📍 Location: {location}\n\n"
                "We'll confirm your spot and share payment "
                "details within 24 hours.\n\n"
                "Say *Hi* anytime to see our menu or ask any questions! 😊"
            ),
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("send_whatsapp_confirmation failed: %s", exc)


__all__: Iterable[str] = (
    "send_interactive_menu",
    "send_text",
    "send_back_to_menu_button",
    "handle_registration_check",
    "send_faq_answer",
    "send_payment_info",
    "send_speak_to_us",
    "send_whatsapp_confirmation",
)
