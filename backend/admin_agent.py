"""Admin Agent for WhatsApp-based conversation management.

This module allows designated admin users to manage parent conversations
directly through WhatsApp using natural language commands. It uses Groq
with tool calling to interpret admin requests and execute appropriate actions.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime

from sqlalchemy.orm import Session

from conversation_models import AdminUser, Conversation, Message
from models import Registration
from whatsapp_messages import send_text

logger = logging.getLogger("amc.admin_agent")

ADMIN_SYSTEM_PROMPT = """You are an admin assistant for AMC Aeromodelling Camp. You help camp administrators manage parent conversations via WhatsApp.

You have access to tools to:
1. List flagged conversations that need attention (get_flagged_conversations)
2. View details of any conversation by phone or parent name (get_conversation_details)
3. Send messages to parents to resolve their issues (send_message_to_user)
4. Mark conversations as resolved (mark_resolved)
5. Get a summary of all conversations (get_all_conversations)

Guidelines:
- Be concise and helpful
- Format responses for WhatsApp readability (use *bold* for emphasis, line breaks for structure)
- When listing items, number them clearly
- When a user mentions a name, use the tools to find the matching conversation
- After sending a message to a user, confirm it was sent
- If you're unsure what the admin wants, ask for clarification

The admin can ask things like:
- "Who needs help?" or "Show flagged conversations"
- "Tell me about Priya's issue" or "What's happening with 919876543210"
- "Send Priya: Hi, I'm following up on your query"
- "Mark Priya as resolved"
- "How many conversations do we have?"
"""

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_flagged_conversations",
            "description": "Get all conversations that are flagged as needing follow-up (bucket=needs_followup). Returns parent name, child name, phone, and the last message.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_conversation_details",
            "description": "Get full details of a specific conversation including message history and registration info. Can search by phone number or parent name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "identifier": {
                        "type": "string",
                        "description": "Phone number or parent name to search for",
                    },
                },
                "required": ["identifier"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_message_to_user",
            "description": "Send a WhatsApp message to a parent. Can specify recipient by phone number or parent name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "identifier": {
                        "type": "string",
                        "description": "Phone number or parent name of the recipient",
                    },
                    "message": {
                        "type": "string",
                        "description": "The message to send to the parent",
                    },
                },
                "required": ["identifier", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mark_resolved",
            "description": "Mark a conversation as resolved (changes bucket from needs_followup to new_enquiry). Can specify by phone number or parent name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "identifier": {
                        "type": "string",
                        "description": "Phone number or parent name to mark as resolved",
                    },
                },
                "required": ["identifier"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_all_conversations",
            "description": "Get a summary of all conversations with counts by status/bucket.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


def _normalize_phone(phone: str) -> str:
    """Normalize phone to digits only, keeping last 10."""
    digits = re.sub(r"\D", "", phone)
    return digits[-10:] if len(digits) >= 10 else digits


def _find_conversation_by_identifier(identifier: str, db: Session) -> Conversation | None:
    """Find a conversation by phone number or parent name."""
    identifier = identifier.strip()
    
    # Try direct phone match first
    conv = db.query(Conversation).filter(Conversation.phone == identifier).first()
    if conv:
        return conv
    
    # Try normalized phone match
    normalized = _normalize_phone(identifier)
    if normalized:
        conv = db.query(Conversation).filter(
            Conversation.phone.like(f"%{normalized}%")
        ).first()
        if conv:
            return conv
    
    # Try name match (case insensitive)
    conv = db.query(Conversation).filter(
        Conversation.parent_name.ilike(f"%{identifier}%")
    ).first()
    if conv:
        return conv
    
    # Try child name match
    conv = db.query(Conversation).filter(
        Conversation.child_name.ilike(f"%{identifier}%")
    ).first()
    
    return conv


def _get_registration_for_phone(phone: str, db: Session) -> Registration | None:
    """Get registration info for a phone number."""
    normalized = _normalize_phone(phone)
    if not normalized:
        return None
    
    return db.query(Registration).filter(
        Registration.phone.like(f"%{normalized}%")
    ).order_by(Registration.created_at.desc()).first()


# ---------------------------------------------------------------------------
# Tool Implementations
# ---------------------------------------------------------------------------


def tool_get_flagged_conversations(db: Session) -> str:
    """Get all conversations needing follow-up."""
    try:
        conversations = db.query(Conversation).filter(
            Conversation.bucket == "needs_followup"
        ).order_by(Conversation.updated_at.desc()).all()
        
        if not conversations:
            return "No flagged conversations at the moment."
        
        results = []
        for conv in conversations:
            last_msg = db.query(Message).filter(
                Message.phone == conv.phone,
                Message.direction == "in"
            ).order_by(Message.timestamp.desc()).first()
            
            results.append({
                "parent_name": conv.parent_name or "Unknown",
                "child_name": conv.child_name,
                "phone": conv.phone,
                "last_message": last_msg.body[:100] if last_msg else "No messages",
                "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            })
        
        return json.dumps(results, indent=2)
    except Exception as e:
        logger.exception("Error getting flagged conversations: %s", e)
        return f"Error: {str(e)}"


def tool_get_conversation_details(identifier: str, db: Session) -> str:
    """Get full details of a conversation."""
    try:
        conv = _find_conversation_by_identifier(identifier, db)
        if not conv:
            return f"No conversation found for '{identifier}'"
        
        # Get messages (last 10)
        messages = db.query(Message).filter(
            Message.phone == conv.phone
        ).order_by(Message.timestamp.desc()).limit(10).all()
        messages.reverse()
        
        # Get registration info
        reg = _get_registration_for_phone(conv.phone, db)
        
        result = {
            "phone": conv.phone,
            "parent_name": conv.parent_name,
            "child_name": conv.child_name,
            "bucket": conv.bucket,
            "bot_paused": conv.bot_paused,
            "registration": None,
            "recent_messages": [],
        }
        
        if reg:
            result["registration"] = {
                "email": reg.email,
                "age_group": reg.age_group,
                "batch_preference": reg.batch_preference,
                "payment_status": reg.payment_status,
                "villa": reg.villa_flat_number,
                "special_requirements": reg.special_requirements,
            }
        
        for msg in messages:
            result["recent_messages"].append({
                "direction": msg.direction,
                "sender": msg.sender,
                "body": msg.body[:200],
                "time": msg.timestamp.strftime("%H:%M %d/%m"),
            })
        
        return json.dumps(result, indent=2)
    except Exception as e:
        logger.exception("Error getting conversation details: %s", e)
        return f"Error: {str(e)}"


async def tool_send_message_to_user(identifier: str, message: str, db: Session) -> str:
    """Send a message to a user."""
    try:
        conv = _find_conversation_by_identifier(identifier, db)
        if not conv:
            return f"No conversation found for '{identifier}'"
        
        # Send the message
        await send_text(conv.phone, message)
        
        # Save to database
        msg = Message(
            phone=conv.phone,
            direction="out",
            body=message,
            sender="admin",
        )
        db.add(msg)
        conv.updated_at = datetime.utcnow()
        db.commit()
        
        return f"Message sent to {conv.parent_name or conv.phone}"
    except Exception as e:
        logger.exception("Error sending message: %s", e)
        return f"Error sending message: {str(e)}"


def tool_mark_resolved(identifier: str, db: Session) -> str:
    """Mark a conversation as resolved."""
    try:
        conv = _find_conversation_by_identifier(identifier, db)
        if not conv:
            return f"No conversation found for '{identifier}'"
        
        prev_bucket = conv.bucket
        conv.bucket = "new_enquiry"
        conv.updated_at = datetime.utcnow()
        db.commit()
        
        return f"Marked {conv.parent_name or conv.phone} as resolved (was: {prev_bucket})"
    except Exception as e:
        logger.exception("Error marking resolved: %s", e)
        return f"Error: {str(e)}"


def tool_get_all_conversations(db: Session) -> str:
    """Get summary of all conversations."""
    try:
        conversations = db.query(Conversation).all()
        
        bucket_counts = {}
        for conv in conversations:
            bucket_counts[conv.bucket] = bucket_counts.get(conv.bucket, 0) + 1
        
        result = {
            "total": len(conversations),
            "by_status": bucket_counts,
        }
        
        return json.dumps(result, indent=2)
    except Exception as e:
        logger.exception("Error getting all conversations: %s", e)
        return f"Error: {str(e)}"


# ---------------------------------------------------------------------------
# Main Agent Handler
# ---------------------------------------------------------------------------


def _make_groq_client():
    """Create Groq client if API key is available."""
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from groq import AsyncGroq
        return AsyncGroq(api_key=api_key)
    except Exception as e:
        logger.exception("Failed to create Groq client: %s", e)
        return None


def is_admin_phone(phone: str, db: Session) -> bool:
    """Check if a phone number belongs to an active admin."""
    try:
        normalized = _normalize_phone(phone)
        if not normalized:
            return False
        
        admin = db.query(AdminUser).filter(
            AdminUser.phone.like(f"%{normalized}%"),
            AdminUser.is_active == True,
        ).first()
        
        return admin is not None
    except Exception as e:
        logger.exception("Error checking admin phone: %s", e)
        return False


async def _execute_tool(tool_name: str, arguments: dict, db: Session) -> str:
    """Execute a tool and return the result."""
    if tool_name == "get_flagged_conversations":
        return tool_get_flagged_conversations(db)
    elif tool_name == "get_conversation_details":
        return tool_get_conversation_details(arguments.get("identifier", ""), db)
    elif tool_name == "send_message_to_user":
        return await tool_send_message_to_user(
            arguments.get("identifier", ""),
            arguments.get("message", ""),
            db
        )
    elif tool_name == "mark_resolved":
        return tool_mark_resolved(arguments.get("identifier", ""), db)
    elif tool_name == "get_all_conversations":
        return tool_get_all_conversations(db)
    else:
        return f"Unknown tool: {tool_name}"


async def handle_admin_message(phone: str, text: str, db: Session) -> str:
    """Handle a message from an admin user.
    
    Uses Groq with tool calling to interpret the admin's request and
    execute appropriate actions.
    """
    if not text or not text.strip():
        return "Please send a message with your request."
    
    client = _make_groq_client()
    if client is None:
        logger.warning("Admin agent: No Groq API key, using fallback")
        return (
            "Admin mode active, but AI assistant is unavailable.\n\n"
            "Available commands:\n"
            "- Type 'flagged' to see conversations needing attention\n"
            "- Type 'all' to see conversation counts"
        )
    
    messages = [
        {"role": "system", "content": ADMIN_SYSTEM_PROMPT},
        {"role": "user", "content": text.strip()},
    ]
    
    try:
        # First API call with tools
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
            max_tokens=1000,
            temperature=0.3,
        )
        
        assistant_message = response.choices[0].message
        
        # Check if we need to execute tools
        if assistant_message.tool_calls:
            messages.append(assistant_message)
            
            # Execute each tool call
            for tool_call in assistant_message.tool_calls:
                tool_name = tool_call.function.name
                try:
                    arguments = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    arguments = {}
                
                logger.info(f"Admin agent executing tool: {tool_name} with {arguments}")
                result = await _execute_tool(tool_name, arguments, db)
                
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                })
            
            # Second API call to get final response
            final_response = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                max_tokens=1000,
                temperature=0.3,
            )
            
            return final_response.choices[0].message.content or "Done."
        
        # No tools needed, return direct response
        return assistant_message.content or "I'm not sure how to help with that."
    
    except Exception as e:
        logger.exception("Admin agent error: %s", e)
        return f"Sorry, something went wrong. Error: {str(e)}"
