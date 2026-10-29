/**
 * @file embeddings.test.ts
 * @description Unit tests for vector cosine similarity mathematics and edge cases.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeCosineSimilarity, assertRealEmbedding } from '../packages/sdk/src/core/embeddingsMath.ts';

describe('useEmbeddings: Cosine Similarity Mathematics', () => {
  test('Identical vectors produce a cosine similarity of exactly 1.0', () => {
    const vecA = [0.5, 0.5, 0.5, 0.5];
    const vecB = [0.5, 0.5, 0.5, 0.5];
    const score = computeCosineSimilarity(vecA, vecB);
    assert.equal(score, 1.0);
  });

  test('Orthogonal vectors produce a cosine similarity of 0.0', () => {
    const vecA = [1.0, 0.0, 0.0];
    const vecB = [0.0, 1.0, 0.0];
    const score = computeCosineSimilarity(vecA, vecB);
    assert.equal(score, 0.0);
  });

  test('Opposite vectors produce a cosine similarity of -1.0', () => {
    const vecA = [1.0, 0.0];
    const vecB = [-1.0, 0.0];
    const score = computeCosineSimilarity(vecA, vecB);
    assert.equal(score, -1.0);
  });

  test('Mismatched vector lengths or empty vectors return 0', () => {
    assert.equal(computeCosineSimilarity([], []), 0);
    assert.equal(computeCosineSimilarity([1, 2], [1, 2, 3]), 0);
  });
});

describe('useEmbeddings: assertRealEmbedding', () => {
  test('returns the vector when length matches the reported dimension', () => {
    assert.deepEqual(assertRealEmbedding({ embedding: [0.1, 0.2, 0.3], dimension: 3 }), [0.1, 0.2, 0.3]);
  });

  test('rejects empty, missing and non-array vectors', () => {
    assert.throws(() => assertRealEmbedding({ embedding: [], dimension: 0 }), /no vector/);
    assert.throws(() => assertRealEmbedding({ dimension: 512 }), /no vector/);
    assert.throws(() => assertRealEmbedding(undefined), /no vector/);
    assert.throws(() => assertRealEmbedding({ embedding: 'x', dimension: 1 }), /no vector/);
  });

  test('rejects dimension mismatch', () => {
    assert.throws(() => assertRealEmbedding({ embedding: [1, 2], dimension: 512 }), /does not match/);
  });

  test('rejects NaN and Infinity', () => {
    assert.throws(() => assertRealEmbedding({ embedding: [1, NaN], dimension: 2 }), /non-finite/);
    assert.throws(() => assertRealEmbedding({ embedding: [Infinity], dimension: 1 }), /non-finite/);
  });
});
