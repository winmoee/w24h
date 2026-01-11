# Project Description

## Problem Statement

Modern knowledge work is scattered across apps, tabs, terminals, and fleeting moments. When someone stops working—end of day, context switch, or team handoff—the next person wastes time reconstructing what happened: what the goal was, where things broke, which screen mattered, and what was supposed to happen next. Today this relies on memory, messy notes, or chat threads. Visual context is especially lost, and keyword search is too brittle to recover real intent.

## Solution

Our project builds a multimodal work memory that captures screenshots and activity signals during the day, structures them into meaningful "episodes," and makes them retrievable through an AI agent.

### Technical Implementation

**Data Collection:**
- Desktop Electron app automatically captures screenshots every minute
- Screenshots are uploaded to Vercel Blob storage and linked to work episodes
- Episodes are automatically created when application focus changes (grouped by `app_name`)

**Embedding & Storage:**
- **Text Embeddings**: Episodes are summarized and embedded using Voyage AI `voyage-2` model (1024-dimensional vectors)
- **Image Embeddings**: Screenshots are embedded using Voyage AI `voyage-multimodal-3` model (1536-dimensional vectors)
- All embeddings are stored in MongoDB Atlas alongside source data (co-located storage strategy)
- Embeddings are generated automatically: frames on upload, episodes on closure

**Semantic Search & Retrieval:**
- At query time, user questions are embedded using the same `voyage-2` model
- **Initial Retrieval**: Cosine similarity search across top 50 most recent episodes and top 30 most recent frames
- **Reranking**: Voyage AI `rerank-2` model processes top 20 candidates to improve relevance
- **Context Assembly**: Relevant episodes (with summaries, timestamps, app names) and screenshots (with URLs) are formatted for the LLM

**AI Agent:**
- Uses Claude Sonnet 4 via Thesys C1 API
- Receives semantically-matched context with episode summaries and screenshot URLs
- Displays relevant screenshots inline using markdown image syntax
- Provides natural language answers grounded in the retrieved visual and textual context

### Technical Specifications

- **Embedding Models**: Voyage AI `voyage-2` (text, 1024-dim), `voyage-multimodal-3` (images, 1536-dim)
- **Reranker**: Voyage AI `rerank-2` (top-20 candidate reranking)
- **Similarity Metric**: Cosine similarity (in-memory calculation)
- **Database**: MongoDB Atlas with co-located embeddings (~4KB per episode, ~6KB per frame)
- **Storage**: Vercel Blob for images, MongoDB for metadata and embeddings
- **Query Performance**: ~500-1000ms end-to-end (embedding generation + similarity search + reranking)

## Outcome

This turns messy human work into structured, multimodal memory. Instead of guessing what happened, users get grounded, evidence-backed answers with relevant screenshots in seconds. We make human work searchable, visual, and transferable—so context doesn't disappear when people log off.

