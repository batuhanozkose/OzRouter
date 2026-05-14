/**
 * Rendezvous (Highest Random Weight) Hashing
 *
 * Consistent hashing strategy: same key always maps to same target.
 * Adding/removing a target remaps only ~1/N keys (minimal disruption).
 *
 * Uses FNV-1a hash for speed — crypto-grade not needed for routing.
 */

// FNV-1a 32-bit hash constants
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit hash function — fast, good distribution, no dependencies.
 */
export function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0; // unsigned 32-bit
  }
  return hash;
}

/**
 * Select a target using Rendezvous (HRW) hashing.
 *
 * For each target, computes hash(targetId + key) and picks the target
 * with the highest hash value.
 *
 * @param targets - Array of objects with an `id` field (connection/execution key)
 * @param key - Routing key (conversation ID, session fingerprint, etc.)
 * @returns Index of selected target in the array, or -1 if empty
 */
export function rendezvousHashSelect(targets: { id: string }[], key: string): number {
  if (targets.length === 0) return -1;
  if (targets.length === 1) return 0;

  let maxHash = -1;
  let maxIndex = 0;

  for (let i = 0; i < targets.length; i++) {
    const hash = fnv1a(targets[i].id + "\0" + key);
    if (hash > maxHash) {
      maxHash = hash;
      maxIndex = i;
    }
  }

  return maxIndex;
}

/**
 * Extract a routing key from a request body for consistent hashing.
 *
 * Priority:
 * 1. previous_response_id (conversation continuity — same conversation, same target)
 * 2. session (explicit session ID)
 * 3. First 128 chars of first user message (content-based affinity)
 * 4. Random fallback (behaves like round-robin)
 */
export function extractRoutingKey(body: Record<string, unknown>): string {
  // 1. Conversation continuity via previous_response_id
  if (typeof body.previous_response_id === "string" && body.previous_response_id.length > 0) {
    return `prev:${body.previous_response_id}`;
  }

  // 2. Explicit session ID
  if (typeof body.session === "string" && body.session.length > 0) {
    return `sess:${body.session}`;
  }
  if (typeof body.session_id === "string" && body.session_id.length > 0) {
    return `sess:${body.session_id}`;
  }

  // 3. First user message content (content affinity)
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (msg && typeof msg === "object" && (msg as Record<string, unknown>).role === "user") {
        const content = (msg as Record<string, unknown>).content;
        if (typeof content === "string" && content.length > 0) {
          return `msg:${content.slice(0, 128)}`;
        }
      }
    }
  }

  // 4. Input field (Responses API)
  if (typeof body.input === "string" && body.input.length > 0) {
    return `input:${body.input.slice(0, 128)}`;
  }

  // 5. Random fallback — no deterministic key available
  return `rand:${Math.random().toString(36).slice(2)}`;
}
