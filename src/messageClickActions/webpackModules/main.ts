import { AuthenticationStore, ChannelStore, PermissionStore, UserStore } from "@moonlight-mod/wp/common_stores";
import { Permissions } from "@moonlight-mod/wp/discord/Constants";
import { createToast } from "@moonlight-mod/wp/discord/design/components/Toast/web/Toast";
import { showToast as showDiscordToast } from "@moonlight-mod/wp/discord/design/components/Toast/web/ToastAPI";
import { ToastType } from "@moonlight-mod/wp/discord/design/components/Toast/web/ToastConstants";
import Dispatcher from "@moonlight-mod/wp/discord/Dispatcher";
import ClipboardUtils from "@moonlight-mod/wp/discord/utils/ClipboardUtils";
import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

const EXT_ID = "messageClickActions";
const EPHEMERAL_FLAG = 64;
const REPLYABLE_TYPES = new Set([0, 6, 18, 19, 20, 21]);
const IGNORED_TARGET_SELECTORS = [
  "a",
  "button",
  '[role="button"]',
  "img",
  "video",
  '[class*="embedWrapper"]',
  '[class*="reactionInner"]',
  '[class*="avatar"]',
  '[class*="username"]',
  '[class*="repliedMessage"]',
  '[class*="codeBlockText"]',
  '[class*="spoilerContent"]'
].join(",");

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

type MessageContext = {
  message: any;
  channel: any;
};

let messageActions: any = null;
let singleClickTimer: ReturnType<typeof setTimeout> | null = null;
let lastMouseDownTime = 0;
let installed = false;
const pressedKeys = new Set<string>();

function getSetting<T>(name: string, fallback: T): T {
  const value = moonlight.getConfigOption<T>(EXT_ID, name);
  return value !== undefined ? value : fallback;
}

function findExport(...needles: string[]) {
  try {
    const exports = spacepack.findByCode(...needles)[0]?.exports;
    if (!exports) return null;

    const method = needles[0];
    if (typeof exports[method] === "function") return exports;
    if (typeof exports.default?.[method] === "function") return exports.default;

    for (const key of Object.keys(exports)) {
      if (typeof exports[key]?.[method] === "function") return exports[key];
    }

    return exports.default ?? exports;
  } catch {
    return null;
  }
}

function ensureRuntimeModules() {
  if (!messageActions) {
    messageActions = findExport("deleteMessage", "startEditMessage");
  }
}

function getCurrentUserId(): string {
  try {
    return UserStore?.getCurrentUser?.()?.id ?? "";
  } catch {
    return "";
  }
}

function setPressedKey(event: KeyboardEvent, active: boolean) {
  if (active) pressedKeys.add(event.key);
  else pressedKeys.delete(event.key);
}

function clearPressedKeys() {
  pressedKeys.clear();
}

