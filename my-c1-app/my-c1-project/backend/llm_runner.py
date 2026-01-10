from pydantic import BaseModel
from typing import (
    List,
    AsyncIterator,
    TypedDict,
    Literal,
)
import os
from openai import OpenAI
from dotenv import load_dotenv  # type: ignore
from datetime import datetime

from thread_store import Message, thread_store
from openai.types.chat import ChatCompletionMessageParam
from thesys_genui_sdk.context import get_assistant_message, write_content
from db import get_frames_collection, get_episodes_collection

load_dotenv()

# define the client
client = OpenAI(
    api_key=os.getenv("THESYS_API_KEY"),
    base_url="https://api.thesys.dev/v1/embed",
)

# define the prompt type in request
class Prompt(TypedDict):
    role: Literal["user"]
    content: str
    id: str

# define the request type
class ChatRequest(BaseModel):
    prompt: Prompt
    threadId: str
    responseId: str

    class Config:
        extra = "allow"  # Allow extra fields

async def get_relevant_context(user_query: str, limit: int = 10) -> str:
    """
    Retrieves relevant context from MongoDB based on user query.
    Returns a formatted string with context information.
    
    TODO: Customize this function to retrieve the context you want:
    - Recent activity episodes
    - Recent screenshots/frames
    - App usage statistics
    - Time-based queries
    """
    frames_collection = get_frames_collection()
    episodes_collection = get_episodes_collection()
    
    if frames_collection is None or episodes_collection is None:
        return "Database unavailable. Context cannot be retrieved."
    
    try:
        # Get recent episodes and frames
        recent_episodes = list(episodes_collection.find({}).sort("start_ts", -1).limit(5))
        recent_frames = list(frames_collection.find({}).sort("ts", -1).limit(limit))
        
        context_parts = []
        
        # Add episode context
        if recent_episodes:
            context_parts.append("Recent Activity Episodes:")
            for episode in recent_episodes:
                app_name = episode.get("app_name", "Unknown")
                frame_count = episode.get("frame_count", 0)
                start_ts = episode.get("start_ts", 0)
                if start_ts:
                    start_date = datetime.fromtimestamp(start_ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                    context_parts.append(f"- {app_name}: {frame_count} screenshots, started at {start_date}")
        
        # Add frame context (screenshots)
        if recent_frames:
            context_parts.append("\nRecent Screenshots:")
            for frame in recent_frames:
                app_name = frame.get("app_name", "Unknown")
                window_title = frame.get("window_title", "N/A")
                ts = frame.get("ts", 0)
                if ts:
                    frame_date = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                    context_parts.append(f"- {frame_date}: {app_name} - {window_title}")
        
        return "\n".join(context_parts) if context_parts else "No recent activity data available."
    
    except Exception as e:
        print(f"[CONTEXT] Error retrieving context: {e}")
        return f"Error retrieving context: {str(e)}"


async def generate_stream(chat_request: ChatRequest):
    conversation_history: List[ChatCompletionMessageParam] = thread_store.get_messages(chat_request.threadId)
    
    # Get relevant context from MongoDB (frames/episodes)
    user_query = chat_request.prompt['content']
    context = await get_relevant_context(user_query)
    
    # Add context as a system message if this is the first message in the conversation
    if not conversation_history:
        system_message: ChatCompletionMessageParam = {
            "role": "system",
            "content": f"""You are a helpful assistant that helps users understand their computer activity.
            You have access to their screenshots and app usage data stored in MongoDB.
            
            Current Context (from MongoDB):
            {context}
            
            Frames represent screenshots taken every minute.
            Episodes group frames by app_name (new episode when app changes).
            Be helpful and concise when answering questions about the user's activity."""
        }
        conversation_history.append(system_message)
        # Store system message in thread_store so it persists
        thread_store.append_message(chat_request.threadId, Message(
            openai_message=system_message,
            id=None
        ))
    
    # Append user's prompt
    conversation_history.append(chat_request.prompt)
    thread_store.append_message(chat_request.threadId, Message(
        openai_message=chat_request.prompt,
        id=chat_request.prompt['id']
    ))

    assistant_message_for_history: dict | None = None

    stream = client.chat.completions.create(
        messages=conversation_history,
        model="c1/anthropic/claude-sonnet-4/v-20250815",
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta
        finish_reason = chunk.choices[0].finish_reason

        if delta and delta.content:
            await write_content(delta.content)

        if finish_reason:
            assistant_message_for_history = get_assistant_message()

    if assistant_message_for_history:
        conversation_history.append(assistant_message_for_history)

        # Store the assistant message with the responseId
        thread_store.append_message(chat_request.threadId, Message(
            openai_message=assistant_message_for_history,
            id=chat_request.responseId # Assign responseId to the final assistant message
        ))
