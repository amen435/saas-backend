function toNumericEmbedding(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Embedding must be a non-empty array.');
  }

  const normalized = values.map((value) => Number(value));
  if (normalized.some((value) => !Number.isFinite(value))) {
    throw new Error('Embedding contains invalid numeric values.');
  }

  return normalized;
}

function computeCosineSimilarity(embeddingA, embeddingB) {
  const a = toNumericEmbedding(embeddingA);
  const b = toNumericEmbedding(embeddingB);

  if (a.length !== b.length) {
    throw new Error('Embeddings must be the same length.');
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function findBestEmbeddingMatch(targetEmbedding, candidates, threshold) {
  const normalizedTarget = toNumericEmbedding(targetEmbedding);
  const similarityThreshold = Number(threshold);
  let bestMatch = null;

  for (const candidate of candidates || []) {
    if (!candidate?.embedding || !Array.isArray(candidate.embedding) || candidate.embedding.length !== normalizedTarget.length) {
      continue;
    }

    const score = computeCosineSimilarity(normalizedTarget, candidate.embedding);
    if (!bestMatch || score > bestMatch.similarityScore) {
      bestMatch = {
        ...candidate,
        similarityScore: Number(score.toFixed(4)),
      };
    }
  }

  if (!bestMatch || bestMatch.similarityScore < similarityThreshold) {
    return null;
  }

  return bestMatch;
}

module.exports = {
  computeCosineSimilarity,
  findBestEmbeddingMatch,
};
