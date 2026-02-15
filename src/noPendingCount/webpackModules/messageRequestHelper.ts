export function getRealMessageRequestCount(store: { getMessageRequestChannelIds(): Map<string, unknown> }): number {
  return store.getMessageRequestChannelIds().size;
}
