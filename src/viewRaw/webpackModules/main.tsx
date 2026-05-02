import React from "@moonlight-mod/wp/react";
import {
  ModalRoot,
  ModalHeader,
  ModalContent,
  ModalFooter,
  ModalCloseButton
} from "@moonlight-mod/wp/discord/design/components/Modal/web/LegacyModal";
import { openModal } from "@moonlight-mod/wp/discord/modules/modals/Modals";
import { showToast } from "@moonlight-mod/wp/discord/design/components/Toast/web/ToastAPI";
import { createToast } from "@moonlight-mod/wp/discord/design/components/Toast/web/Toast";
import { ToastType } from "@moonlight-mod/wp/discord/design/components/Toast/web/ToastConstants";
import { Button, Looks, Colors } from "@moonlight-mod/wp/discord/uikit/legacy/Button";
import ClipboardUtils from "@moonlight-mod/wp/discord/utils/ClipboardUtils";
import contextMenu from "@moonlight-mod/wp/contextMenu_contextMenu";

const panelStyle: React.CSSProperties = {
  background: "var(--background-tertiary)",
  border: "1px solid color-mix(in srgb, var(--brand-experiment) 16%, var(--background-modifier-accent))",
  borderRadius: "10px",
  overflow: "hidden"
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "10px 12px",
  borderBottom: "1px solid var(--background-modifier-accent)",
  background: "linear-gradient(180deg, color-mix(in srgb, var(--brand-experiment) 12%, transparent), transparent)"
};

const panelTitleStyle: React.CSSProperties = {
  color: "var(--header-primary)",
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.02em",
  textTransform: "uppercase"
};

const panelMetaStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "11px"
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: "14px 16px",
  maxHeight: "42vh",
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "var(--font-code)",
  fontSize: "12px",
  lineHeight: 1.5,
  color: "#f2f5f7",
  background: "linear-gradient(180deg, rgba(88, 101, 242, 0.12), transparent 36px), rgb(20, 22, 27)"
};

const codeTextStyle: React.CSSProperties = {
  color: "#f2f5f7",
  fontFamily: "var(--font-code)",
  fontSize: "12px",
  lineHeight: 1.5
};

function copyToClipboard(text: string) {
  ClipboardUtils.copy(text);
}

function copyWithToast(text: string, message = "Copied to clipboard!") {
  copyToClipboard(text);
  try {
    showToast(createToast(message, ToastType.SUCCESS));
  } catch {}
}

function sortObject<T extends object>(object: T): T {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b))) as T;
}

function cleanMessage(message: any) {
  const clone = sortObject(JSON.parse(JSON.stringify(message)));

  for (const key of ["email", "phone", "mfaEnabled", "personalConnectionId"]) {
    if (clone.author) delete clone.author[key];
  }

  delete clone.editHistory;
  delete clone.deleted;
  delete clone.firstEditTimestamp;
  clone.attachments?.forEach((attachment: any) => delete attachment.deleted);
  return clone;
}

function getLineCount(text: string) {
  return text ? text.split("\n").length : 0;
}

function InspectorPanel({ title, subtitle, body }: { title: string; subtitle: string; body: string }) {
  return React.createElement(
    "section",
    { style: panelStyle },
    React.createElement(
      "div",
      { style: panelHeaderStyle },
      React.createElement("div", { style: panelTitleStyle }, title),
      React.createElement("div", { style: panelMetaStyle }, subtitle)
    ),
    React.createElement("pre", { style: codeBlockStyle }, React.createElement("code", { style: codeTextStyle }, body))
  );
}

function ViewRawModal({
  json,
  type,
  rawContent,
  onClose,
  transitionState
}: {
  json: string;
  type: string;
  rawContent?: string;
  onClose: () => void;
  transitionState: any;
}) {
  const title = `View Raw ${type}`;
  const jsonLabel = `${getLineCount(json)} lines`;
  const contentLabel = rawContent ? `${rawContent.length} chars` : "";

  return React.createElement(
    ModalRoot,
    {
      transitionState,
      size: "large",
      "aria-label": title
    },
    React.createElement(
      ModalHeader,
      {
        separator: false,
        justify: "between"
      },
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "4px"
          }
        },
        React.createElement(
          "div",
          {
            style: {
              color: "var(--header-primary)",
              fontSize: "20px",
              fontWeight: 700,
              lineHeight: 1.1
            }
          },
          title
        ),
        React.createElement(
          "div",
          {
            style: {
              color: "var(--text-muted)",
              fontSize: "12px"
            }
          },
          "Structured inspector view with copy-ready raw data"
        )
      ),
      React.createElement(ModalCloseButton, { onClick: onClose })
    ),
    React.createElement(
      ModalContent,
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          padding: "16px 20px 20px"
        }
      },
      rawContent
        ? React.createElement(InspectorPanel, {
            title: "Content",
            subtitle: contentLabel,
            body: rawContent
          })
        : null,
      React.createElement(InspectorPanel, {
        title: `${type} JSON`,
        subtitle: jsonLabel,
        body: json
      })
    ),
    React.createElement(
      ModalFooter,
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          gap: "8px"
        }
      },
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "8px"
          }
        },
        React.createElement(
          Button,
          {
            onClick: () => copyWithToast(json, `${type} JSON copied!`)
          },
          `Copy ${type} JSON`
        ),
        rawContent
          ? React.createElement(
              Button,
              {
                look: Looks.OUTLINED,
                color: Colors.PRIMARY,
                onClick: () => copyWithToast(rawContent, "Content copied!")
              },
              "Copy Content"
            )
          : null
      ),
      React.createElement(
        Button,
        {
          onClick: onClose,
          look: Looks.LINK,
          color: Colors.PRIMARY
        },
        "Close"
      )
    )
  );
}

function openViewRawModal(json: string, type: string, rawContent?: string) {
  openModal((props: any) =>
    React.createElement(ViewRawModal, {
      ...props,
      json,
      type,
      rawContent
    })
  );
}

function openMessageInspector(message: any) {
  openViewRawModal(JSON.stringify(cleanMessage(message), null, 4), "Message", message.content);
}

function createContextMenuItem(id: string, action: () => void) {
  return React.createElement(contextMenu.MenuItem, {
    id,
    label: "View Raw",
    action
  });
}

contextMenu.addItem(
  "message",
  (props: any) =>
    props?.message ? createContextMenuItem("view-raw-message", () => openMessageInspector(props.message)) : null,
  /reply|copy-link|add-reaction|edit|pin|copy-id/
);

contextMenu.addItem(
  "guild-context",
  (props: any) =>
    props?.guild
      ? createContextMenuItem("view-raw-guild", () => openViewRawModal(JSON.stringify(props.guild, null, 4), "Guild"))
      : null,
  /copy-id|developer-actions|invite-people/
);

contextMenu.addItem(
  "channel-context",
  (props: any) =>
    props?.channel
      ? createContextMenuItem("view-raw-channel", () =>
          openViewRawModal(JSON.stringify(props.channel, null, 4), "Channel")
        )
      : null,
  /copy-id|developer-actions|mute-channel/
);

contextMenu.addItem(
  "thread-context",
  (props: any) =>
    props?.channel
      ? createContextMenuItem("view-raw-thread", () =>
          openViewRawModal(JSON.stringify(props.channel, null, 4), "Channel")
        )
      : null,
  /copy-id|developer-actions|mute-channel/
);

contextMenu.addItem(
  "user-context",
  (props: any) =>
    props?.user
      ? createContextMenuItem("view-raw-user", () => openViewRawModal(JSON.stringify(props.user, null, 4), "User"))
      : null,
  /copy-id|message|call/
);
