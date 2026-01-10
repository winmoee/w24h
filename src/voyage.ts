/**
 * Voyage AI embedding client
 * Handles text and image embeddings via Voyage API
 */

const VOYAGE_API_BASE = 'https://api.voyageai.com/v1';
const DEFAULT_TEXT_MODEL = 'voyage-2';
const DEFAULT_IMAGE_MODEL = 'voyage-large-2';

interface VoyageTextResponse {
  data: Array<{
    embedding: number[];
  }>;
}

interface VoyageImageResponse {
  data: Array<{
    embedding: number[];
  }>;
}

/**
 * Embeds a text string using Voyage AI
 * @param input - Text to embed
 * @returns Promise resolving to embedding vector
 */
export async function embedText(input: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY environment variable is not set');
  }

  const model = process.env.VOYAGE_TEXT_MODEL || DEFAULT_TEXT_MODEL;

  try {
    const response = await fetch(`${VOYAGE_API_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: [input],
        model: model,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voyage API error: ${response.status} ${errorText}`);
    }

    const data: VoyageTextResponse = await response.json();
    
    if (!data.data || data.data.length === 0 || !data.data[0].embedding) {
      throw new Error('Invalid response from Voyage API');
    }

    return data.data[0].embedding;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to embed text: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Embeds an image from URL using Voyage AI
 * @param url - Image URL to embed
 * @returns Promise resolving to embedding vector
 * @throws Error indicating not implemented yet for MVP Step 1
 */
export async function embedImageFromUrl(url: string): Promise<number[]> {
  // Stub for MVP Step 1 - not implemented yet
  throw new Error('Image embedding not implemented yet (MVP Step 1)');
  
  // Future implementation:
  // const apiKey = process.env.VOYAGE_API_KEY;
  // if (!apiKey) {
  //   throw new Error('VOYAGE_API_KEY environment variable is not set');
  // }
  // const model = process.env.VOYAGE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  // ... implementation
}

