"""
Voyage AI Embedding Client for Python
Provides functions for generating text and image embeddings using Voyage AI
"""

import os
import httpx
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY")
VOYAGE_TEXT_MODEL = os.getenv("VOYAGE_TEXT_MODEL", "voyage-2")
VOYAGE_IMAGE_MODEL = os.getenv("VOYAGE_IMAGE_MODEL", "voyage-multimodal-3")
VOYAGE_RERANK_MODEL = os.getenv("VOYAGE_RERANK_MODEL", "rerank-2")

VOYAGE_API_BASE = "https://api.voyageai.com/v1"


async def embed_text(text: str, model: Optional[str] = None) -> list[float]:
    """
    Generate text embedding using Voyage AI
    
    Args:
        text: Text to embed
        model: Model to use (default: VOYAGE_TEXT_MODEL or 'voyage-2')
    
    Returns:
        List of floats representing the embedding vector
    
    Raises:
        ValueError: If VOYAGE_API_KEY is not set
        Exception: If API call fails
    """
    if not VOYAGE_API_KEY:
        raise ValueError("VOYAGE_API_KEY environment variable is not set")
    
    model = model or VOYAGE_TEXT_MODEL
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{VOYAGE_API_BASE}/embeddings",
            headers={
                "Authorization": f"Bearer {VOYAGE_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "input": [text],
                "model": model,
            },
        )
        
        response.raise_for_status()
        data = response.json()
        
        if not data.get("data") or len(data["data"]) == 0:
            raise Exception("No embedding data returned from Voyage AI")
        
        embedding = data["data"][0].get("embedding")
        if not embedding:
            raise Exception("Embedding data is missing from response")
        
        return embedding


async def embed_image(image_url: str, model: Optional[str] = None) -> list[float]:
    """
    Generate image embedding using Voyage AI multimodal endpoint
    
    Args:
        image_url: URL of the image to embed
        model: Model to use (default: VOYAGE_IMAGE_MODEL or 'voyage-multimodal-3')
    
    Returns:
        List of floats representing the embedding vector
    
    Raises:
        ValueError: If VOYAGE_API_KEY is not set
        Exception: If API call fails
    """
    if not VOYAGE_API_KEY:
        raise ValueError("VOYAGE_API_KEY environment variable is not set")
    
    model = model or VOYAGE_IMAGE_MODEL
    
    # Voyage AI multimodal API - try different formats
    # Format 1: Try with inputs array (multimodal endpoint style)
    async with httpx.AsyncClient(timeout=60.0) as client:
        # First try the multimodal format with inputs
        try:
            response = await client.post(
                f"{VOYAGE_API_BASE}/embeddings",
                headers={
                    "Authorization": f"Bearer {VOYAGE_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "inputs": [
                        {
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": image_url,
                                }
                            ]
                        }
                    ],
                    "model": model,
                },
            )
            response.raise_for_status()
        except httpx.HTTPStatusError:
            # If that fails, try with input array (text-style but with image URL)
            response = await client.post(
                f"{VOYAGE_API_BASE}/embeddings",
                headers={
                    "Authorization": f"Bearer {VOYAGE_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "input": [image_url],  # Simple format - just the URL
                    "model": model,
                },
            )
            response.raise_for_status()
        
        response.raise_for_status()
        data = response.json()
        
        if not data.get("data") or len(data["data"]) == 0:
            raise Exception("No embedding data returned from Voyage AI")
        
        embedding = data["data"][0].get("embedding")
        if not embedding:
            raise Exception("Embedding data is missing from response")
        
        return embedding


async def generate_episode_summary(
    app_name: str,
    frame_count: int,
    start_ts: int,
    end_ts: Optional[int],
    window_titles: list[str],
) -> str:
    """
    Generate a simple text summary for an episode
    
    Args:
        app_name: Name of the application
        frame_count: Number of frames in the episode
        start_ts: Start timestamp in milliseconds
        end_ts: End timestamp in milliseconds (optional)
        window_titles: List of window titles seen during the episode
    
    Returns:
        A text summary string
    """
    from datetime import datetime
    
    # Calculate duration
    if end_ts and start_ts:
        duration_minutes = (end_ts - start_ts) / (1000 * 60)
        duration_str = f"{duration_minutes:.1f} minutes"
    else:
        duration_str = "ongoing"
    
    # Get unique window titles (limit to first 5)
    unique_titles = list(set(window_titles))[:5]
    titles_str = ", ".join(unique_titles) if unique_titles else "N/A"
    
    summary = (
        f"Activity in {app_name} for {duration_str}. "
        f"Captured {frame_count} screenshots. "
        f"Window titles: {titles_str}"
    )
    
    return summary


async def rerank(query: str, documents: list[str], model: Optional[str] = None, top_k: Optional[int] = None) -> list[dict]:
    """
    Rerank documents based on query relevance using Voyage AI reranker
    
    Args:
        query: The search query
        documents: List of document strings to rerank
        model: Model to use (default: VOYAGE_RERANK_MODEL or 'rerank-2')
        top_k: Number of top results to return (optional, returns all if None)
    
    Returns:
        List of dictionaries with 'index', 'document', and 'relevance_score' keys,
        sorted by relevance (highest first)
    
    Raises:
        ValueError: If VOYAGE_API_KEY is not set
        Exception: If API call fails
    """
    if not VOYAGE_API_KEY:
        raise ValueError("VOYAGE_API_KEY environment variable is not set")
    
    if not documents:
        return []
    
    model = model or VOYAGE_RERANK_MODEL
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{VOYAGE_API_BASE}/rerank",
            headers={
                "Authorization": f"Bearer {VOYAGE_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "query": query,
                "documents": documents,
                "model": model,
                "top_k": top_k if top_k is not None else len(documents),
            },
        )
        
        response.raise_for_status()
        data = response.json()
        
        if not data.get("results"):
            return []
        
        # Format results: each result has 'index', 'document', 'relevance_score'
        results = []
        for result in data["results"]:
            results.append({
                "index": result.get("index"),
                "document": result.get("document", ""),
                "relevance_score": result.get("relevance_score", 0.0)
            })
        
        # Sort by relevance score (descending)
        results.sort(key=lambda x: x["relevance_score"], reverse=True)
        
        return results

