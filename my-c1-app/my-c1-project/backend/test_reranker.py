"""
Test script for Voyage AI reranker functionality
"""

import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path
from voyage import rerank

# Load environment variables
env_paths = [
    Path(__file__).parent / '.env',
    Path(__file__).parent.parent / '.env',
    Path(__file__).parent.parent.parent / '.env',
]

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[TEST] Loaded .env from: {env_path}")
        break
else:
    print("[TEST] Warning: No .env file found")

VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY")


async def test_reranker():
    """Test reranker functionality"""
    print("\n" + "="*60)
    print("Testing Voyage AI Reranker")
    print("="*60)
    
    if not VOYAGE_API_KEY:
        print("❌ VOYAGE_API_KEY not set in environment")
        return False
    
    try:
        query = "working on Python code in VS Code"
        
        documents = [
            "Activity in Google Chrome for 30.0 minutes. Captured 10 screenshots. Window titles: GitHub - Pull Requests, Stack Overflow",
            "Activity in VS Code for 45.0 minutes. Captured 15 screenshots. Window titles: main.py - VS Code, README.md - VS Code",
            "Activity in Terminal for 5.0 minutes. Captured 2 screenshots. Window titles: bash",
            "Activity in Slack for 20.0 minutes. Captured 8 screenshots. Window titles: Team Chat",
            "Activity in VS Code for 60.0 minutes. Captured 20 screenshots. Window titles: app.py - VS Code, test.py - VS Code"
        ]
        
        print(f"Query: {query}")
        print(f"Documents to rerank: {len(documents)}")
        print("\nOriginal order:")
        for i, doc in enumerate(documents, 1):
            print(f"  {i}. {doc[:80]}...")
        
        results = await rerank(query, documents, top_k=3)
        
        print(f"\n✅ Reranking successful")
        print(f"\nReranked results (top 3):")
        for i, result in enumerate(results, 1):
            idx = result["index"]
            score = result["relevance_score"]
            doc = result["document"]
            print(f"  {i}. [Score: {score:.4f}] {doc[:80]}...")
            print(f"     (Original index: {idx})")
        
        # Verify results are sorted by score
        scores = [r["relevance_score"] for r in results]
        is_sorted = all(scores[i] >= scores[i+1] for i in range(len(scores)-1))
        
        if is_sorted:
            print("\n✅ Results are correctly sorted by relevance score")
        else:
            print("\n⚠️  Results may not be sorted correctly")
        
        return True
    except Exception as e:
        print(f"❌ Reranker test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run reranker tests"""
    print("\n" + "="*60)
    print("Voyage AI Reranker Test")
    print("="*60)
    
    if not VOYAGE_API_KEY:
        print("\n❌ VOYAGE_API_KEY environment variable is not set!")
        print("   Please set it in your .env file")
        return
    
    success = await test_reranker()
    
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    if success:
        print("✅ Reranker test passed!")
    else:
        print("❌ Reranker test failed")


if __name__ == "__main__":
    asyncio.run(main())

