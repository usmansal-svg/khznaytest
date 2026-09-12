/**
 * Supabase's gateway occasionally answers a single request with a 5xx
 * ("Gateway Timeout") and is fine a moment later. For reads, one retry after
 * a short pause hides that from the screen; writes are never retried here.
 */
export async function fetchRetry(input: RequestInfo | URL, init?: RequestInit, tries = 2): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(input, init);
    if (res.status < 500 || i === tries - 1) return res;
    last = res;
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  return last!;
}
