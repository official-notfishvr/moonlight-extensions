import { AuthenticationStore, ChannelStore } from "@moonlight-mod/wp/common_stores";
import Messages from "@moonlight-mod/wp/componentEditor_messages";
import contextMenu from "@moonlight-mod/wp/contextMenu_contextMenu";
import { MessageFlags } from "@moonlight-mod/wp/discord/Constants";
import Dispatcher from "@moonlight-mod/wp/discord/Dispatcher";
import React from "@moonlight-mod/wp/react";
import { createMessageDiff, DiffPart } from "@moonlight-mod/wp/messageLogger_diffUtils";
import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

const EXT_ID = "messageLogger";

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
const ChannelMessages = spacepack.require("discord/lib/ChannelMessages").default;
const EMPTY_EDITS: EditEntry[] = [];
const EMPTY_MESSAGE_STATE = {
  deleted: null as DeletedEntry | null,
  edits: EMPTY_EDITS
};

function getSetting<T>(name: string, fallback: T): T {
  const val = moonlight.getConfigOption<T>(EXT_ID, name);
  return val !== undefined ? val : fallback;
}

function getKey(channelId: string | undefined, messageId: string | undefined): string | null {
  if (!channelId || !messageId) return null;
  return `${channelId}:${messageId}`;
}

function parseRowKey(id: string): string | null {
  const prefix = "chat-messages-";
  if (!id.startsWith(prefix)) return null;

  const rest = id.slice(prefix.length);
  const lastDash = rest.lastIndexOf("-");
  if (lastDash === -1) return null;

  const channelId = rest.slice(0, lastDash);
  const messageId = rest.slice(lastDash + 1);
  return getKey(channelId, messageId);
}

