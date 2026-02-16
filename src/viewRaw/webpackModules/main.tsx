import React from "@moonlight-mod/wp/react";
import {
  ModalRoot,
  ModalHeader,
  ModalContent,
  ModalFooter,
  ModalCloseButton,
  Text,
  FormTitle,
  openModal,
  showToast,
  createToast
} from "@moonlight-mod/wp/discord/components/common/index";
import { Button, Looks, Colors } from "@moonlight-mod/wp/discord/uikit/legacy/Button";

import contextMenu from "@moonlight-mod/wp/contextMenu_contextMenu";

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

function copyWithToast(text: string, msg?: string) {
  copyToClipboard(text);
  try {
    showToast(createToast(msg ?? "Copied to clipboard!", 0));
  } catch {}
}

function sortObject<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).sort(([k1], [k2]) => k1.localeCompare(k2))) as T;
}

function cleanMessage(msg: any) {
  const clone = sortObject(JSON.parse(JSON.stringify(msg)));
  for (const key of ["email", "phone", "mfaEnabled", "personalConnectionId"]) {
    if (clone.author) delete clone.author[key];
  }
  delete clone.editHistory;
  delete clone.deleted;
  delete clone.firstEditTimestamp;
  clone.attachments?.forEach((a: any) => delete a.deleted);
  return clone;
}

function ViewRawModal({
  json,
  type,
  msgContent,
  onClose,
  transitionState
}: {
  json: string;
  type: string;
  msgContent?: string;
  onClose: () => void;
  transitionState: any;
}) {
  return React.createElement(
    ModalRoot,
    {
      transitionState,
      size: "large",
      "aria-label": `View Raw — ${type}`
    },
    React.createElement(
      ModalHeader,
      {
        separator: false,
        justify: "between"
      },
      React.createElement(
        Text,
        {
          variant: "heading-lg/semibold",
          color: "header-primary"
        },
        `View Raw — ${type}`
      ),
      React.createElement(ModalCloseButton, {
        onClick: onClose
      })
    ),
    React.createElement(
      ModalContent,
      {
        style: {
          padding: "16px 20px"
        }
      },
      msgContent &&
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            FormTitle,
            {
              tag: "h5",
              style: {
                marginBottom: "8px"
              }
            },
            "Content"
          ),
          React.createElement(
            "pre",
            {
              style: {
                background: "var(--background-secondary)",
                padding: "12px",
                borderRadius: "8px",
                fontFamily: "var(--font-code)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                marginBottom: "16px",
                border: "1px solid var(--background-modifier-accent)",
                overflow: "hidden"
              }
            },
            React.createElement(
              Text,
              {
                variant: "code",
                style: {
                  fontSize: "13px",
                  color: "#ffffff"
                }
              },
              msgContent
            )
          )
        ),
      React.createElement(
        FormTitle,
        {
          tag: "h5",
          style: {
            marginBottom: "8px"
          }
        },
        `${type} Data`
      ),
      React.createElement(
        "pre",
        {
          style: {
            background: "var(--background-secondary)",
            padding: "12px",
            borderRadius: "8px",
            fontFamily: "var(--font-code)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            border: "1px solid var(--background-modifier-accent)",
            overflow: "hidden"
          }
        },
        React.createElement(
          Text,
          {
            variant: "code",
            style: {
              fontSize: "13px",
              color: "#ffffff"
            }
          },
          json
        )
      )
    ),
    React.createElement(
      ModalFooter,
      null,
      React.createElement(
        Button,
        {
          onClick: () => copyWithToast(json, `${type} json data copied!`)
        },
        `Copy ${type} JSON`
      ),
      msgContent &&
        React.createElement(
          Button,
          {
            look: Looks.LINK,
            color: Colors.PRIMARY,
            onClick: () => copyWithToast(msgContent, "Content copied!")
          },
          "Copy Raw Content"
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

function openViewRawModal(json: string, type: string, msgContent?: string) {
  openModal((props: any) =>
    React.createElement(ViewRawModal, {
      ...props,
      json,
      type,
      msgContent
    })
  );
}

function openViewRawModalMessage(msg: any) {
  const clean = cleanMessage(msg);
  const msgJson = JSON.stringify(clean, null, 4);
  openViewRawModal(msgJson, "Message", msg.content);
}

contextMenu.addItem(
  "message",
  (props: any) => {
    const msg = props?.message;
    if (!msg) return null;
    return React.createElement(contextMenu.MenuItem, {
      id: "view-raw-message",
      label: "View Raw",
      action: () => openViewRawModalMessage(msg)
    });
  },
  /reply|copy-link|add-reaction|edit|pin|copy-id/
);

contextMenu.addItem(
  "guild-context",
  (props: any) => {
    const guild = props?.guild;
    if (!guild) return null;
    return React.createElement(contextMenu.MenuItem, {
      id: "view-raw-guild",
      label: "View Raw",
      action: () => openViewRawModal(JSON.stringify(guild, null, 4), "Guild")
    });
  },
  /copy-id|developer-actions|invite-people/
);

contextMenu.addItem(
  "channel-context",
  (props: any) => {
    const channel = props?.channel;
    if (!channel) return null;
    return React.createElement(contextMenu.MenuItem, {
      id: "view-raw-channel",
      label: "View Raw",
      action: () => openViewRawModal(JSON.stringify(channel, null, 4), "Channel")
    });
  },
  /copy-id|developer-actions|mute-channel/
);

contextMenu.addItem(
  "thread-context",
  (props: any) => {
    const channel = props?.channel;
    if (!channel) return null;
    return React.createElement(contextMenu.MenuItem, {
      id: "view-raw-channel",
      label: "View Raw",
      action: () => openViewRawModal(JSON.stringify(channel, null, 4), "Channel")
    });
  },
  /copy-id|developer-actions|mute-channel/
);

contextMenu.addItem(
  "user-context",
  (props: any) => {
    const user = props?.user;
    if (!user) return null;
    return React.createElement(contextMenu.MenuItem, {
      id: "view-raw-user",
      label: "View Raw",
      action: () => openViewRawModal(JSON.stringify(user, null, 4), "User")
    });
  },
  /copy-id|message|call/
);
