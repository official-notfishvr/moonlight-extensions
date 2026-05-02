import { AuthenticationStore, ChannelStore } from "@moonlight-mod/wp/common_stores";
import Messages from "@moonlight-mod/wp/componentEditor_messages";
import contextMenu from "@moonlight-mod/wp/contextMenu_contextMenu";
import { MessageFlags } from "@moonlight-mod/wp/discord/Constants";
import Dispatcher from "@moonlight-mod/wp/discord/Dispatcher";
import React from "@moonlight-mod/wp/react";
import { createMessageDiff, DiffPart } from "@moonlight-mod/wp/messageLogger_diffUtils";
import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

const EXT_ID = "messageLogger";
const ROW_ID_PREFIX = "chat-messages-";
const EMPTY_EDITS: EditEntry[] = [];
const EMPTY_STATE = { deleted: null as DeletedEntry | null, edits: EMPTY_EDITS };
const ChannelMessages = spacepack.require("discord/lib/ChannelMessages").default;

type EditEntry = {
  timestamp: Date;
  content: string;
  original: boolean;
};

type DeletedEntry = {
  timestamp: Date;
};

const deletedMessages = new Map<string, DeletedEntry>();
const messageEdits = new Map<string, EditEntry[]>();
const listeners = new Set<() => void>();

function getSetting<T>(name: string, fallback: T): T {
  const value = moonlight.getConfigOption<T>(EXT_ID, name);
  return value !== undefined ? value : fallback;
}

function getMessageKey(channelId?: string, messageId?: string): string | null {
  if (!channelId || !messageId) return null;
  return `${channelId}:${messageId}`;
}

function getTrackedDeleted(channelId?: string, messageId?: string): DeletedEntry | null {
  const key = getMessageKey(channelId, messageId);
  return key ? (deletedMessages.get(key) ?? null) : null;
}

function getTrackedEdits(channelId?: string, messageId?: string): EditEntry[] {
  const key = getMessageKey(channelId, messageId);
  return key ? (messageEdits.get(key) ?? EMPTY_EDITS) : EMPTY_EDITS;
}

