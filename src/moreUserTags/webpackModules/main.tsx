import { ChannelStore, GuildStore, PermissionStore } from "@moonlight-mod/wp/common_stores";
import { Permissions } from "@moonlight-mod/wp/discord/Constants";
import SelectedChannelStore from "@moonlight-mod/wp/discord/stores/SelectedChannelStore";

const EXT_ID = "moreUserTags";
const TAG_CLASS = "mut-tag";

function getSetting<T>(name: string, fallback: T): T {
  const val = moonlight.getConfigOption<T>(EXT_ID, name);
  return val !== undefined ? val : fallback;
}

const PermissionBits = {
  ADMINISTRATOR: Permissions.ADMINISTRATOR,
  MANAGE_GUILD: Permissions.MANAGE_GUILD,
  MANAGE_CHANNELS: Permissions.MANAGE_CHANNELS,
  MANAGE_ROLES: Permissions.MANAGE_ROLES,
  MANAGE_MESSAGES: Permissions.MANAGE_MESSAGES,
  KICK_MEMBERS: Permissions.KICK_MEMBERS,
  BAN_MEMBERS: Permissions.BAN_MEMBERS,
  MOVE_MEMBERS: Permissions.MOVE_MEMBERS,
  MUTE_MEMBERS: Permissions.MUTE_MEMBERS,
  DEAFEN_MEMBERS: Permissions.DEAFEN_MEMBERS,
  MODERATE_MEMBERS: Permissions.MODERATE_MEMBERS
} as const;

type PermissionName = keyof typeof PermissionBits;

const ALL_PERMS: PermissionName[] = [
  "ADMINISTRATOR",
  "MANAGE_GUILD",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_MESSAGES",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "MOVE_MEMBERS",
  "MUTE_MEMBERS",
  "DEAFEN_MEMBERS",
  "MODERATE_MEMBERS"
];

const tags: Array<{
  name: string;
  displayName: string;
  condition?: (u: any, c: any) => boolean;
  permissions?: PermissionName[];
}> = [
  {
    name: "OWNER",
    displayName: "Owner",
    condition: (u: any, c: any) => GuildStore?.getGuild?.(c?.guild_id)?.ownerId === u?.id
  },
  {
    name: "ADMINISTRATOR",
    displayName: "Admin",
    permissions: ["ADMINISTRATOR"]
  },
  {
    name: "MODERATOR_STAFF",
    displayName: "Staff",
    permissions: ["MANAGE_GUILD", "MANAGE_CHANNELS", "MANAGE_ROLES"]
  },
  {
    name: "MODERATOR",
    displayName: "Mod",
    permissions: ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS"]
  },
  {
    name: "VOICE_MODERATOR",
    displayName: "VC Mod",
    permissions: ["MOVE_MEMBERS", "MUTE_MEMBERS", "DEAFEN_MEMBERS"]
  },
  {
    name: "CHAT_MODERATOR",
    displayName: "Chat Mod",
    permissions: ["MODERATE_MEMBERS"]
  }
];

function getPermissions(user: any, channel: any): PermissionName[] {
  const guildId = channel?.guild_id;
  const guild = GuildStore.getGuild?.(guildId);
  if (!guild) return [];
  if (guild.ownerId === user?.id) return ALL_PERMS;

  const result: PermissionName[] = [];
  for (const perm of ALL_PERMS) {
    try {
      if (PermissionStore.can?.(PermissionBits[perm], channel, user)) {
        result.push(perm);
      }
    } catch {}
  }

  return result;
}

function processMemberList() {
  const channelId = SelectedChannelStore?.getChannelId?.();
  const channel = ChannelStore?.getChannel?.(channelId);
  if (!channel?.guild_id) return;

  const items = document.querySelectorAll('[class*="member_"]');
  for (const item of items) {
    if (item.querySelector('[class*="groupTitle_"]')) continue;

    const target = item.querySelector('[class*="nameAndDecorators"]') || item.querySelector('[class*="name_"]') || item;
    const fiberKey = Object.keys(item).find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
    );

    let fiber = fiberKey ? (item as any)[fiberKey] : null;
    let user = null;
    let depth = 0;
    while (fiber && !user && depth < 30) {
      user = fiber.memoizedProps?.user || fiber.pendingProps?.user;
      fiber = fiber.return;
      depth++;
    }

    if (!user) continue;
    if (user.bot && getSetting<boolean>("dontShowForBots", false)) continue;

    const existing = target.querySelector("." + TAG_CLASS);
    if (existing) {
      if (existing.getAttribute("data-uid") === user.id && existing.getAttribute("data-cid") === channel.id) continue;
      existing.remove();
    }

    const perms = getPermissions(user, channel);
    let tag = null;
    for (const candidate of tags) {
      if (!getSetting<boolean>(`showOutsideChat_${candidate.name}`, true)) continue;

      if (candidate.condition) {
        if (candidate.condition(user, channel)) {
          tag = candidate;
          break;
        }
      } else if (candidate.permissions?.some((perm) => perms.includes(perm))) {
        tag = candidate;
        break;
      }
    }

    if (!tag) continue;

    const span = document.createElement("span");
    span.className = TAG_CLASS;
    span.setAttribute("data-uid", user.id);
    span.setAttribute("data-cid", channel.id);
    span.textContent = getSetting<string>(`tagText_${tag.name}`, tag.displayName);
    span.style.backgroundColor = "var(--brand-experiment)";
    span.style.color = "white";
    span.style.borderRadius = "3px";
    span.style.padding = "0 4px";
    span.style.marginLeft = "4px";
    span.style.fontSize = "10px";
    span.style.fontWeight = "bold";
    span.style.verticalAlign = "middle";
    span.style.display = "inline-block";
    target.appendChild(span);
  }
}

setInterval(processMemberList, 2000);
