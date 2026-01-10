"""
Test script for Voyage AI embedding generation
Tests the connection and embedding generation functions
"""

import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path
from voyage import embed_text, embed_image, generate_episode_summary

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


async def test_text_embedding():
    """Test text embedding generation"""
    print("\n" + "="*60)
    print("Testing Text Embedding")
    print("="*60)
    
    if not VOYAGE_API_KEY:
        print("❌ VOYAGE_API_KEY not set in environment")
        return False
    
    try:
        test_text = "This is a test of Voyage AI text embedding generation"
        print(f"Test text: {test_text}")
        
        embedding = await embed_text(test_text)
        
        print(f"✅ Text embedding generated successfully")
        print(f"   Dimensions: {len(embedding)}")
        print(f"   First 5 values: {embedding[:5]}")
        return True
    except Exception as e:
        print(f"❌ Text embedding failed: {e}")
        return False


async def test_image_embedding():
    """Test image embedding generation"""
    print("\n" + "="*60)
    print("Testing Image Embedding")
    print("="*60)
    
    if not VOYAGE_API_KEY:
        print("❌ VOYAGE_API_KEY not set in environment")
        return False
    
    # Use a publicly accessible test image
    test_image_url = "https://picsum.photos/200/300"
    print(f"Test image URL: {test_image_url}")
    
    try:
        embedding = await embed_image(test_image_url)
        
        print(f"✅ Image embedding generated successfully")
        print(f"   Dimensions: {len(embedding)}")
        print(f"   First 5 values: {embedding[:5]}")
        return True
    except Exception as e:
        print(f"❌ Image embedding failed: {e}")
        print(f"   Note: This might fail if the test image URL is not accessible")
        return False


async def test_episode_summary():
    """Test episode summary generation"""
    print("\n" + "="*60)
    print("Testing Episode Summary Generation")
    print("="*60)
    
    try:
        summary = await generate_episode_summary(
            app_name="Google Chrome",
            frame_count=15,
            start_ts=1704067200000,  # 2024-01-01 00:00:00
            end_ts=1704070800000,    # 2024-01-01 01:00:00
            window_titles=[
                "GitHub - Pull Requests",
                "Stack Overflow - Python",
                "GitHub - Issues"
            ]
        )
        
        print(f"✅ Episode summary generated successfully")
        print(f"   Summary: {summary}")
        return True
    except Exception as e:
        print(f"❌ Episode summary generation failed: {e}")
        return False


async def test_full_workflow():
    """Test the full workflow: summary -> text embedding"""
    print("\n" + "="*60)
    print("Testing Full Workflow (Summary + Text Embedding)")
    print("="*60)
    
    if not VOYAGE_API_KEY:
        print("❌ VOYAGE_API_KEY not set in environment")
        return False
    
    try:
        # Generate summary
        summary = await generate_episode_summary(
            app_name="VS Code",
            frame_count=20,
            start_ts=1704067200000,
            end_ts=1704074400000,
            window_titles=["main.py - VS Code", "README.md - VS Code"]
        )
        
        print(f"Generated summary: {summary}")
        
        # Generate embedding from summary
        embedding = await embed_text(summary)
        
        print(f"✅ Full workflow completed successfully")
        print(f"   Summary length: {len(summary)} characters")
        print(f"   Embedding dimensions: {len(embedding)}")
        return True
    except Exception as e:
        print(f"❌ Full workflow failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("Voyage AI Embedding System Tests")
    print("="*60)
    
    if not VOYAGE_API_KEY:
        print("\n❌ VOYAGE_API_KEY environment variable is not set!")
        print("   Please set it in your .env file")
        return
    
    results = []
    
    # Test text embedding
    results.append(await test_text_embedding())
    
    # Test image embedding (may fail if test URL is not accessible)
    results.append(await test_image_embedding())
    
    # Test episode summary
    results.append(await test_episode_summary())
    
    # Test full workflow
    results.append(await test_full_workflow())
    
    # Summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    
    if passed == total:
        print("✅ All tests passed!")
    else:
        print("⚠️  Some tests failed (this may be expected for image embedding if test URL is not accessible)")


if __name__ == "__main__":
    asyncio.run(main())

