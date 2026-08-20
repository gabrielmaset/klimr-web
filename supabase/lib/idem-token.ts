/** KRA-037: a dedupe token is an opaque client nonce, not data — accept only a
 * safe shape and refuse the rest. Used by the queue join actions to key
 * idempotent placement commands without trusting form input. */
export function cleanIdemToken(v: FormDataEntryValue | null): string | null {
  const t = String(v ?? "");
  return /^[A-Za-z0-9-]{8,64}$/.test(t) ? t : null;
}