function emitChange() {
  syncDeletedRowClasses();
  for (const listener of listeners) {
    try {
      listener();
    } catch {}
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useTrackedMessageState(channelId?: string, messageId?: string) {
  const deleted = React.useSyncExternalStore(
    subscribe,
    () => getTrackedDeleted(channelId, messageId),
    () => null
  );
  const edits = React.useSyncExternalStore(
    subscribe,
    () => getTrackedEdits(channelId, messageId),
    () => EMPTY_EDITS
  );

  return React.useMemo(() => {
    if (!deleted && edits === EMPTY_EDITS) return EMPTY_STATE;
    return { deleted, edits };
  }, [deleted, edits]);
}

function parseRowMessageKey(rowId: string): string | null {
  if (!rowId.startsWith(ROW_ID_PREFIX)) return null;

  const rest = rowId.slice(ROW_ID_PREFIX.length);
  const lastDashIndex = rest.lastIndexOf("-");
  if (lastDashIndex === -1) return null;

  return getMessageKey(rest.slice(0, lastDashIndex), rest.slice(lastDashIndex + 1));
}

function syncDeletedRowClasses() {
  const rows = document.querySelectorAll<HTMLElement>(`[id^="${ROW_ID_PREFIX}"]`);
  for (const row of rows) {
    const key = parseRowMessageKey(row.id);
    row.classList.toggle("messagelogger-deleted", key != null && deletedMessages.has(key));
  }
}

let observerInstalled = false;

function installDeletedRowObserver() {
  if (observerInstalled) return;
  observerInstalled = true;

  const sync = () => {
    try {
      syncDeletedRowClasses();
    } catch {}
  };

  sync();
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  setInterval(sync, 1000);
}

function formatTimestamp(value: Date | string | number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function getIgnoredIds(setting: string): string[] {
  return getSetting<string>(setting, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function shouldIgnore(message: any, isEdit = false): boolean {
  try {
    const currentUserId = AuthenticationStore?.getId?.() ?? "";
    const channel = ChannelStore?.getChannel?.(message.channel_id);
    const ignoredUsers = getIgnoredIds("ignoreUsers");
    const ignoredChannels = getIgnoredIds("ignoreChannels");
    const ignoredGuilds = getIgnoredIds("ignoreGuilds");

    if (!isEdit && !getSetting("logDeletes", true)) return true;
    if (isEdit && !getSetting("logEdits", true)) return true;
    if (getSetting("ignoreBots", false) && message.author?.bot) return true;
    if (getSetting("ignoreSelf", false) && message.author?.id === currentUserId) return true;
    if (ignoredUsers.includes(message.author?.id)) return true;
    if (ignoredChannels.includes(message.channel_id)) return true;
    if (channel && ignoredChannels.includes(channel.parent_id)) return true;
    if (channel && ignoredGuilds.includes(channel.guild_id)) return true;

    return false;
  } catch {
    return false;
  }
}

function getChannelMessageStore(channelId: string) {
  return (ChannelMessages as any)?._channelMessages?.[channelId] ?? null;
}

function getStoredMessage(channelId: string, messageId: string) {
  try {
    return getChannelMessageStore(channelId)?.get?.(messageId) ?? null;
  } catch {
    return null;
  }
}

function isTrackableMessage(message: any): boolean {
  if (!message) return false;
  if (shouldIgnore(message)) return false;
  if ((message.flags & MessageFlags.EPHEMERAL) === MessageFlags.EPHEMERAL) return false;
  if (message.state === "SEND_FAILED") return false;
  return true;
}

function markMessageDeleted(channelId: string, messageId: string, message: any) {
  const key = getMessageKey(channelId, messageId);
  if (!key) return;

  deletedMessages.set(key, { timestamp: new Date() });

  if (Array.isArray(message?.attachments)) {
    for (const attachment of message.attachments) attachment.deleted = true;
  }

  try {
    message.deleted = true;
    message.deleted_timestamp = new Date();
  } catch {}

  emitChange();
}

function recordMessageEdit(message: any, oldMessage: any) {
  const key = getMessageKey(message?.channel_id, message?.id);
  if (!key) return;

  const edits = messageEdits.get(key) ?? [];
  edits.push({
    timestamp: new Date(message.edited_timestamp),
    content: oldMessage.content,
    original: oldMessage.editedTimestamp == null
  });
  messageEdits.set(key, edits);
  emitChange();
}

function clearTrackedMessage(channelId: string, messageId: string) {
  const key = getMessageKey(channelId, messageId);
  if (!key) return;
  deletedMessages.delete(key);
  messageEdits.delete(key);
  emitChange();
}

function handleDelete(event: any): boolean {
  if (event?._messageLogger_force) {
    clearTrackedMessage(event.channelId, event.id);
    return false;
  }

  const message = getStoredMessage(event.channelId, event.id);
  if (!isTrackableMessage(message)) return false;

  markMessageDeleted(event.channelId, event.id, message);
  return true;
}

function handleBulkDelete(event: any): boolean {
  let blocked = false;

  for (const id of Array.isArray(event.ids) ? event.ids : []) {
    const message = getStoredMessage(event.channelId, id);
    if (!isTrackableMessage(message)) continue;

    markMessageDeleted(event.channelId, id, message);
    blocked = true;
  }

  return blocked;
}

function handleMessageUpdate(event: any) {
  const message = event?.message;
  if (!message || event?._messageLogger_internal || shouldIgnore(message, true)) return false;

  const oldMessage = getStoredMessage(message.channel_id, message.id);
  if (!oldMessage) return false;
  if (!message.edited_timestamp || oldMessage.content === message.content) return false;

  recordMessageEdit(message, oldMessage);
  return false;
}

function renderDiffPart(part: DiffPart, key: React.Key) {
  const className =
    part.type === "added"
      ? "messagelogger-diff-added"
      : part.type === "removed"
        ? "messagelogger-diff-removed"
        : undefined;

  return React.createElement("span", { key, className }, part.text);
}

function renderDiff(current: string, previous?: string) {
  if (!previous || !getSetting("showEditDiffs", true)) {
    return React.createElement("span", null, current);
  }

  return React.createElement(
    "span",
    null,
    ...createMessageDiff(previous, current).map((part, index) => renderDiffPart(part, index))
  );
}

function renderDeletedMeta(deleted: DeletedEntry) {
  return React.createElement(
    "div",
    { key: "deleted", className: "messagelogger-meta" },
    React.createElement("span", null, "Deleted at ", formatTimestamp(deleted.timestamp))
  );
}

function renderEditHistory(message: any, edits: EditEntry[]) {
  if (!getSetting("inlineEdits", true) || edits.length === 0) return null;

  const entries = edits.map((edit, index) => {
    const nextContent = index === edits.length - 1 ? message.content : edits[index + 1]?.content;
    return React.createElement(
      "div",
      { key: `edit-${index}`, className: "messagelogger-edited" },
      renderDiff(edit.content, nextContent),
      " ",
      React.createElement(
        "span",
        {
          className: "messagelogger-history-timestamp",
          title: formatTimestamp(edit.timestamp)
        },
        edit.original ? "(original " : "(past edit ",
        formatTimestamp(edit.timestamp),
        ")"
      )
    );
  });

  return React.createElement("div", { key: "edits", className: "messagelogger-diff-view" }, ...entries);
}

function MessageLoggerAccessory(props: any) {
  const message = props.message;
  const state = useTrackedMessageState(message?.channel_id, message?.id);
  if (!state.deleted && state.edits.length === 0) return null;

  const children: React.ReactNode[] = [];
  if (state.deleted) children.push(renderDeletedMeta(state.deleted));

  const editHistory = renderEditHistory(message, state.edits);
  if (editHistory) children.push(editHistory);

  return React.createElement("div", { className: "messagelogger-accessory" }, ...children);
}

export function openHistoryModal(message: any): void {
  const edits = getTrackedEdits(message?.channel_id, message?.id);
  if (edits.length === 0) {
    console.log("[MessageLogger] No edit history available for this message.");
    return;
  }

  let output = `[MessageLogger] Edit History for message ${message.id}:\n`;
  edits.forEach((edit, index) => {
    output += `  Version ${index + 1} at ${formatTimestamp(edit.timestamp)}: ${edit.content}\n`;
  });
  output += `  Current: ${message.content}`;
  console.log(output);
}

function removeDeletedMessage(message: any) {
  Dispatcher?.dispatch?.({
    type: "MESSAGE_DELETE",
    channelId: message.channel_id,
    id: message.id,
    _messageLogger_force: true
  });
}

function clearEditHistory(channelId?: string, messageId?: string) {
  const key = getMessageKey(channelId, messageId);
  if (!key) return;
  messageEdits.delete(key);
  emitChange();
}

export function getMessageContextMenuItems(props: { message: any }): React.ReactElement[] | null {
  const message = props.message;
  const deleted = getTrackedDeleted(message?.channel_id, message?.id);
  const edits = getTrackedEdits(message?.channel_id, message?.id);

  if (!deleted && edits.length === 0) return null;

  const items: React.ReactElement[] = [];

  if (deleted) {
    items.push(
      React.createElement(contextMenu.MenuItem, {
        id: "ml-remove-message",
        key: "ml-remove-message",
        label: "Remove Deleted Message",
        color: "danger",
        action: () => removeDeletedMessage(message)
      })
    );
  }

  if (edits.length > 0) {
    items.push(
      React.createElement(contextMenu.MenuItem, {
        id: "ml-view-history",
        key: "ml-view-history",
        label: `View Edit History (${edits.length})`,
        action: () => openHistoryModal(message)
      }),
      React.createElement(contextMenu.MenuItem, {
        id: "ml-clear-edits",
        key: "ml-clear-edits",
        label: "Clear Edit History",
        color: "danger",
        action: () => clearEditHistory(message?.channel_id, message?.id)
      })
    );
  }

  return items;
}

export const DELETED_MESSAGE_COUNT = () => ({
  ast: [
    [
      6,
      "count",
      {
        "=0": ["No deleted messages"],
        one: [[1, "count"], " deleted message"],
        other: [[1, "count"], " deleted messages"]
      },
      0,
      "cardinal"
    ]
  ]
});

let installed = false;

function installDispatcherInterceptor() {
  Dispatcher.addInterceptor((event: any) => {
    switch (event?.type) {
      case "MESSAGE_DELETE":
        return handleDelete(event);
      case "MESSAGE_DELETE_BULK":
        return handleBulkDelete(event);
      case "MESSAGE_UPDATE":
        return handleMessageUpdate(event);
      default:
        return false;
    }
  });
}

function installContextMenu() {
  contextMenu.addItem(
    "message",
    (props: any) => {
      const items = getMessageContextMenuItems(props);
      if (!items?.length) return null;
      return React.createElement(contextMenu.MenuGroup, { key: "ml-group" }, ...items);
    },
    "copy-id"
  );
}

function install() {
  if (installed) return;
  installed = true;

  installDispatcherInterceptor();
  Messages.addAccessory("messageLoggerAccessory", MessageLoggerAccessory);
  installContextMenu();
  installDeletedRowObserver();
  document.body.dataset.mlDeleteStyle = getSetting("deleteStyle", "text");
}

install();
