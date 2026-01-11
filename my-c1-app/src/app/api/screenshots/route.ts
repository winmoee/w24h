import { list, head } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/screenshots
 * List all screenshots stored in Vercel Blob
 * 
 * Query parameters:
 * - prefix: Filter by pathname prefix (default: 'screenshots/')
 * - limit: Maximum number of results (default: 100)
 * - cursor: Pagination cursor for next page
 */
export async function GET(req: NextRequest) {
  try {
    // Verify BLOB_READ_WRITE_TOKEN is configured
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('[SERVER] BLOB_READ_WRITE_TOKEN is not set in environment variables');
      return NextResponse.json(
        { error: 'Server configuration error: BLOB_READ_WRITE_TOKEN not configured' },
        { status: 500 },
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const prefix = searchParams.get('prefix') || 'screenshots/';
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const cursor = searchParams.get('cursor') || undefined;

    console.log('[SERVER] Listing screenshots from Vercel Blob:', {
      prefix,
      limit,
      hasCursor: !!cursor,
    });

    // List blobs with the specified prefix
    const { blobs, cursor: nextCursor, hasMore } = await list({
      prefix,
      limit,
      cursor,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    console.log(`[SERVER] Found ${blobs.length} screenshot(s)`);

    return NextResponse.json({
      screenshots: blobs.map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        size: blob.size,
        uploadedAt: blob.uploadedAt,
        contentType: blob.contentType,
      })),
      pagination: {
        cursor: nextCursor,
        hasMore,
        count: blobs.length,
      },
    });
  } catch (error) {
    console.error('[SERVER] Error listing screenshots:', error);
    return NextResponse.json(
      {
        error: 'Failed to list screenshots',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/screenshots/[pathname]
 * Get metadata for a specific screenshot by pathname
 */
export async function HEAD(req: NextRequest) {
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
    return NextResponse.json(
      {
        error: 'Failed to get screenshot metadata',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

