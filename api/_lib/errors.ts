export function errorResponse(
  code: string,
  message: string,
  retryable = false
) {
  return {
    ok: false,
    error_code: code,
    message,
    retryable
  };
}
