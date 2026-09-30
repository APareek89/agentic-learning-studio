/** Limit both batch size and concurrent inference on the single local model. */
export const EMBEDDING_BATCH_SIZE = 4;

export function createBatchedEmbedder(
  infer: (texts: string[]) => Promise<number[][]>,
): (texts: string[]) => Promise<number[][]> {
  let inferenceTail: Promise<void> = Promise.resolve();

  return async (texts) => {
    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(offset, offset + EMBEDDING_BATCH_SIZE);
      // Each caller queues one batch at a time. A query can run between upload
      // batches, and concurrent uploads never multiply active model inference.
      const pending = inferenceTail.then(() => infer(batch));
      // A failed request must not poison the queue for later requests.
      inferenceTail = pending.then(() => undefined, () => undefined);
      const output = await pending;
      if (output.length !== batch.length) throw new Error("Embedding model returned an unexpected vector count");
      vectors.push(...output);
    }
    return vectors;
  };
}
