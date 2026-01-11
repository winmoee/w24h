import { NextResponse } from 'next/server';
import { testVoyageConnection } from '../../../../lib/voyage';

/**
 * GET /api/voyage/test
 * Test endpoint to verify Voyage AI API key and connection
 */
export async function GET() {
  try {
    // Check if API key is configured
    if (!process.env.VOYAGE_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'VOYAGE_API_KEY is not set in environment variables',
          hint: 'Add VOYAGE_API_KEY to your .env.local file',
        },
        { status: 500 },
      );
    }

    console.log('[TEST] Testing Voyage AI connection...');

    // Test the connection
    const result = await testVoyageConnection();

    if (result.success) {
      console.log('[TEST] Voyage AI connection successful!', {
        model: result.model,
        dimensions: result.embeddingDimensions,
      });
    } else {
      console.error('[TEST] Voyage AI connection failed:', result.error);
    }

    return NextResponse.json({
      ...result,
      apiKeyConfigured: !!process.env.VOYAGE_API_KEY,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[TEST] Error testing Voyage AI connection:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test Voyage AI connection',
        message: error instanceof Error ? error.message : 'Unknown error',
        apiKeyConfigured: !!process.env.VOYAGE_API_KEY,
      },
      { status: 500 },
    );
  }
}

