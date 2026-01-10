import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;

  // Verify BLOB_READ_WRITE_TOKEN is configured
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[SERVER] BLOB_READ_WRITE_TOKEN is not set in environment variables');
    return NextResponse.json(
      { error: 'Server configuration error: BLOB_READ_WRITE_TOKEN not configured' },
      { status: 500 },
    );
  }

  // Optional: authenticate the caller (recommended)
  // e.g., verify a JWT / session cookie / API key specific to your Electron app
  // For now, we'll allow all requests, but you should add authentication

  try {
    console.log('[SERVER] Processing screenshot upload request...');
    const jsonResponse = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        // Enforce your rules here:
        // - restrict pathname prefixes (e.g., "screenshots/<userId>/...")
        // - allow only images
        // - size limits, etc.

        // Only allow uploads under "screenshots/"
        if (!pathname.startsWith('screenshots/')) {
          throw new Error('Invalid upload path. Must start with "screenshots/"');
        }

        // Optional: Parse clientPayload if you send user info
        // const payload = clientPayload ? JSON.parse(clientPayload) : null;

        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
          // You can also set `addRandomSuffix` or cache-control server-side if desired
          addRandomSuffix: true, // Add random suffix to prevent collisions
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Runs when Vercel confirms upload completion
        // Store blob.url in your DB, link to user, etc.
        // blob includes url, pathname, contentType, etc.
        console.log('[SERVER] Screenshot uploaded successfully:', {
          url: blob.url,
          pathname: blob.pathname,
          contentType: blob.contentType,
        });

        // TODO: Store blob.url in your database, link to user, etc.
        // Example:
        // await db.screenshots.create({
        //   url: blob.url,
        //   pathname: blob.pathname,
        //   userId: tokenPayload?.userId,
        //   uploadedAt: new Date(),
        // });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('[SERVER] Upload error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

