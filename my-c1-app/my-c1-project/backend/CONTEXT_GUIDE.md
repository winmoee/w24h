# AI Context Guide

## Architecture Overview

### Frontend (`ui/src/App.tsx`)
- Uses `<C1Chat apiUrl="/api/chat" />` component from `@thesysai/genui-sdk`
- This is a pre-built chat UI component that handles the interface
- Sends chat requests to `/api/chat` endpoint

### Backend (`backend/main.py`)
- `/chat` endpoint receives `ChatRequest` with:
  - `prompt`: User's message
  - `threadId`: Conversation thread ID
  - `responseId`: Response ID
- Forwards to `llm_runner.generate_stream()`

### LLM Runner (`backend/llm_runner.py`)
- **This is where you add context to the AI**
- Current flow:
  1. Gets conversation history from `thread_store`
  2. Appends user's prompt
  3. Sends to OpenAI API with conversation history
  4. Returns streaming response

## Where to Add Context

### Option 1: System Message (Static Context)

Add a system message that's included at the start of every conversation. Modify `llm_runner.py`:

```python
async def generate_stream(chat_request: ChatRequest):
    conversation_history: List[ChatCompletionMessageParam] = thread_store.get_messages(chat_request.threadId)
    
    # Add system message if this is a new conversation (first message)
    if not conversation_history:
        system_message: ChatCompletionMessageParam = {
            "role": "system",
            "content": """You are a helpful assistant that helps users understand their computer activity.
            You have access to their screenshots and app usage data stored in MongoDB.
            Frames represent screenshots taken every minute.
            Episodes group frames by app_name (new episode when app changes).
            Be helpful and concise."""
        }
        conversation_history.append(system_message)
        # Store system message in thread_store so it persists
        thread_store.append_message(chat_request.threadId, Message(
            openai_message=system_message,
            id=None
        ))
    
    conversation_history.append(chat_request.prompt)
    # ... rest of the function
```

### Option 2: Dynamic Context from MongoDB (Recommended)

Retrieve relevant context from MongoDB based on the user's query. Modify `llm_runner.py`:

```python
from db import get_frames_collection, get_episodes_collection
from typing import Optional

async def get_relevant_context(user_query: str, limit: int = 10) -> str:
    """
    Retrieves relevant context from MongoDB based on user query.
    Returns a formatted string with context information.
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
                # Convert timestamp to readable date
                from datetime import datetime
                start_date = datetime.fromtimestamp(start_ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                context_parts.append(f"- {app_name}: {frame_count} screenshots, started at {start_date}")
        
        # Add frame context (screenshots)
        if recent_frames:
            context_parts.append("\nRecent Screenshots:")
            for frame in recent_frames:
                app_name = frame.get("app_name", "Unknown")
                window_title = frame.get("window_title", "N/A")
                ts = frame.get("ts", 0)
                from datetime import datetime
                frame_date = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                context_parts.append(f"- {frame_date}: {app_name} - {window_title}")
        
        return "\n".join(context_parts) if context_parts else "No recent activity data available."
    
    except Exception as e:
        print(f"[CONTEXT] Error retrieving context: {e}")
        return f"Error retrieving context: {str(e)}"

async def generate_stream(chat_request: ChatRequest):
    conversation_history: List[ChatCompletionMessageParam] = thread_store.get_messages(chat_request.threadId)
    
    # Get relevant context from MongoDB
    user_query = chat_request.prompt.get('content', '')
    context = await get_relevant_context(user_query)
    
    # Add context as a system message if it's the first message, or append to conversation
    if not conversation_history:
        # First message: add system message with context
        system_message: ChatCompletionMessageParam = {
            "role": "system",
            "content": f"""You are a helpful assistant that helps users understand their computer activity.
            You have access to their screenshots and app usage data.
            
            Current Context (from MongoDB):
            {context}
            
            Frames represent screenshots taken every minute.
            Episodes group frames by app_name (new episode when app changes).
            Be helpful and concise when answering questions about the user's activity."""
        }
        conversation_history.append(system_message)
        thread_store.append_message(chat_request.threadId, Message(
            openai_message=system_message,
            id=None
        ))
    else:
        # Not first message: add context as an assistant message (or user message with context)
        context_message: ChatCompletionMessageParam = {
            "role": "assistant",
            "content": f"[Context Update] {context}"
        }
        conversation_history.append(context_message)
    
    conversation_history.append(chat_request.prompt)
    thread_store.append_message(chat_request.threadId, Message(
        openai_message=chat_request.prompt,
        id=chat_request.prompt['id']
    ))
    
    # ... rest of the function
```

### Option 3: Query-Based Context Retrieval (Semantic Search)

For more advanced context retrieval, you could implement semantic search using embeddings. This would require:

1. Generate embeddings for frames/episodes
2. Compare user query embedding with stored embeddings
3. Retrieve most relevant context

```python
# Example with vector search (requires embedding setup)
async def get_relevant_context_semantic(user_query: str, limit: int = 5) -> str:
    """
    Retrieves context using semantic similarity (requires embeddings).
    """
    # This would require:
    # 1. Embedding service (e.g., OpenAI embeddings)
    # 2. Vector search in MongoDB (Atlas Vector Search)
    # 3. Similarity scoring
    
    # Pseudo-code:
    # query_embedding = get_embedding(user_query)
    # similar_frames = frames_collection.aggregate([
    #     {"$vectorSearch": {...}}
    # ])
    # return format_context(similar_frames)
    pass
```

## Implementation Steps

1. **Modify `llm_runner.py`**:
   - Add context retrieval function (Option 2 recommended)
   - Modify `generate_stream()` to include context
   - Add system message for initial context

2. **Test Context Injection**:
   - Start the backend server
   - Send a chat request
   - Check that context is included in the conversation history
   - Verify AI responses use the context

3. **Customize Context**:
   - Adjust what data to include (episodes, frames, app names, timestamps)
   - Format context in a way that's useful for the AI
   - Add filtering (e.g., only recent activity, specific apps)

## Example Context Format

The context should be formatted as a readable string that the AI can understand:

```
Recent Activity Episodes:
- Google Chrome: 15 screenshots, started at 2026-01-10 13:00:00
- VS Code: 8 screenshots, started at 2026-01-10 13:15:00
- Terminal: 3 screenshots, started at 2026-01-10 13:20:00

Recent Screenshots:
- 2026-01-10 13:59:37: Electron - Screenshot App
- 2026-01-10 13:58:37: Google Chrome - GitHub - Pull Requests
- 2026-01-10 13:57:37: VS Code - main.py
```

## Current Files to Modify

1. **`backend/llm_runner.py`** - Main file where context is injected
2. **`backend/db.py`** - Already set up for MongoDB queries (no changes needed)
3. **`backend/main.py`** - Chat endpoint (no changes needed, just passes request)

## Testing

After adding context, test with queries like:
- "What apps have I been using recently?"
- "Show me my recent activity"
- "What was I doing 10 minutes ago?"
- "Which app do I use the most?"

The AI should be able to answer these using the context from MongoDB.

