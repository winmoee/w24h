from pydantic import BaseModel
from typing import (
    List,
    AsyncIterator,
    TypedDict,
    Literal,
    Optional,
)
import os
import math
from openai import OpenAI
from dotenv import load_dotenv  # type: ignore
from datetime import datetime

from thread_store import Message, thread_store
from openai.types.chat import ChatCompletionMessageParam
from thesys_genui_sdk.context import get_assistant_message, write_content
from db import get_frames_collection, get_episodes_collection
from voyage import embed_text, rerank

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

def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """
    Calculate cosine similarity between two vectors
    """
    if len(vec1) != len(vec2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = math.sqrt(sum(a * a for a in vec1))
    magnitude2 = math.sqrt(sum(a * a for a in vec2))
    
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0
    
    return dot_product / (magnitude1 * magnitude2)


async def get_relevant_context(user_query: str, limit: int = 10) -> str:
    """
    Retrieves relevant context from MongoDB using semantic search with embeddings and reranking.
    
    Process:
    1. Generate query embedding
    2. Find episodes/frames with embeddings using cosine similarity
    3. Use Voyage AI reranker to improve relevance
    4. Return formatted context string
    """
    frames_collection = get_frames_collection()
    episodes_collection = get_episodes_collection()
    
    if frames_collection is None or episodes_collection is None:
        return "Database unavailable. Context cannot be retrieved."
    
    try:
        # Generate query embedding
        print(f"[CONTEXT] Generating embedding for query: {user_query[:50]}...")
        query_embedding = await embed_text(user_query)
        
        # Find episodes with embeddings - use projection to only fetch needed fields
        # Limit to reasonable number to avoid timeouts (e.g., 50 most recent)
        episodes_with_embeddings = list(episodes_collection.find(
            {"text_embedding": {"$exists": True, "$ne": None}},
            {
                "text_embedding": 1,
                "episode_id": 1,
                "app_name": 1,
                "summary": 1,
                "frame_count": 1,
                "start_ts": 1,
                "end_ts": 1
            }
        ).sort("start_ts", -1).limit(50))  # Limit to 50 most recent to avoid timeouts
        
        # Calculate similarity scores for episodes
        episode_scores = []
        for episode in episodes_with_embeddings:
            text_embedding = episode.get("text_embedding")
            if text_embedding:
                similarity = cosine_similarity(query_embedding, text_embedding)
                episode_scores.append((similarity, episode))
        
        # Sort by similarity (descending)
        episode_scores.sort(key=lambda x: x[0], reverse=True)
        
        # Get top episodes for reranking (take more than limit for reranking, but cap at reasonable number)
        rerank_candidates = min(limit * 2, 20)  # Cap at 20 to avoid reranking too many
        top_episodes = episode_scores[:rerank_candidates]
        
        # Prepare documents for reranking
        episode_documents = []
        episode_metadata = []
        for score, episode in top_episodes:
            summary = episode.get("summary", "")
            app_name = episode.get("app_name", "Unknown")
            frame_count = episode.get("frame_count", 0)
            start_ts = episode.get("start_ts", 0)
            
            # Create document text for reranking
            doc_text = f"App: {app_name}. {summary}"
            if start_ts:
                start_date = datetime.fromtimestamp(start_ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                doc_text += f" Started: {start_date}."
            
            episode_documents.append(doc_text)
            episode_metadata.append(episode)
        
        # Rerank episodes if we have documents
        reranked_episodes = []
        if episode_documents:
            try:
                # Only rerank if we have a reasonable number of documents
                if len(episode_documents) > 1:
                    print(f"[CONTEXT] Reranking {len(episode_documents)} episodes...")
                    rerank_results = await rerank(user_query, episode_documents, top_k=min(limit, len(episode_documents)))
                else:
                    # Skip reranking for single document
                    rerank_results = [{"index": 0, "relevance_score": 1.0}]
                
                # Map reranked results back to episodes
                for result in rerank_results:
                    idx = result["index"]
                    if idx < len(episode_metadata):
                        reranked_episodes.append(episode_metadata[idx])
            except Exception as e:
                print(f"[CONTEXT] Reranking failed, using similarity scores: {e}")
                # Fallback to similarity-based ranking
                reranked_episodes = [ep for _, ep in top_episodes[:limit]]
        else:
            # No embeddings available, fallback to recent episodes
            reranked_episodes = list(episodes_collection.find({}).sort("start_ts", -1).limit(limit))
        
        # Find frames with embeddings (for visual context)
        # Limit to recent frames and use projection to avoid loading large embedding vectors unnecessarily
        # Only fetch a reasonable number to avoid timeouts
        top_frames = []
        try:
            frames_with_embeddings = list(frames_collection.find(
                {
                    "image_embedding": {"$exists": True, "$ne": None},
                    "blob_url": {"$exists": True, "$ne": None}
                },
                {
                    "image_embedding": 1,
                    "frame_id": 1,
                    "app_name": 1,
                    "window_title": 1,
                    "ts": 1,
                    "blob_url": 1
                }
            ).sort("ts", -1).limit(30))  # Limit to 30 most recent frames to avoid timeouts
            
            # Calculate similarity for frames (using query embedding - may not be perfect but gives some relevance)
            frame_scores = []
            for frame in frames_with_embeddings:
                image_embedding = frame.get("image_embedding")
                if image_embedding:
                    # Note: Query embedding is text-based, frame embedding is image-based
                    # This similarity may not be perfect, but provides some relevance signal
                    similarity = cosine_similarity(query_embedding, image_embedding)
                    frame_scores.append((similarity, frame))
            
            # Sort frames by similarity
            frame_scores.sort(key=lambda x: x[0], reverse=True)
            top_frames = [frame for _, frame in frame_scores[:limit]]
        except Exception as frame_error:
            print(f"[CONTEXT] Error fetching frames (skipping frames): {frame_error}")
            # Skip frames if there's an error - episodes are more important
        
        # Build context string
        context_parts = []
        
        # Add relevant episodes
        if reranked_episodes:
            context_parts.append("Relevant Activity Episodes (semantically matched):")
            for episode in reranked_episodes[:limit]:
                app_name = episode.get("app_name", "Unknown")
                summary = episode.get("summary", "No summary available")
                frame_count = episode.get("frame_count", 0)
                start_ts = episode.get("start_ts", 0)
                end_ts = episode.get("end_ts")
                
                episode_info = f"- {app_name}: {summary}"
                if start_ts:
                    start_date = datetime.fromtimestamp(start_ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                    episode_info += f" (Started: {start_date})"
                if end_ts:
                    end_date = datetime.fromtimestamp(end_ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                    episode_info += f" (Ended: {end_date})"
                
                context_parts.append(episode_info)
        
        # Add relevant frames
        if top_frames:
            context_parts.append("\nRelevant Screenshots (semantically matched):")
            for frame in top_frames[:limit]:
                app_name = frame.get("app_name", "Unknown")
                window_title = frame.get("window_title", "N/A")
                ts = frame.get("ts", 0)
                blob_url = frame.get("blob_url")
                
                frame_info = f"- {app_name}"
                if window_title and window_title != "N/A":
                    frame_info += f" - {window_title}"
                if ts:
                    frame_date = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                    frame_info += f" ({frame_date})"
                if blob_url:
                    frame_info += f" [Image: {blob_url}]"
                
                context_parts.append(frame_info)
        
        if not context_parts:
            # Fallback to recent items if no semantic matches
            recent_episodes = list(episodes_collection.find({}).sort("start_ts", -1).limit(3))
            recent_frames = list(frames_collection.find({}).sort("ts", -1).limit(3))
            
            if recent_episodes or recent_frames:
                context_parts.append("Recent Activity (fallback - no semantic matches found):")
                for episode in recent_episodes:
                    app_name = episode.get("app_name", "Unknown")
                    frame_count = episode.get("frame_count", 0)
                    context_parts.append(f"- {app_name}: {frame_count} screenshots")
        
        result = "\n".join(context_parts) if context_parts else "No activity data available."
        print(f"[CONTEXT] Retrieved context with {len(reranked_episodes)} episodes and {len(top_frames)} frames")
        return result
    
    except Exception as e:
        print(f"[CONTEXT] Error retrieving context: {e}")
        import traceback
        traceback.print_exc()
        # Fallback to simple recent items
        try:
            episodes_collection = get_episodes_collection()
            frames_collection = get_frames_collection()
            if episodes_collection and frames_collection:
                recent_episodes = list(episodes_collection.find({}).sort("start_ts", -1).limit(3))
                recent_frames = list(frames_collection.find({}).sort("ts", -1).limit(3))
                return f"Error retrieving context: {str(e)}. Recent items: {len(recent_episodes)} episodes, {len(recent_frames)} frames."
        except:
            pass
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
            
            The context below has been retrieved using semantic search (embeddings) and reranking to find
            the most relevant episodes and frames based on the user's query.
            
            Current Context (semantically matched from MongoDB):
            {context}
            
            Data Structure:
            - Frames: Screenshots taken every minute, with image embeddings for visual search
            - Episodes: Groups of frames by app_name (new episode when app changes), with text embeddings and summaries
            - Episodes include summaries with app name, duration, frame count, and window titles
            
            Use this context to answer questions about the user's activity. Be helpful, concise, and specific.
            If the context includes image URLs, you can reference them when relevant."""
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