function isModifierActive(modifier: Modifier): boolean {
  switch (modifier) {
    case "NONE":
      return !["Shift", "Control", "Alt", "Backspace", "Delete"].some((key) => pressedKeys.has(key));
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

function copyToClipboard(text: string) {
  ClipboardUtils.copy(text);
}

function showToast(message: string, type: "success" | "error" = "success") {
  showDiscordToast(createToast(message, type === "error" ? ToastType.FAILURE : ToastType.SUCCESS));
}

function copyWithToast(text: string, toast: string) {
  copyToClipboard(text);
  showToast(toast);
}

function canSend(channel: any): boolean {
  if (!channel.guild_id) return true;

  try {
    return PermissionStore.can(Permissions.SEND_MESSAGES, channel);
  } catch {
    return true;
  }
}

function canDelete(message: any, channel: any): boolean {
  const currentUserId = getCurrentUserId();
  if (!currentUserId) return false;
  if (message.author?.id === currentUserId) return true;

  try {
    return PermissionStore.can(Permissions.MANAGE_MESSAGES, channel);
  } catch {
    return false;
  }
}

function canReply(message: any): boolean {
  return REPLYABLE_TYPES.has(message.type) && (message.flags & EPHEMERAL_FLAG) !== EPHEMERAL_FLAG;
}

function insertTextIntoChatInput(text: string) {
  try {
    const editors = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
    const editor = editors[editors.length - 1] as HTMLElement | undefined;
    if (!editor) return;

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

async function toggleReaction(channelId: string, messageId: string, emoji: string, channel: any, message: any) {
  const trimmedEmoji = emoji.trim();
  if (!trimmedEmoji) return;

  if (channel.guild_id) {
    try {
      const canReact =
        PermissionStore.can(Permissions.ADD_REACTIONS, channel) &&
        PermissionStore.can(Permissions.READ_MESSAGE_HISTORY, channel);
      if (!canReact) {
        showToast("Cannot react: Missing permissions", "error");
        return;
      }
    } catch {}
  }

  const customEmoji = trimmedEmoji.match(/^:?([\w-]+):(\d+)$/);
  const emojiParam = customEmoji ? `${customEmoji[1]}:${customEmoji[2]}` : trimmedEmoji;
  const hasReacted = message.reactions?.some((reaction: any) => {
    const current = reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name;
    return reaction.me && current === emojiParam;
  });

  try {
    let token = AuthenticationStore?.getToken?.() ?? null;
    if (!token) {
      const tokenModule = spacepack.findByCode("getToken", "hideToken")[0]?.exports;
      token = (tokenModule?.default ?? tokenModule)?.getToken?.() ?? null;
    }
    if (!token) return;

    await fetch(
      `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emojiParam)}/%40me`,
      {
        method: hasReacted ? "DELETE" : "PUT",
        headers: { Authorization: token, "Content-Type": "application/json" }
      }
    );
  } catch {}
}

function copyMessageLink(message: any, channel: any) {
  const guildId = channel.guild_id ?? "@me";
  copyWithToast(`https://discord.com/channels/${guildId}/${channel.id}/${message.id}`, "Link copied!");
}

function togglePin(channel: any, message: any) {
  try {
    if (!PermissionStore.can(Permissions.MANAGE_MESSAGES, channel)) {
      showToast("Cannot pin: Missing permissions", "error");
      return;
    }
  } catch {}

  try {
    const pinActions = findExport("pinMessage", "unpinMessage");
    if (message.pinned) pinActions?.unpinMessage?.(channel, message.id);
    else pinActions?.pinMessage?.(channel, message.id);
  } catch {}
}

function quoteMessage(channel: any, message: any) {
  if (!canReply(message)) {
    showToast("Cannot quote this message type", "error");
    return;
  }

  let content = message.content;
  if (getSetting("useSelectionForQuote", false)) {
    const selection = window.getSelection()?.toString().trim();
    if (selection && message.content?.includes(selection)) {
      content = selection;
    }
  }

  if (!content) return;

  const quoted = content
    .split("\n")
    .map((line: string) => `> ${line}`)
    .join("\n");

  insertTextIntoChatInput(`${quoted}\n`);

  if (getSetting("quoteWithReply", true)) {
    Dispatcher?.dispatch?.({
      type: "CREATE_PENDING_REPLY",
      channel,
      message,
      shouldMention: false,
      showMentionToggle: !channel.isDM?.()
    });
  }
}

function openMessageInTab(message: any, channel: any) {
  const guildId = channel.guild_id ?? "@me";
  window.open(`https://discord.com/channels/${guildId}/${channel.id}/${message.id}`, "_blank");
}

function openMessageThread(message: any, channel: any) {
  Dispatcher?.dispatch?.({
    type: "OPEN_THREAD_FLOW_MODAL",
    channelId: channel.id,
    messageId: message.id
  });
}

function startEditingMessage(channel: any, message: any) {
  if (messageActions?.startEditMessage) {
    messageActions.startEditMessage(channel.id, message.id, message.content);
    return;
  }

  Dispatcher?.dispatch?.({
    type: "MESSAGE_START_EDIT",
    channelId: channel.id,
    messageId: message.id,
    content: message.content
  });
}

async function executeAction(action: ClickAction, message: any, channel: any, event: MouseEvent) {
  ensureRuntimeModules();

  const currentUserId = getCurrentUserId();
  const isOwnMessage = message.author?.id === currentUserId;

  switch (action) {
    case "DELETE":
      if (!canDelete(message, channel)) return;
      if (message.deleted) {
        Dispatcher?.dispatch?.({ type: "MESSAGE_DELETE", channelId: channel.id, id: message.id, mlDeleted: true });
      } else {
        messageActions?.deleteMessage?.(channel.id, message.id);
      }
      break;
    case "COPY_LINK":
      copyMessageLink(message, channel);
      break;
    case "COPY_ID":
      copyWithToast(message.id, "Message ID copied!");
      break;
    case "COPY_CONTENT":
      copyWithToast(message.content || "", "Message content copied!");
      break;
    case "COPY_USER_ID":
      copyWithToast(message.author?.id || "", "User ID copied!");
      break;
    case "EDIT":
      if (!isOwnMessage || (message.state && message.state !== "SENT")) return;
      startEditingMessage(channel, message);
      break;
    case "REPLY":
      if (!canReply(message) || !canSend(channel)) return;
      Dispatcher?.dispatch?.({
        type: "CREATE_PENDING_REPLY",
        channel,
        message,
        shouldMention: !event.shiftKey,
        showMentionToggle: channel.guild_id !== null
      });
      break;
    case "EDIT_REPLY":
      if (isOwnMessage) {
        if (message.state !== "SENT") return;
        startEditingMessage(channel, message);
      } else {
        if (!canReply(message) || !canSend(channel)) return;
        Dispatcher?.dispatch?.({
          type: "CREATE_PENDING_REPLY",
          channel,
          message,
          shouldMention: true,
          showMentionToggle: channel.guild_id !== null
        });
      }
      break;
    case "QUOTE":
      quoteMessage(channel, message);
      break;
    case "PIN":
      togglePin(channel, message);
      break;
    case "REACT":
      await toggleReaction(channel.id, message.id, getSetting("reactEmoji", "💀"), channel, message);
      break;
    case "OPEN_THREAD":
      openMessageThread(message, channel);
      break;
    case "OPEN_TAB":
      openMessageInTab(message, channel);
      break;
    case "NONE":
      return;
  }

  event.preventDefault();
}

function shouldIgnoreTarget(target: HTMLElement | null): boolean {
  return !target || Boolean(target.closest(IGNORED_TARGET_SELECTORS));
}

function getReactFiber(node: Element) {
  for (const key in node) {
    if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
      return (node as any)[key];
    }
  }
  return null;
}

function getMessageRow(target: HTMLElement | null): HTMLElement | null {
  return target?.closest?.('[id^="chat-messages-"]') ?? null;
}

function extractMessageContext(value: any, visited = new Set<any>()): MessageContext | null {
  if (!value || typeof value !== "object" || visited.has(value)) return null;
  visited.add(value);

  const message = value.message;
  const channel =
    value.channel ?? (value.message?.channel_id ? ChannelStore?.getChannel?.(value.message.channel_id) : null);
  if (message?.id && channel?.id) return { message, channel };

  for (const child of Object.values(value)) {
    if (!child || typeof child !== "object") continue;
    const context = extractMessageContext(child, visited);
    if (context) return context;
  }

  return null;
}

function getMessageContextFromEvent(event: MouseEvent): MessageContext | null {
  let target = event.target as HTMLElement | null;
  if (target?.nodeType === Node.TEXT_NODE) target = target.parentElement as HTMLElement | null;

  const row = getMessageRow(target);
  if (!row) return null;

  let fiber = getReactFiber(row);
  while (fiber) {
    const context = extractMessageContext(fiber.memoizedProps);
    if (context) return context;
    fiber = fiber.return;
  }

  return null;
}

function getSingleClickAction(isOwnMessage: boolean): ClickAction {
  return (
    isOwnMessage ? getSetting("singleClickAction", "DELETE") : getSetting("singleClickOthersAction", "DELETE")
  ) as ClickAction;
}

function getDoubleClickAction(isOwnMessage: boolean): ClickAction {
  return (
    isOwnMessage ? getSetting("doubleClickAction", "EDIT") : getSetting("doubleClickOthersAction", "REPLY")
  ) as ClickAction;
}

function getSingleClickModifier(isOwnMessage: boolean): Modifier {
  return (
    isOwnMessage ? getSetting("singleClickModifier", "BACKSPACE") : getSetting("singleClickOthersModifier", "BACKSPACE")
  ) as Modifier;
}

function shouldHandleInChannel(channel: any): boolean {
  const isDM = channel.isDM?.() ?? false;
  const isSystemDM = channel.isSystemDM?.() ?? false;
  if (getSetting("disableInDms", false) && isDM) return false;
  if (getSetting("disableInSystemDms", true) && isSystemDM) return false;
  return true;
}

function scheduleSingleClick(
  action: ClickAction,
  modifier: Modifier,
  context: MessageContext,
  event: MouseEvent,
  timeoutMs: number
) {
  singleClickTimer = setTimeout(() => {
    singleClickTimer = null;
    if (isModifierActive(modifier) && action !== "NONE") {
      void executeAction(action, context.message, context.channel, event);
    }
  }, timeoutMs);
}

function clearSingleClickTimer() {
  if (!singleClickTimer) return;
  clearTimeout(singleClickTimer);
  singleClickTimer = null;
}

function handleResolvedMessageClick(event: MouseEvent, context: MessageContext) {
  if (event.button !== 0) return;

  let target = event.target as HTMLElement | null;
  if (target?.nodeType === Node.TEXT_NODE) target = target.parentElement as HTMLElement | null;
  if (shouldIgnoreTarget(target)) return;
  if (!shouldHandleInChannel(context.channel)) return;

  const holdThreshold = getSetting("selectionHoldTimeout", 300);
  if (Date.now() - lastMouseDownTime > holdThreshold) return;

  const isOwnMessage = context.message.author?.id === getCurrentUserId();
  const clickTimeout = getSetting("clickTimeout", 300);
  const singleAction = getSingleClickAction(isOwnMessage);
  const doubleAction = getDoubleClickAction(isOwnMessage);
  const tripleAction = getSetting("tripleClickAction", "REACT") as ClickAction;
  const singleModifier = getSingleClickModifier(isOwnMessage);
  const doubleModifier = getSetting("doubleClickModifier", "NONE") as Modifier;
  const tripleModifier = getSetting("tripleClickModifier", "NONE") as Modifier;
  const deferDoubleForTriple = getSetting("deferDoubleClickForTriple", true);

  if (event.detail === 3) {
    clearSingleClickTimer();
    if (deferDoubleForTriple && isModifierActive(tripleModifier) && tripleAction !== "NONE") {
      void executeAction(tripleAction, context.message, context.channel, event);
    }
    return;
  }

  if (event.detail === 2) {
    clearSingleClickTimer();
    if (doubleModifier !== "NONE" && !isModifierActive(doubleModifier)) return;
    if (doubleAction === "NONE" || !canSend(context.channel) || context.message.deleted) return;
    void executeAction(doubleAction, context.message, context.channel, event);
    return;
  }

  if (event.detail !== 1 || singleAction === "NONE") return;

  if (singleModifier === "NONE" && doubleAction !== "NONE") {
    scheduleSingleClick(singleAction, singleModifier, context, event, clickTimeout);
    return;
  }

  if (isModifierActive(singleModifier)) {
    void executeAction(singleAction, context.message, context.channel, event);
  }
}

export function onMessageClick(event: MouseEvent) {
  const context = getMessageContextFromEvent(event);
  if (!context) return;
  try {
    handleResolvedMessageClick(event, context);
  } catch {}
}

function installListeners() {
  if (installed) return;
  installed = true;

  document.addEventListener("mousedown", () => {
    lastMouseDownTime = Date.now();
  });
  document.addEventListener("keydown", (event) => setPressedKey(event, true));
  document.addEventListener("keyup", (event) => setPressedKey(event, false));
  window.addEventListener("blur", clearPressedKeys);
  document.addEventListener("click", onMessageClick, true);
}

ensureRuntimeModules();
installListeners();
