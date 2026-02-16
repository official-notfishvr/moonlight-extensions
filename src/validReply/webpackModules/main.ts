import Dispatcher from "@moonlight-mod/wp/discord/Dispatcher";
import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

function findStore(name: string): any {
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

const fetching = new Map<string, string>();

const ReferencedMessageState = {
  Loaded: 0,
  NotLoaded: 1,
  Deleted: 2
};

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
      if (ReplyStore) {
        ReplyStore.set(channelId, messageId, {
          state: ReferencedMessageState.Deleted
        });
      }
      Dispatcher.dispatch({
        type: "MESSAGE_DELETE",
        channelId: channelId,
        message: messageId
      });
    } else {
      ensureCreateMessageRecord();
      const record = createMessageRecord ? createMessageRecord(replyMsg) : replyMsg;

      if (ReplyStore) {
        ReplyStore.set(replyMsg.channel_id, replyMsg.id, {
          state: ReferencedMessageState.Loaded,
          message: record
        });
      }

      Dispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: replyMsg
      });
    }
  } catch (e) {
  } finally {
    fetching.delete(messageId);
  }
}
