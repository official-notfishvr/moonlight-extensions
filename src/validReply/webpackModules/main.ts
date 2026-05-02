import Dispatcher from "@moonlight-mod/wp/discord/Dispatcher";
import ReferencedMessageStore from "@moonlight-mod/wp/discord/modules/replies/ReferencedMessageStore";
import AuthenticationStore from "@moonlight-mod/wp/discord/stores/AuthenticationStore";
import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

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
      for (const key of Object.keys(mod ?? {})) {
        if (typeof mod[key] === "function") {
          createMessageRecord = mod[key];
          break;
        }
      }
    }
  } catch {}
}

async function getToken(): Promise<string | null> {
  try {
    return AuthenticationStore?.getToken?.() ?? null;
  } catch {
    return null;
  }
}

export async function fetchReply(reply: any) {
  const ref = reply?.baseMessage?.messageReference;
  if (!ref) return;

  const channelId = ref.channel_id;
  const messageId = ref.message_id;
  if (!channelId || !messageId || fetching.has(messageId)) return;

  fetching.set(messageId, channelId);

  try {
    const token = await getToken();
    if (!token) return;

    const resp = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages?limit=1&around=${messageId}`, {
      headers: { Authorization: token }
    });
    if (!resp.ok) return;

    const messages = await resp.json();
    const replyMsg = messages?.[0];
    if (!replyMsg) return;

    if (replyMsg.id !== messageId) {
      ReferencedMessageStore?.set?.(channelId, messageId, {
        state: ReferencedMessageState.Deleted
      });
      Dispatcher?.dispatch?.({
        type: "MESSAGE_DELETE",
        channelId,
        message: messageId
      });
      return;
    }

    ensureCreateMessageRecord();
    ReferencedMessageStore?.set?.(replyMsg.channel_id, replyMsg.id, {
      state: ReferencedMessageState.Loaded,
      message: createMessageRecord ? createMessageRecord(replyMsg) : replyMsg
    });
    Dispatcher?.dispatch?.({
      type: "MESSAGE_UPDATE",
      message: replyMsg
    });
  } catch {
  } finally {
    fetching.delete(messageId);
  }
}
