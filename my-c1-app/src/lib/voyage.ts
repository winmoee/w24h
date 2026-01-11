/**
 * Voyage AI Embedding Client
 * Provides functions for generating text and image embeddings using Voyage AI
 */

import { VoyageAIClient } from 'voyageai';

// Initialize Voyage AI client
const getVoyageClient = (): VoyageAIClient => {
  const apiKey = process.env.VOYAGE_API_KEY;
  
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY environment variable is not set');
  }
  
  return new VoyageAIClient({ apiKey });
};

/**
 * Generate text embedding using Voyage AI
 * @param text - Text to embed
 * @param model - Model to use (default: 'voyage-2')
 * @returns Promise resolving to embedding vector
 */
export async function embedText(
  text: string,
  model: string = process.env.VOYAGE_TEXT_MODEL || 'voyage-2'
): Promise<number[]> {
  try {
    const client = getVoyageClient();
    
    const response = await client.embed({
      input: [text],
      model: model as any,
    });
    
    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding data returned from Voyage AI');
    }
    
    const embedding = response.data[0].embedding;
    if (!embedding) {
      throw new Error('Embedding data is missing from response');
    }
    
    return embedding;
  } catch (error) {
    console.error('Error generating text embedding:', error);
    throw error;
  }
}

/**
 * Generate image embedding using Voyage AI multimodal endpoint
 * @param imageUrl - URL of the image to embed
 * @param model - Model to use (default: 'voyage-multimodal-3')
 * @returns Promise resolving to embedding vector
 */
export async function embedImage(
  imageUrl: string,
  model: string = process.env.VOYAGE_IMAGE_MODEL || 'voyage-multimodal-3'
): Promise<number[]> {
  try {
    const client = getVoyageClient();
    
    const response = await client.multimodalEmbed({
      inputs: [
        {
          content: [
            {
              type: 'image_url',
              image_url: imageUrl,
            },
          ],
        },
      ],
      model: model as any,
    });
    
    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding data returned from Voyage AI');
    }
    
    const embedding = response.data[0].embedding;
    if (!embedding) {
      throw new Error('Embedding data is missing from response');
    }
    
    return embedding;
  } catch (error) {
    console.error('Error generating image embedding:', error);
    throw error;
  }
}

/**
 * Test Voyage API connection and API key
 * @returns Promise resolving to test result
 */
export async function testVoyageConnection(): Promise<{
  success: boolean;
  message: string;
  model?: string;
  embeddingDimensions?: number;
  error?: string;
}> {
  try {
    const testText = 'Test connection to Voyage AI';
    const embedding = await embedText(testText);
    
    return {
      success: true,
      message: 'Voyage AI connection successful',
      model: process.env.VOYAGE_TEXT_MODEL || 'voyage-2',
      embeddingDimensions: embedding.length,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Voyage AI connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

