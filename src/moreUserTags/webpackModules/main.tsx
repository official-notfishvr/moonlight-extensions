import { ChannelStore, GuildStore } from "@moonlight-mod/wp/common_stores";
import { Permissions } from "@moonlight-mod/wp/discord/Constants";
import GuildMemberStore from "@moonlight-mod/wp/discord/stores/GuildMemberStore";
import SelectedChannelStore from "@moonlight-mod/wp/discord/stores/SelectedChannelStore";

const EXT_ID = "moreUserTags";
const TAG_CLASS = "mut-tag";
const MEMBER_ITEM_SELECTOR = '[class*="member_"]';
const MEMBER_GROUP_SELECTOR = '[class*="groupTitle_"]';
const MEMBER_NAME_SELECTOR = '[class*="nameAndDecorators"], [class*="name_"]';

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
type UserTag = {
  name: string;
  displayName: string;
  condition?: (user: any, channel: any) => boolean;
  permissions?: PermissionName[];
};

const ALL_PERMISSIONS: PermissionName[] = Object.keys(PermissionBits) as PermissionName[];

const USER_TAGS: UserTag[] = [
  {
    name: "OWNER",
    displayName: "Owner",
    condition: (user, channel) => GuildStore?.getGuild?.(channel?.guild_id)?.ownerId === user?.id
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

function getSetting<T>(name: string, fallback: T): T {
  const value = moonlight.getConfigOption<T>(EXT_ID, name);
  return value !== undefined ? value : fallback;
}

function getSelectedGuildChannel() {
  const channelId = SelectedChannelStore?.getChannelId?.();
  const channel = ChannelStore?.getChannel?.(channelId);
  return channel?.guild_id ? channel : null;
}

function getGuildRole(guild: any, roleId: string) {
  const roles = guild?.roles;
  if (!roles || !roleId) return null;

  if (typeof roles.get === "function") {
    return roles.get(roleId) ?? null;
  }

  if (Array.isArray(roles)) {
    return roles.find((role: any) => role?.id === roleId) ?? null;
  }

  return roles[roleId] ?? null;
}

function getGuildMember(user: any, channel: any) {
  try {
    return GuildMemberStore?.getMember?.(channel.guild_id, user?.id) ?? null;
  } catch {
    return null;
  }
}

function getUserPermissions(user: any, channel: any): PermissionName[] {
  const guild = GuildStore.getGuild?.(channel?.guild_id);
  if (!guild) return [];
  if (guild.ownerId === user?.id) return ALL_PERMISSIONS;

  const member = getGuildMember(user, channel);
  if (!member) return [];

  const roleIds = Array.isArray(member?.roles) ? member.roles : [];
  let permissionBits = 0n;

  const everyoneRole = getGuildRole(guild, channel.guild_id);
  if (everyoneRole) {
    try {
      permissionBits |= BigInt(everyoneRole.permissions ?? 0);
    } catch {}
  }

  for (const roleId of roleIds) {
    const role = getGuildRole(guild, roleId);
    if (!role) continue;

    try {
      permissionBits |= BigInt(role.permissions ?? 0);
    } catch {}
  }

  const permissions: PermissionName[] = [];
  for (const permission of ALL_PERMISSIONS) {
    try {
      const permissionBit = BigInt(PermissionBits[permission]);
      if ((permissionBits & permissionBit) === permissionBit) {
        permissions.push(permission);
      }
    } catch {}
  }

  return permissions;
}

function getReactFiber(node: Element): any {
  for (const key in node) {
    if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
      return (node as any)[key];
    }
  }
  return null;
}

function getMemberUser(memberNode: Element) {
  let fiber = getReactFiber(memberNode);
  let depth = 0;

  while (fiber && depth < 30) {
    const user = fiber.memoizedProps?.user ?? fiber.pendingProps?.user;
    if (user) return user;
    fiber = fiber.return;
    depth++;
  }

  return null;
}

function getApplicableTag(user: any, channel: any): UserTag | null {
  if (user.bot && getSetting("dontShowForBots", false)) return null;

  const permissions = getUserPermissions(user, channel);
  for (const tag of USER_TAGS) {
    if (!getSetting(`showOutsideChat_${tag.name}`, true)) continue;

    if (tag.condition?.(user, channel)) return tag;
    if (tag.permissions?.some((permission) => permissions.includes(permission))) return tag;
  }

  return null;
}

function getTagContainer(memberNode: Element): Element {
  return memberNode.querySelector(MEMBER_NAME_SELECTOR) ?? memberNode;
}

function syncTagElement(container: Element, user: any, channel: any, tag: UserTag | null) {
  const existing = container.querySelector(`.${TAG_CLASS}`) as HTMLSpanElement | null;
  const tagText = tag ? getSetting(`tagText_${tag.name}`, tag.displayName) : null;

  if (!tag || !tagText) {
    existing?.remove();
    return;
  }

  if (
    existing &&
    existing.dataset.uid === user.id &&
    existing.dataset.cid === channel.id &&
    existing.textContent === tagText
  ) {
    return;
  }

  existing?.remove();

  const badge = document.createElement("span");
  badge.className = TAG_CLASS;
  badge.dataset.uid = user.id;
  badge.dataset.cid = channel.id;
  badge.textContent = tagText;
  badge.style.backgroundColor = "var(--brand-experiment)";
  badge.style.color = "white";
  badge.style.borderRadius = "3px";
  badge.style.padding = "0 4px";
  badge.style.marginLeft = "4px";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "bold";
  badge.style.verticalAlign = "middle";
  badge.style.display = "inline-block";
  container.appendChild(badge);
}

function processMemberList() {
  const channel = getSelectedGuildChannel();
  if (!channel) return;

  const members = document.querySelectorAll(MEMBER_ITEM_SELECTOR);
  for (const member of members) {
    if (member.querySelector(MEMBER_GROUP_SELECTOR)) continue;

    const user = getMemberUser(member);
    if (!user) continue;

    const tag = getApplicableTag(user, channel);
    syncTagElement(getTagContainer(member), user, channel, tag);
  }
}

setInterval(processMemberList, 2000);
