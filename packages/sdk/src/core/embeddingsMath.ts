/**
 * @file embeddingsMath.ts
 * @description Pure mathematical functions for vector embeddings and cosine similarity.
 */

export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Number((dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
}

/**
 * Validates a native embedding result and returns its vector. Throws when the vector is
 * missing, empty, contains a non-finite value, or its length differs from the reported dimension,
 * so an empty or inconsistent vector is never presented as a real embedding.
 */
export function assertRealEmbedding(result: { embedding?: unknown; dimension?: unknown } | null | undefined): number[] {
  const vec = result?.embedding;
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Embedding model returned no vector');
  }
  for (let i = 0; i < vec.length; i++) {
    if (typeof vec[i] !== 'number' || !Number.isFinite(vec[i])) {
      throw new Error(`Embedding contains a non-finite value at index ${i}`);
    }
  }
  if (result?.dimension !== vec.length) {
    throw new Error(`Embedding length ${vec.length} does not match reported dimension ${String(result?.dimension)}`);
  }
  return vec as number[];
}
