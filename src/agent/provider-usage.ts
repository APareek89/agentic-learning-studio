import { currentUserId } from '../lib/db';
import { generationErrorCategory } from './generation-errors';
const token = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
/** One safe record for each model invocation, before structured-output parsing.
 * Unknown usage stays unknown. Logs are operational receipts, not an invoice or
 * an atomic shared-spend ledger. No prompts, outputs, URLs, or keys are emitted. */
export function usageAuditCallbacks(provider: 'openai'|'anthropic', model: string) {
 return [{
  name: 'generation-usage-audit',
  handleLLMEnd(output: any, runId: string) {
   const message = output.generations?.[0]?.[0]?.message;
   const usage = message?.usage_metadata;
   const legacy = output.llmOutput?.tokenUsage;
   const input = token(usage?.input_tokens ?? legacy?.promptTokens);
   const out = token(usage?.output_tokens ?? legacy?.completionTokens);
   console.info('[generation-usage]', JSON.stringify({runId, ownerId:currentUserId() || null,provider,model,status:input===null||out===null?'usage_unknown':'complete',input_tokens:input,output_tokens:out,cached_input_tokens:token(usage?.input_token_details?.cache_read),reasoning_tokens:token(usage?.output_token_details?.reasoning)}));
  },
  handleLLMError(error: unknown,runId:string) {
   console.info('[generation-usage]',JSON.stringify({runId,ownerId:currentUserId() || null,provider,model,status:'failed_usage_unknown',category:generationErrorCategory(error),input_tokens:null,output_tokens:null}));
  }
 }];
}
