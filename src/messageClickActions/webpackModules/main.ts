import { AuthenticationStore, PermissionStore, UserStore } from "@moonlight-mod/wp/common_stores";
import { Permissions } from "@moonlight-mod/wp/discord/Constants";
import { createToast } from "@moonlight-mod/wp/discord/design/components/Toast/web/Toast";
import { showToast as showDiscordToast } from "@moonlight-mod/wp/discord/design/components/Toast/web/ToastAPI";
import { ToastType } from "@moonlight-mod/wp/discord/design/components/Toast/web/ToastConstants";
import Dispatcher from "@moonlight-mod/wp/discord/Dispatcher";
import ClipboardUtils from "@moonlight-mod/wp/discord/utils/ClipboardUtils";
import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

const EXT_ID = "messageClickActions";

type Modifier = "NONE" | "SHIFT" | "CTRL" | "ALT" | "BACKSPACE" | "DELETE";
type ClickAction =
  | "NONE"
  | "DELETE"
  | "COPY_LINK"
  | "COPY_ID"
  | "COPY_CONTENT"
  | "COPY_USER_ID"
  | "EDIT"
  | "REPLY"
  | "REACT"
  | "OPEN_THREAD"
  | "OPEN_TAB"
  | "EDIT_REPLY"
  | "QUOTE"
  | "PIN";

function getSetting<T>(name: string, fallback: T): T {
  const val = moonlight.getConfigOption<T>(EXT_ID, name);
  return val !== undefined ? val : fallback;
}

