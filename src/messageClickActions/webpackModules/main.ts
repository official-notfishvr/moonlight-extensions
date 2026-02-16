import Dispatcher from "@moonlight-mod/wp/discord/Dispatcher";
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

let _UserStore: any = null;
let _PermissionStore: any = null;
let _EditMessageStore: any = null;
let _MessageActions: any = null;
let _WindowStore: any = null;

function ensureStores() {
  if (!_UserStore) _UserStore = findStore("UserStore");
  if (!_PermissionStore) _PermissionStore = findStore("PermissionStore");
  if (!_EditMessageStore) _EditMessageStore = findStore("EditMessageStore");
  if (!_WindowStore) _WindowStore = findStore("WindowStore");
  if (!_MessageActions) {
    _MessageActions = findExport("deleteMessage", "startEditMessage");
  }
}

function getCurrentUserId(): string {
  ensureStores();
  try {
    const user = _UserStore?.getCurrentUser?.();
    if (user?.id) return user.id;
  } catch {}
  return "";
}

const Permissions = {
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  ADD_REACTIONS: 1n << 6n,
  READ_MESSAGE_HISTORY: 1n << 16n
};

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
let lastClickTime = 0;
let lastMouseDownTime = 0;

document.addEventListener("mousedown", () => {
  lastMouseDownTime = Date.now();
});

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

function showToast(message: string, type: "success" | "error" = "success") {
  const toast = document.createElement("div");
  toast.style.cssText =
    "position:fixed;bottom:30px;right:30px;z-index:99999;" +
    (type === "error" ? "background:#ed4245;" : "background:var(--background-floating,#18191c);") +
    "color:var(--text-normal,#dcddde);" +
    "padding:10px 16px;border-radius:8px;font-size:14px;" +
    "box-shadow:0 4px 12px rgba(0,0,0,0.3);" +
    "border:1px solid var(--background-modifier-accent,#40444b);" +
    "pointer-events:none;opacity:1;transition:opacity 0.3s;";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function copyWithToast(text: string, toastMsg: string) {
  copyToClipboard(text);
  showToast(toastMsg);
}

function canSend(channel: any): boolean {
  if (!channel.guild_id) return true;
  if (!_PermissionStore) return true;
  try {
    return _PermissionStore.can(Permissions.SEND_MESSAGES, channel);
  } catch {
    return true;
  }
}

function canDelete(msg: any, channel: any): boolean {
  const myId = getCurrentUserId();
  if (!myId) return false;
  if (msg.author?.id === myId) return true;
  if (_PermissionStore) {
    try {
      if (_PermissionStore.can(Permissions.MANAGE_MESSAGES, channel)) return true;
    } catch {}
  }
  return false;
}

function canReply(msg: any): boolean {
  if (!REPLYABLE_TYPES.has(msg.type)) return false;
  if ((msg.flags & EPHEMERAL_FLAG) === EPHEMERAL_FLAG) return false;
  return true;
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
  } catch (e) {}
}

async function toggleReaction(channelId: string, messageId: string, emoji: string, channel: any, msg: any) {
  const trimmed = emoji.trim();
  if (!trimmed) return;

  if (channel.guild_id && _PermissionStore) {
    try {
      if (
        !_PermissionStore.can(Permissions.ADD_REACTIONS, channel) ||
        !_PermissionStore.can(Permissions.READ_MESSAGE_HISTORY, channel)
      ) {
        showToast("Cannot react: Missing permissions", "error");
        return;
      }
    } catch {}
  }

  const customMatch = trimmed.match(/^:?([\w-]+):(\d+)$/);
  const emojiParam = customMatch ? `${customMatch[1]}:${customMatch[2]}` : trimmed;

  const hasReacted = msg.reactions?.some((r: any) => {
    const re = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name;
    return r.me && re === emojiParam;
  });

  try {
    let token: string | null = null;
    try {
      const authStore = findStore("AuthenticationStore");
      token = authStore?.getToken?.() ?? null;
    } catch {}
    if (!token) {
      try {
        const tokenMod = spacepack.findByCode("getToken", "hideToken")[0].exports;
        token = (tokenMod?.default ?? tokenMod)?.getToken?.() ?? null;
      } catch {}
    }

    if (token) {
      const ep = `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emojiParam)}/%40me`;
      const method = hasReacted ? "DELETE" : "PUT";
      const resp = await fetch(ep, {
        method,
        headers: { Authorization: token, "Content-Type": "application/json" }
      });
      if (!resp.ok) {
      }
    } else {
    }
  } catch (e) {}
}

function copyLink(msg: any, channel: any) {
  const guildId = channel.guild_id ?? "@me";
  copyWithToast(`https://discord.com/channels/${guildId}/${channel.id}/${msg.id}`, "Link copied!");
}

