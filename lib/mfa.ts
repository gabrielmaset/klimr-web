/** A unique, human-readable name for a new TOTP (authenticator) factor. */
export function factorName() {
  return (
    "Authenticator · " +
    new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  );
}
