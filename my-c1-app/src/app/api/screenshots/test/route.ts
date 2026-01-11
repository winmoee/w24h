import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

/**
 * GET /api/screenshots/test
 * Test endpoint to verify Vercel Blob connection and list screenshots
 */
export async function GET() {
  try {
    // Verify BLOB_READ_WRITE_TOKEN is configured
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'BLOB_READ_WRITE_TOKEN is not set in environment variables',
          hint: 'Add BLOB_READ_WRITE_TOKEN to your .env.local file',
        },
        { status: 500 },
      );
    }

    console.log('[TEST] Testing Vercel Blob connection...');

    // Try to list screenshots
    const { blobs, hasMore } = await list({
      prefix: 'screenshots/',
      limit: 10,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    console.log(`[TEST] Successfully connected! Found ${blobs.length} screenshot(s)`);

    return NextResponse.json({
      success: true,
      message: 'Vercel Blob connection successful!',
      tokenConfigured: true,
      screenshotCount: blobs.length,
      hasMore,
      samples: blobs.slice(0, 5).map((blob) => ({
        pathname: blob.pathname,
        url: blob.url,
        size: blob.size,
        uploadedAt: blob.uploadedAt,
      })),
    });
  } catch (error) {
    console.error('[TEST] Error testing Vercel Blob connection:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to connect to Vercel Blob',
        message: error instanceof Error ? error.message : 'Unknown error',
        tokenConfigured: !!process.env.BLOB_READ_WRITE_TOKEN,
      },
      { status: 500 },
    );
  }
}