function togglePin(channel: any, msg: any) {
  if (_PermissionStore) {
    try {
      if (!_PermissionStore.can(Permissions.MANAGE_MESSAGES, channel)) {
        showToast("Cannot pin: Missing permissions", "error");
        return;
      }
    } catch {}
  }
  try {
    const PinActions = findExport("pinMessage", "unpinMessage");
    if (msg.pinned) {
      PinActions?.unpinMessage?.(channel, msg.id);
    } else {
      PinActions?.pinMessage?.(channel, msg.id);
    }
  } catch (e) {}
}

function quoteMessage(channel: any, msg: any) {
  if (!canReply(msg)) {
    showToast("Cannot quote this message type", "error");
    return;
  }
  let content = msg.content;
  if (getSetting<boolean>("useSelectionForQuote", false)) {
    const sel = window.getSelection()?.toString().trim();
    if (sel && msg.content?.includes(sel)) content = sel;
  }
  if (!content) return;
  const quoteText =
    content
      .split("\n")
      .map((l: string) => `> ${l}`)
      .join("\n") + "\n";
  insertTextIntoChatInput(quoteText);
  if (getSetting<boolean>("quoteWithReply", true)) {
    Dispatcher.dispatch({
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
  Dispatcher.dispatch({
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
        Dispatcher.dispatch({
          type: "MESSAGE_DELETE",
          channelId: channel.id,
          id: msg.id,
          mlDeleted: true
        });
      } else if (_MessageActions) {
        _MessageActions.deleteMessage(channel.id, msg.id);
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
      if (!isMe) {
        return;
      }
      if (_EditMessageStore?.isEditing?.(channel.id, msg.id)) {
        return;
      }
      if (msg.state && msg.state !== "SENT") {
        return;
      }
      if (_MessageActions?.startEditMessage) {
        _MessageActions.startEditMessage(channel.id, msg.id, msg.content);
      } else {
        Dispatcher.dispatch({
          type: "MESSAGE_START_EDIT",
          channelId: channel.id,
          messageId: msg.id,
          content: msg.content
        });
      }
      event.preventDefault();
      break;

    case "REPLY":
      if (!canReply(msg)) return;
      if (!canSend(channel)) return;
      Dispatcher.dispatch({
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
        if (_EditMessageStore?.isEditing?.(channel.id, msg.id)) return;
        if (msg.state !== "SENT") return;
        _MessageActions?.startEditMessage?.(channel.id, msg.id, msg.content);
      } else {
        if (!canReply(msg)) return;
        if (!canSend(channel)) return;
        Dispatcher.dispatch({
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

    ensureStores();
    const myId = getCurrentUserId();
    const isMe = msg.author?.id === myId;

    const isDM = channel.isDM?.() ?? false;
    const isSystemDM = channel.isSystemDM?.() ?? false;
    if (
      (getSetting<boolean>("disableInDms", false) && isDM) ||
      (getSetting<boolean>("disableInSystemDms", true) && isSystemDM)
    )
      return;

    const selectionHoldTimeout = getSetting<number>("selectionHoldTimeout", 300);
    if (Date.now() - lastMouseDownTime > selectionHoldTimeout) return;

    const clickTimeout = getSetting<number>("clickTimeout", 300);
    const doubleClickHoldThreshold = getSetting<number>("doubleClickHoldThreshold", 150);
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

    const clickCount = event.detail;

    if (clickCount === 3) {
      if (singleClickTimer) {
        clearTimeout(singleClickTimer);
        singleClickTimer = null;
      }
      if (!deferDoubleClickForTriple) return;
      if (isModifierActive(tripleClickModifier) && tripleClickAction !== "NONE") {
        executeAction(tripleClickAction, msg, channel, event);
      }
      return;
    }

    if (clickCount === 2) {
      if (singleClickTimer) {
        clearTimeout(singleClickTimer);
        singleClickTimer = null;
      }
      if (!isModifierActive(doubleClickModifier) && doubleClickModifier !== "NONE") return;
      if (doubleClickAction === "NONE") return;
      if (!canSend(channel)) return;
      if (msg.deleted) return;

      executeAction(doubleClickAction, msg, channel, event);
      event.preventDefault();
      return;
    }

    if (clickCount === 1) {
      if (singleClickModifier === "NONE" && doubleClickAction !== "NONE") {
        const capturedMsg = msg;
        const capturedChannel = channel;
        const capturedEvent = event;
        singleClickTimer = setTimeout(() => {
          singleClickTimer = null;
          if (isModifierActive(singleClickModifier) && singleClickAction !== "NONE") {
            executeAction(singleClickAction, capturedMsg, capturedChannel, capturedEvent);
          }
        }, clickTimeout);
      } else {
        if (isModifierActive(singleClickModifier) && singleClickAction !== "NONE") {
          executeAction(singleClickAction, msg, channel, event);
        }
      }
    }
  } catch (e) {}
}

document.addEventListener("keydown", keydown);
document.addEventListener("keyup", keyup);
window.addEventListener("blur", blur);

ensureStores();
if (_WindowStore?.addChangeListener) {
  _WindowStore.addChangeListener(blur);
}
