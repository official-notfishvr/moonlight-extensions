import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

function requireMapped(id: string): any {
  try {
    if (!(id in (spacepack.modules ?? {})) && !(id in (spacepack.cache ?? {}))) return null;
    return spacepack.require(id);
  } catch {
    return null;
  }
}

function findStore(name: string): any {
  const mapped = requireMapped(`discord/stores/${name}`);
  const mappedExport = mapped?.default ?? mapped;
  if (mappedExport?.getName?.() === name) return mappedExport;
  for (const key of Object.keys(mappedExport ?? {})) {
    if (mappedExport[key]?.getName?.() === name) return mappedExport[key];
  }

  try {
    const mod = spacepack.findByCode(`"${name}"`)[0].exports;
    if (mod?.default?.getName?.() === name) return mod.default;
    if (mod?.getName?.() === name) return mod;
    for (const key of Object.keys(mod)) {
      if (mod[key]?.getName?.() === name) return mod[key];
    }
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

let ReplyStore: any = null;
let createMessageRecord: any = null;
let Dispatcher: any = null;

const fetching = new Map<string, string>();

const ReferencedMessageState = {
  Loaded: 0,
  NotLoaded: 1,
  Deleted: 2
};

function getDispatcher(): any {
  if (Dispatcher) return Dispatcher;
  try {
    const mod = requireMapped("discord/Dispatcher");
    Dispatcher = mod?.default ?? mod;
  } catch {
    Dispatcher = null;
  }
  return Dispatcher;
}

function getReplyStore(): any {
  if (ReplyStore) return ReplyStore;

  const mapped = requireMapped("discord/modules/replies/ReferencedMessageStore");
  const mappedExport = mapped?.default ?? mapped;
  if (mappedExport?.getName?.() === "ReferencedMessageStore") {
    ReplyStore = mappedExport;
    return ReplyStore;
  }
  for (const key of Object.keys(mappedExport ?? {})) {
    if (mappedExport[key]?.getName?.() === "ReferencedMessageStore") {
      ReplyStore = mappedExport[key];
      return ReplyStore;
    }
  }

  ReplyStore = findStore("ReferencedMessageStore");
  return ReplyStore;
}

function ensureCreateMessageRecord() {
  if (createMessageRecord) return;
  try {
    const mod = spacepack.findByCode(".createFromServer(", ".isBlockedForMessage", "messageReference:")[0].exports;
    createMessageRecord = mod?.default ?? mod;
    if (typeof createMessageRecord !== "function") {
      for (const key of Object.keys(mod)) {
        if (typeof mod[key] === "function") {
          createMessageRecord = mod[key];
          break;
        }
      }
    }
  } catch (e) {}
}

async function getToken(): Promise<string | null> {
  try {
    const authStore = findStore("AuthenticationStore");
    return authStore?.getToken?.() ?? null;
  } catch {
    return null;
  }
}

export function setReplyStore(store: any) {
  ReplyStore = store;
}

export async function fetchReply(reply: any) {
  const ref = reply?.baseMessage?.messageReference;
  if (!ref) return;

  const channelId = ref.channel_id;
  const messageId = ref.message_id;
  if (!channelId || !messageId) return;

  if (fetching.has(messageId)) return;
  fetching.set(messageId, channelId);

  try {
    const token = await getToken();
    if (!token) {
      return;
    }

    const resp = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages?limit=1&around=${messageId}`, {
      headers: { Authorization: token }
    });

    if (!resp.ok) {
      return;
    }

    const messages = await resp.json();
    const replyMsg = messages?.[0];
    if (!replyMsg) return;

    if (replyMsg.id !== messageId) {
      const replyStore = getReplyStore();
      if (replyStore) {
        replyStore.set(channelId, messageId, {
          state: ReferencedMessageState.Deleted
        });
      }
      getDispatcher()?.dispatch?.({
        type: "MESSAGE_DELETE",
        channelId: channelId,
        message: messageId
      });
    } else {
      ensureCreateMessageRecord();
      const record = createMessageRecord ? createMessageRecord(replyMsg) : replyMsg;

      const replyStore = getReplyStore();
      if (replyStore) {
        replyStore.set(replyMsg.channel_id, replyMsg.id, {
          state: ReferencedMessageState.Loaded,
          message: record
        });
      }

      getDispatcher()?.dispatch?.({
        type: "MESSAGE_UPDATE",
        message: replyMsg
      });
    }
  } catch (e) {
  } finally {
    fetching.delete(messageId);
  }
}
