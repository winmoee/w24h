import { head } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/screenshots/metadata?pathname=<pathname>
 * Get metadata for a specific screenshot by pathname
 * 
 * Query parameter:
 * - pathname: The full pathname of the screenshot (e.g., "screenshots/screenshot_2024-01-01_12-00-00.png")
 */
export async function GET(req: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Server configuration error: BLOB_READ_WRITE_TOKEN not configured' },
        { status: 500 },
      );
    }

    const pathname = req.nextUrl.searchParams.get('pathname');
    if (!pathname) {
      return NextResponse.json(
        { error: 'pathname query parameter is required' },
        { status: 400 },
      );
    }

    console.log('[SERVER] Getting screenshot metadata:', pathname);

    const blob = await head(pathname, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      contentType: blob.contentType,
    });
  } catch (error) {
    console.error('[SERVER] Error getting screenshot metadata:', error);
    
    // Check if it's a 404 error
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('404'))) {
      return NextResponse.json(
        { error: 'Screenshot not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to get screenshot metadata',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

