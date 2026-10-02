/** Errors safe to persist and return from detached authoring jobs. */
export class DocumentOnlySourceError extends Error {
  constructor(message: 'unavailable' | 'empty') {
    super(message === 'unavailable'
      ? 'Your uploaded documents are unavailable. Re-upload them before continuing a document-only lesson.'
      : 'No content could be retrieved from your uploaded documents. Retry the upload before continuing.');
    this.name = 'DocumentOnlySourceError';
  }
}
export function safeGenerationError(error: unknown): string {
  if (error instanceof DocumentOnlySourceError) return error.message;
  return 'The generation step could not finish. Saved work is preserved. Try again when ready; earlier provider work may have been charged.';
}
export function generationErrorCategory(error: unknown): string {
  if (error instanceof DocumentOnlySourceError) return 'source_unavailable';
  const status = Number((error as {status?:unknown})?.status);
  if (status === 401 || status === 403) return 'provider_authentication';
  if (status === 429) return 'provider_rate_limit';
  if (status >= 400 && status < 500) return 'provider_rejected';
  if (status >= 500 && status < 600) return 'provider_unavailable';
  return 'generation_failed';
}
