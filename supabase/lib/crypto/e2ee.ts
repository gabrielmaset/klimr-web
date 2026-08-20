/**
 * Client-side end-to-end encryption for match chats. Browser-only (Web Crypto +
 * IndexedDB). The private identity key is generated on the device, stored
 * non-extractable in IndexedDB, and never leaves the browser. The server only
 * ever receives the public key, per-recipient wrapped conversation keys, and
 * ciphertext.
 *
 * Scheme: ECDH P-256 identity keys -> ECDH shared secret per pair -> AES-GCM
 * wrapping of a random per-conversation AES-GCM key -> AES-GCM message encryption.
 *
 * Honest limits (see CHAT.md): no forward secrecy, multi-device needs re-keying,
 * losing the browser key loses the messages, and the server still sees metadata.
 */

const DB_NAME = "klimr-e2ee";
const STORE = "keys";
const ID_KEY = "identity-ecdh-p256";

// ---------- base64 helpers ----------
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ---------- tiny IndexedDB key/value ----------
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

type Identity = { priv: CryptoKey; pubB64: string; deviceId: string };

/**
 * Returns this device's ECDH identity, generating it on first use. The private
 * key is stored non-extractable; the public key (base64 SPKI) and a stable
 * per-device id are returned so the caller can register this device's key.
 */
export async function getIdentity(): Promise<Identity> {
  const existing = await idbGet<Identity>(ID_KEY);
  if (existing?.priv && existing?.pubB64) {
    if (existing.deviceId) return existing;
    const patched: Identity = { ...existing, deviceId: crypto.randomUUID() };
    await idbSet(ID_KEY, patched);
    return patched;
  }

  // Generate extractable, then re-import the private key as non-extractable.
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const priv = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveKey",
    "deriveBits",
  ]);
  const identity: Identity = { priv, pubB64: bufToB64(spki), deviceId: crypto.randomUUID() };
  await idbSet(ID_KEY, identity);
  return identity;
}

// Derive a per-pair AES-GCM key from my private key + their public key.
async function sharedAesKey(myPriv: CryptoKey, theirPubB64: string): Promise<CryptoKey> {
  const theirPub = await crypto.subtle.importKey("spki", b64ToBuf(theirPubB64), { name: "ECDH", namedCurve: "P-256" }, false, []);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPub },
    myPriv,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** A fresh random conversation key (extractable so it can be wrapped per recipient). */
export async function generateConversationKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Wrap (encrypt) the conversation key for a recipient using the ECDH shared secret. */
export async function wrapKeyFor(
  recipientPubB64: string,
  convKey: CryptoKey,
  myPriv: CryptoKey,
): Promise<{ wrapped: string; iv: string }> {
  const aes = await sharedAesKey(myPriv, recipientPubB64);
  const raw = await crypto.subtle.exportKey("raw", convKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, raw);
  return { wrapped: bufToB64(ct), iv: bufToB64(iv.buffer) };
}

/** Unwrap a conversation key that someone wrapped for me. */
export async function unwrapKey(
  wrappedB64: string,
  ivB64: string,
  wrapperPubB64: string,
  myPriv: CryptoKey,
): Promise<CryptoKey> {
  const aes = await sharedAesKey(myPriv, wrapperPubB64);
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(ivB64)) },
    aes,
    b64ToBuf(wrappedB64),
  );
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encryptMessage(convKey: CryptoKey, text: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, convKey, new TextEncoder().encode(text));
  return { ciphertext: bufToB64(ct), iv: bufToB64(iv.buffer) };
}

export async function decryptMessage(convKey: CryptoKey, ciphertextB64: string, ivB64: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(ivB64)) },
    convKey,
    b64ToBuf(ciphertextB64),
  );
  return new TextDecoder().decode(pt);
}

// ---------- conversation key cache ----------
export async function cacheConversationKey(conversationId: string, key: CryptoKey): Promise<void> {
  await idbSet(`conv:${conversationId}`, key);
}
export async function getCachedConversationKey(conversationId: string): Promise<CryptoKey | undefined> {
  return idbGet<CryptoKey>(`conv:${conversationId}`);
}
