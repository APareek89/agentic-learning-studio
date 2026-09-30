/** Reduce provider failures to fixed metadata; never retain their raw message. */
export function safeProviderError(status: number, body: unknown): { errorType: string; errorCategory: string } {
  const error = body && typeof body === "object" && "error" in body ? body.error : undefined;
  const rawType = error && typeof error === "object" && "type" in error ? error.type : undefined;
  const rawMessage = error && typeof error === "object" && "message" in error ? error.message : undefined;
  const rawCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const knownTypes = ["invalid_request_error", "authentication_error", "permission_error", "not_found_error", "request_too_large", "rate_limit_error", "api_error", "overloaded_error"];
  const errorType = typeof rawType === "string" && knownTypes.includes(rawType) ? rawType : "unknown_error";
  const message = typeof rawMessage === "string" ? rawMessage.toLowerCase() : "";
  let errorCategory = "other";
  if (status === 401 || status === 403 || errorType === "authentication_error" || errorType === "permission_error") errorCategory = "authentication";
  else if (rawCode === "insufficient_quota" || rawCode === "billing_hard_limit_reached") errorCategory = "insufficient_credits";
  else if (status === 429 || errorType === "rate_limit_error") errorCategory = "rate_limit";
  else if (/credit balance|insufficient.{0,30}credits?|credits?.{0,30}(?:insufficient|exhausted)/.test(message)) errorCategory = "insufficient_credits";
  else if (/\btop_k\b/.test(message)) errorCategory = "top_k_validation";
  else if (/\btop_p\b/.test(message)) errorCategory = "top_p_validation";
  else if (/\btemperature\b/.test(message)) errorCategory = "temperature_validation";
  return { errorType, errorCategory };
}
