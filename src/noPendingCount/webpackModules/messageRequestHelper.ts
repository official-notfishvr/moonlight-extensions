/**
 * Returns the real message request count for tab visibility logic.
 * Used so that only the red badge is hidden, not the Message Requests tab itself.
 */
export function getRealMessageRequestCount(store: { getMessageRequestChannelIds(): Map<string, unknown> }): number {
  return store.getMessageRequestChannelIds().size;
}