function findExport(...finds: string[]): any {
  try {
    const mod = spacepack.findByCode(...finds)[0].exports;
    if (!mod) return null;
    const funcName = finds[0];
    if (typeof mod[funcName] === "function") return mod;
    if (mod.default && typeof mod.default[funcName] === "function") return mod.default;
    for (const key of Object.keys(mod)) {
      if (mod[key] && typeof mod[key][funcName] === "function") return mod[key];
    }
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

function requireMapped(id: string): any {
  try {
    return spacepack.require(id)?.default ?? spacepack.require(id);
  } catch {
    return null;
  }
}

let editMessageStore: any = null;
let messageActions: any = null;
let windowStore: any = null;

function ensureStores() {
  if (!editMessageStore) editMessageStore = requireMapped("discord/stores/EditMessageStore");
  if (!windowStore) windowStore = requireMapped("discord/stores/WindowStore");
  if (!messageActions) messageActions = findExport("deleteMessage", "startEditMessage");
}

function getCurrentUserId(): string {
  try {
    return UserStore?.getCurrentUser?.()?.id ?? "";
  } catch {
    return "";
  }
}

const REPLYABLE_TYPES = new Set([0, 6, 18, 19, 20, 21]);
const EPHEMERAL_FLAG = 64;

const pressedKeys = new Set<string>();

const keydown = (e: KeyboardEvent) => {
  pressedKeys.add(e.key);
};
const keyup = (e: KeyboardEvent) => {
  pressedKeys.delete(e.key);
};
const blur = () => {
  pressedKeys.clear();
};

function isModifierActive(modifier: Modifier): boolean {
  switch (modifier) {
    case "NONE":
      return (
        !pressedKeys.has("Shift") &&
        !pressedKeys.has("Control") &&
        !pressedKeys.has("Alt") &&
        !pressedKeys.has("Backspace") &&
        !pressedKeys.has("Delete")
      );
    case "SHIFT":
      return pressedKeys.has("Shift");
    case "CTRL":
      return pressedKeys.has("Control");
    case "ALT":
      return pressedKeys.has("Alt");
    case "BACKSPACE":
      return pressedKeys.has("Backspace");
    case "DELETE":
      return pressedKeys.has("Delete");
    default:
      return false;
  }
}

let singleClickTimer: ReturnType<typeof setTimeout> | null = null;
let lastMouseDownTime = 0;

document.addEventListener("mousedown", () => {
  lastMouseDownTime = Date.now();
});

function copyToClipboard(text: string) {
  ClipboardUtils.copy(text);
}

function showToast(message: string, type: "success" | "error" = "success") {
  showDiscordToast(createToast(message, type === "error" ? ToastType.FAILURE : ToastType.SUCCESS));
}

function copyWithToast(text: string, toastMsg: string) {
  copyToClipboard(text);
  showToast(toastMsg);
}

function canSend(channel: any): boolean {
  if (!channel.guild_id) return true;
  try {
    return PermissionStore.can(Permissions.SEND_MESSAGES, channel);
  } catch {
    return true;
  }
}

function canDelete(msg: any, channel: any): boolean {
  const myId = getCurrentUserId();
  if (!myId) return false;
  if (msg.author?.id === myId) return true;

  try {
    return PermissionStore.can(Permissions.MANAGE_MESSAGES, channel);
  } catch {
    return false;
  }
}

function canReply(msg: any): boolean {
  return REPLYABLE_TYPES.has(msg.type) && (msg.flags & EPHEMERAL_FLAG) !== EPHEMERAL_FLAG;
}

function insertTextIntoChatInput(text: string) {
  try {
    const editors = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
    if (editors.length === 0) return;

    const editor = editors[editors.length - 1] as HTMLElement;
    editor.focus();

    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    document.execCommand("insertText", false, text);
  } catch {}
}

async function toggleReaction(channelId: string, messageId: string, emoji: string, channel: any, msg: any) {
  const trimmed = emoji.trim();
  if (!trimmed) return;

  if (channel.guild_id) {
    try {
      if (
        !PermissionStore.can(Permissions.ADD_REACTIONS, channel) ||
        !PermissionStore.can(Permissions.READ_MESSAGE_HISTORY, channel)
      ) {
        showToast("Cannot react: Missing permissions", "error");
        return;
      }
    } catch {}
  }

  const customMatch = trimmed.match(/^:?([\w-]+):(\d+)$/);
  const emojiParam = customMatch ? `${customMatch[1]}:${customMatch[2]}` : trimmed;

  const hasReacted = msg.reactions?.some((reaction: any) => {
    const reactionEmoji = reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name;
    return reaction.me && reactionEmoji === emojiParam;
  });

  try {
    let token: string | null = null;
    try {
      token = AuthenticationStore?.getToken?.() ?? null;
    } catch {}

    if (!token) {
      try {
        const tokenMod = spacepack.findByCode("getToken", "hideToken")[0].exports;
        token = (tokenMod?.default ?? tokenMod)?.getToken?.() ?? null;
      } catch {}
    }

    if (!token) return;

    const endpoint = `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emojiParam)}/%40me`;
    await fetch(endpoint, {
      method: hasReacted ? "DELETE" : "PUT",
      headers: { Authorization: token, "Content-Type": "application/json" }
    });
  } catch {}
}

function copyLink(msg: any, channel: any) {
  const guildId = channel.guild_id ?? "@me";
  copyWithToast(`https://discord.com/channels/${guildId}/${channel.id}/${msg.id}`, "Link copied!");
}

function togglePin(channel: any, msg: any) {
  try {
    if (!PermissionStore.can(Permissions.MANAGE_MESSAGES, channel)) {
      showToast("Cannot pin: Missing permissions", "error");
      return;
    }
  } catch {}

  try {
    const pinActions = findExport("pinMessage", "unpinMessage");
    if (msg.pinned) pinActions?.unpinMessage?.(channel, msg.id);
    else pinActions?.pinMessage?.(channel, msg.id);
  } catch {}
}

function quoteMessage(channel: any, msg: any) {
  if (!canReply(msg)) {
    showToast("Cannot quote this message type", "error");
    return;
  }

  let content = msg.content;
  if (getSetting<boolean>("useSelectionForQuote", false)) {
    const selection = window.getSelection()?.toString().trim();
    if (selection && msg.content?.includes(selection)) content = selection;
  }
  if (!content) return;

  const quoteText =
    content
      .split("\n")
      .map((line: string) => `> ${line}`)
      .join("\n") + "\n";

  insertTextIntoChatInput(quoteText);

  if (getSetting<boolean>("quoteWithReply", true)) {
    Dispatcher?.dispatch?.({
      type: "CREATE_PENDING_REPLY",
      channel,
      message: msg,
      shouldMention: false,
      showMentionToggle: !channel.isDM?.()
    });
  }
}

function openInNewTab(msg: any, channel: any) {
  const guildId = channel.guild_id ?? "@me";
  window.open(`https://discord.com/channels/${guildId}/${channel.id}/${msg.id}`, "_blank");
}

function openInThread(msg: any, channel: any) {
  Dispatcher?.dispatch?.({
    type: "OPEN_THREAD_FLOW_MODAL",
    channelId: channel.id,
    messageId: msg.id
  });
}

async function executeAction(action: ClickAction, msg: any, channel: any, event: MouseEvent) {
  ensureStores();

  const myId = getCurrentUserId();
  const isMe = msg.author?.id === myId;

  switch (action) {
    case "DELETE":
      if (!canDelete(msg, channel)) return;
      if (msg.deleted) {
        Dispatcher?.dispatch?.({
          type: "MESSAGE_DELETE",
          channelId: channel.id,
          id: msg.id,
          mlDeleted: true
        });
      } else {
        messageActions?.deleteMessage?.(channel.id, msg.id);
      }
      event.preventDefault();
      break;
    case "COPY_LINK":
      copyLink(msg, channel);
      event.preventDefault();
      break;
    case "COPY_ID":
      copyWithToast(msg.id, "Message ID copied!");
      event.preventDefault();
      break;
    case "COPY_CONTENT":
      copyWithToast(msg.content || "", "Message content copied!");
      event.preventDefault();
      break;
    case "COPY_USER_ID":
      copyWithToast(msg.author?.id || "", "User ID copied!");
      event.preventDefault();
      break;
    case "EDIT":
      if (!isMe) return;
      if (editMessageStore?.isEditing?.(channel.id, msg.id)) return;
      if (msg.state && msg.state !== "SENT") return;

      if (messageActions?.startEditMessage) {
        messageActions.startEditMessage(channel.id, msg.id, msg.content);
      } else {
        Dispatcher?.dispatch?.({
          type: "MESSAGE_START_EDIT",
          channelId: channel.id,
          messageId: msg.id,
          content: msg.content
        });
      }
      event.preventDefault();
      break;
    case "REPLY":
      if (!canReply(msg) || !canSend(channel)) return;
      Dispatcher?.dispatch?.({
        type: "CREATE_PENDING_REPLY",
        channel,
        message: msg,
        shouldMention: !event.shiftKey,
        showMentionToggle: channel.guild_id !== null
      });
      event.preventDefault();
      break;
    case "EDIT_REPLY":
      if (isMe) {
        if (editMessageStore?.isEditing?.(channel.id, msg.id)) return;
        if (msg.state !== "SENT") return;
        messageActions?.startEditMessage?.(channel.id, msg.id, msg.content);
      } else {
        if (!canReply(msg) || !canSend(channel)) return;
        Dispatcher?.dispatch?.({
          type: "CREATE_PENDING_REPLY",
          channel,
          message: msg,
          shouldMention: true,
          showMentionToggle: channel.guild_id !== null
        });
      }
      event.preventDefault();
      break;
    case "QUOTE":
      quoteMessage(channel, msg);
      event.preventDefault();
      break;
    case "PIN":
      togglePin(channel, msg);
      event.preventDefault();
      break;
    case "REACT":
      await toggleReaction(channel.id, msg.id, getSetting<string>("reactEmoji", "💀"), channel, msg);
      event.preventDefault();
      break;
    case "OPEN_THREAD":
      openInThread(msg, channel);
      event.preventDefault();
      break;
    case "OPEN_TAB":
      openInNewTab(msg, channel);
      event.preventDefault();
      break;
    case "NONE":
      break;
  }
}

function shouldIgnoreTarget(target: HTMLElement): boolean {
  if (!target) return true;
  return !!(
    target.closest("a") ||
    target.closest("button") ||
    target.closest('[role="button"]') ||
    target.closest("img") ||
    target.closest("video") ||
    target.closest('[class*="embedWrapper"]') ||
    target.closest('[class*="reactionInner"]') ||
    target.closest('[class*="avatar"]') ||
    target.closest('[class*="username"]') ||
    target.closest('[class*="repliedMessage"]') ||
    target.closest('[class*="codeBlockText"]') ||
    target.closest('[class*="spoilerContent"]')
  );
}

export function onMessageClick(event: MouseEvent, props: any) {
  try {
    if (event.button !== 0) return;

    const msg = props?.message;
    const channel = props?.channel;
    if (!msg || !channel) return;

    let target = event.target as HTMLElement;
    if (target?.nodeType === Node.TEXT_NODE) target = target.parentElement as HTMLElement;
    if (shouldIgnoreTarget(target)) return;

    const myId = getCurrentUserId();
    const isMe = msg.author?.id === myId;

    const isDM = channel.isDM?.() ?? false;
    const isSystemDM = channel.isSystemDM?.() ?? false;
    if (
      (getSetting<boolean>("disableInDms", false) && isDM) ||
      (getSetting<boolean>("disableInSystemDms", true) && isSystemDM)
    ) {
      return;
    }

    const selectionHoldTimeout = getSetting<number>("selectionHoldTimeout", 300);
    if (Date.now() - lastMouseDownTime > selectionHoldTimeout) return;

    const clickTimeout = getSetting<number>("clickTimeout", 300);
    const deferDoubleClickForTriple = getSetting<boolean>("deferDoubleClickForTriple", true);

    const singleClickAction = (
      isMe ? getSetting<string>("singleClickAction", "DELETE") : getSetting<string>("singleClickOthersAction", "DELETE")
    ) as ClickAction;
    const doubleClickAction = (
      isMe ? getSetting<string>("doubleClickAction", "EDIT") : getSetting<string>("doubleClickOthersAction", "REPLY")
    ) as ClickAction;
    const tripleClickAction = getSetting<string>("tripleClickAction", "REACT") as ClickAction;

    const singleClickModifier = (
      isMe
        ? getSetting<string>("singleClickModifier", "BACKSPACE")
        : getSetting<string>("singleClickOthersModifier", "BACKSPACE")
    ) as Modifier;
    const doubleClickModifier = getSetting<string>("doubleClickModifier", "NONE") as Modifier;
    const tripleClickModifier = getSetting<string>("tripleClickModifier", "NONE") as Modifier;

    if (event.detail === 3) {
      if (singleClickTimer) {
        clearTimeout(singleClickTimer);
        singleClickTimer = null;
      }
      if (!deferDoubleClickForTriple) return;
      if (isModifierActive(tripleClickModifier) && tripleClickAction !== "NONE") {
        void executeAction(tripleClickAction, msg, channel, event);
      }
      return;
    }

    if (event.detail === 2) {
      if (singleClickTimer) {
        clearTimeout(singleClickTimer);
        singleClickTimer = null;
      }
      if (!isModifierActive(doubleClickModifier) && doubleClickModifier !== "NONE") return;
      if (doubleClickAction === "NONE" || !canSend(channel) || msg.deleted) return;

      void executeAction(doubleClickAction, msg, channel, event);
      event.preventDefault();
      return;
    }

    if (event.detail === 1) {
      if (singleClickModifier === "NONE" && doubleClickAction !== "NONE") {
        const capturedMsg = msg;
        const capturedChannel = channel;
        const capturedEvent = event;
        singleClickTimer = setTimeout(() => {
          singleClickTimer = null;
          if (isModifierActive(singleClickModifier) && singleClickAction !== "NONE") {
            void executeAction(singleClickAction, capturedMsg, capturedChannel, capturedEvent);
          }
        }, clickTimeout);
      } else if (isModifierActive(singleClickModifier) && singleClickAction !== "NONE") {
        void executeAction(singleClickAction, msg, channel, event);
      }
    }
  } catch {}
}

document.addEventListener("keydown", keydown);
document.addEventListener("keyup", keyup);
window.addEventListener("blur", blur);

ensureStores();
windowStore?.addChangeListener?.(blur);