function notify() {
  syncDeletedMessageClasses();
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

function useMessageState(channelId: string | undefined, messageId: string | undefined) {
  const key = getKey(channelId, messageId);

  const deleted = React.useSyncExternalStore(
    subscribe,
    () => (key ? (deletedMessages.get(key) ?? null) : null),
    () => null
  );

  const edits = React.useSyncExternalStore(
    subscribe,
    () => (key ? (messageEdits.get(key) ?? EMPTY_EDITS) : EMPTY_EDITS),
    () => EMPTY_EDITS
  );

  return React.useMemo(() => {
    if (!deleted && edits === EMPTY_EDITS) return EMPTY_MESSAGE_STATE;
    return { deleted, edits };
  }, [deleted, edits]);
}

function syncDeletedMessageClasses() {
  const rows = document.querySelectorAll<HTMLElement>('[id^="chat-messages-"]');
  for (const row of rows) {
    const key = parseRowKey(row.id);
    const isDeleted = key != null && deletedMessages.has(key);
    row.classList.toggle("messagelogger-deleted", isDeleted);
  }
}

let observerInstalled = false;

function installObserver() {
  if (observerInstalled) return;
  observerInstalled = true;

  const run = () => {
    try {
      syncDeletedMessageClasses();
    } catch {}
  };

  run();

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(run, 1000);
}

function formatTimestamp(ts: Date | string | number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return String(ts);
  return date.toLocaleString();
}

export function shouldIgnore(message: any, isEdit = false): boolean {
  try {
    const ignoreBots = getSetting<boolean>("ignoreBots", false);
    const ignoreSelf = getSetting<boolean>("ignoreSelf", false);
    const ignoreUsers = getSetting<string>("ignoreUsers", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ignoreChannels = getSetting<string>("ignoreChannels", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ignoreGuilds = getSetting<string>("ignoreGuilds", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const currentUserId = AuthenticationStore?.getId?.() ?? "";

    if (ignoreBots && message.author?.bot) return true;
    if (ignoreSelf && message.author?.id === currentUserId) return true;
    if (ignoreUsers.includes(message.author?.id)) return true;
    if (ignoreChannels.includes(message.channel_id)) return true;

    const channel = ChannelStore?.getChannel?.(message.channel_id);
    if (channel) {
      if (ignoreChannels.includes(channel.parent_id)) return true;
      if (ignoreGuilds.includes(channel.guild_id)) return true;
    }

    if (isEdit && !getSetting<boolean>("logEdits", true)) return true;
    if (!isEdit && !getSetting<boolean>("logDeletes", true)) return true;

    return false;
  } catch {
    return false;
  }
}

function getChannelMessages(channelId: string): any {
  return (ChannelMessages as any)?._channelMessages?.[channelId] ?? null;
}

function getStoredMessage(channelId: string, messageId: string): any {
  try {
    return getChannelMessages(channelId)?.get?.(messageId) ?? null;
  } catch {
    return null;
  }
}

function markDeleted(channelId: string, messageId: string, message: any) {
  const key = getKey(channelId, messageId);
  if (!key) return;

  deletedMessages.set(key, {
    timestamp: new Date()
  });

  if (Array.isArray(message?.attachments)) {
    for (const attachment of message.attachments) {
      attachment.deleted = true;
    }
  }

  try {
    message.deleted = true;
    message.deleted_timestamp = new Date();
  } catch {}
  notify();
}

function recordEdit(message: any, oldMessage: any) {
  const key = getKey(message?.channel_id, message?.id);
  if (!key) return;

  const edits = messageEdits.get(key) ?? [];
  edits.push({
    timestamp: new Date(message.edited_timestamp),
    content: oldMessage.content,
    original: oldMessage.editedTimestamp == null
  });
  messageEdits.set(key, edits);
  notify();
}

function removeTrackedMessage(channelId: string, messageId: string) {
  const key = getKey(channelId, messageId);
  if (!key) return;
  deletedMessages.delete(key);
  messageEdits.delete(key);
  notify();
}

function handleDeleteEvent(event: any): boolean {
  if (event?._messageLogger_force) {
    removeTrackedMessage(event.channelId, event.id);
    return false;
  }

  const message = getStoredMessage(event.channelId, event.id);
  if (!message || shouldIgnore(message)) return false;
  if ((message.flags & MessageFlags.EPHEMERAL) === MessageFlags.EPHEMERAL) return false;
  if (message.state === "SEND_FAILED") return false;

  markDeleted(event.channelId, event.id, message);
  return true;
}

function handleBulkDeleteEvent(event: any): boolean {
  const ids = Array.isArray(event.ids) ? event.ids : [];
  let blocked = false;

  for (const id of ids) {
    const message = getStoredMessage(event.channelId, id);
    if (!message || shouldIgnore(message)) continue;
    if ((message.flags & MessageFlags.EPHEMERAL) === MessageFlags.EPHEMERAL) continue;
    if (message.state === "SEND_FAILED") continue;

    markDeleted(event.channelId, id, message);
    blocked = true;
  }

  return blocked;
}

function handleMessageUpdateEvent(event: any) {
  const message = event?.message;
  if (!message || event?._messageLogger_internal) return false;
  if (shouldIgnore(message, true)) return false;

  const oldMessage = getStoredMessage(message.channel_id, message.id);
  if (!oldMessage) return false;
  if (!message.edited_timestamp || oldMessage.content === message.content) return false;

  recordEdit(message, oldMessage);
  return false;
}

function createDiffElement(part: DiffPart, key: React.Key): React.ReactElement {
  let className: string | undefined;
  if (part.type === "added") className = "messagelogger-diff-added";
  else if (part.type === "removed") className = "messagelogger-diff-removed";
  return React.createElement("span", { key, className }, part.text);
}

function renderDiff(content: string, previousContent?: string) {
  if (!previousContent || !getSetting<boolean>("showEditDiffs", true)) {
    return React.createElement("span", null, content);
  }

  const diff = createMessageDiff(previousContent, content);
  return React.createElement("span", null, ...diff.map((part, index) => createDiffElement(part, index)));
}

function DeletedBadge(props: any) {
  const state = useMessageState(props.message?.channel_id, props.message?.id);
  if (!state.deleted) return null;

  return React.createElement(
    "span",
    {
      className: "messagelogger-badge"
    },
    "Deleted"
  );
}

function MessageLoggerAccessory(props: any) {
  const message = props.message;
  const state = useMessageState(message?.channel_id, message?.id);
  if (!state.deleted && state.edits.length === 0) return null;

  const children: React.ReactNode[] = [];

  if (state.deleted) {
    children.push(
      React.createElement(
        "div",
        {
          key: "deleted",
          className: "messagelogger-meta"
        },
        React.createElement("span", null, "Deleted at ", formatTimestamp(state.deleted.timestamp))
      )
    );
  }

  if (getSetting<boolean>("inlineEdits", true) && state.edits.length > 0) {
    const entries = state.edits.map((edit, index) => {
      const nextContent = index === state.edits.length - 1 ? message.content : state.edits[index + 1]?.content;
      return React.createElement(
        "div",
        {
          key: "edit-" + index,
          className: "messagelogger-edited"
        },
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

    children.push(
      React.createElement(
        "div",
        {
          key: "edits",
          className: "messagelogger-diff-view"
        },
        ...entries
      )
    );
  }

  return React.createElement(
    "div",
    {
      className: "messagelogger-accessory"
    },
    ...children
  );
}

export function openHistoryModal(message: any): void {
  const key = getKey(message?.channel_id, message?.id);
  const edits = key ? (messageEdits.get(key) ?? []) : [];
  if (edits.length === 0) {
    console.log("[MessageLogger] No edit history available for this message.");
    return;
  }

  let logOutput = "[MessageLogger] Edit History for message " + message.id + ":\n";
  edits.forEach((edit, idx) => {
    logOutput += "  Version " + (idx + 1) + " at " + formatTimestamp(edit.timestamp) + ": " + edit.content + "\n";
  });
  logOutput += "  Current: " + message.content;
  console.log(logOutput);
}

export function getMessageContextMenuItems(props: { message: any }): React.ReactElement[] | null {
  const message = props.message;
  const key = getKey(message?.channel_id, message?.id);
  if (!key) return null;

  const deleted = deletedMessages.has(key);
  const edits = messageEdits.get(key) ?? [];
  if (!deleted && edits.length === 0) return null;

  const items: React.ReactElement[] = [];

  if (deleted) {
    items.push(
      React.createElement(contextMenu.MenuItem, {
        id: "ml-remove-message",
        key: "ml-remove-message",
        label: "Remove Deleted Message",
        color: "danger",
        action: () => {
          Dispatcher?.dispatch?.({
            type: "MESSAGE_DELETE",
            channelId: message.channel_id,
            id: message.id,
            _messageLogger_force: true
          });
        }
      })
    );
  }

  if (edits.length > 0) {
    items.push(
      React.createElement(contextMenu.MenuItem, {
        id: "ml-view-history",
        key: "ml-view-history",
        label: "View Edit History (" + edits.length + ")",
        action: () => openHistoryModal(message)
      })
    );
    items.push(
      React.createElement(contextMenu.MenuItem, {
        id: "ml-clear-edits",
        key: "ml-clear-edits",
        label: "Clear Edit History",
        color: "danger",
        action: () => {
          messageEdits.delete(key);
          notify();
        }
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

function install() {
  if (installed) return;
  installed = true;

  Dispatcher.addInterceptor((event: any) => {
    switch (event?.type) {
      case "MESSAGE_DELETE":
        return handleDeleteEvent(event);
      case "MESSAGE_DELETE_BULK":
        return handleBulkDeleteEvent(event);
      case "MESSAGE_UPDATE":
        return handleMessageUpdateEvent(event);
      default:
        return false;
    }
  });

  Messages.addBadge("messageLoggerDeletedBadge", DeletedBadge, "silent", true);
  Messages.addAccessory("messageLoggerAccessory", MessageLoggerAccessory);

  contextMenu.addItem(
    "message",
    (props: any) => {
      const items = getMessageContextMenuItems(props);
      if (!items || items.length === 0) return null;
      return React.createElement(contextMenu.MenuGroup, { key: "ml-group" }, ...items);
    },
    "copy-id"
  );

  installObserver();
  document.body.dataset.mlDeleteStyle = getSetting("deleteStyle", "text");
}

install();
