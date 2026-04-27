import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

const EXT_ID = "moreUserTags";
const TAG_CLASS = "mut-tag";

function getSetting<T>(name: string, fallback: T): T {
  const val = moonlight.getConfigOption<T>(EXT_ID, name);
  return val !== undefined ? val : fallback;
}

function requireMapped(id: string): any {
  try {
    if (!(id in (spacepack.modules ?? {})) && !(id in (spacepack.cache ?? {}))) return null;
    return spacepack.require(id);
  } catch {
    return null;
  }
}

function findStore(name: string): any {
  const mapped = requireMapped(`discord/stores/${name}`);
  const mappedExport = mapped?.default ?? mapped;
  if (mappedExport?.getName?.() === name) return mappedExport;
  for (const key of Object.keys(mappedExport ?? {})) {
    if (mappedExport[key]?.getName?.() === name) return mappedExport[key];
  }

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

let GuildStore: any = null;
let ChannelStore: any = null;
let SelectedChannelStore: any = null;
let PermissionStore: any = null;
let PermissionBits: any = null;

const PermissionBitsFallback = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_GUILD: 1n << 5n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_MESSAGES: 1n << 13n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  MOVE_MEMBERS: 1n << 24n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MODERATE_MEMBERS: 1n << 40n
} as const;

function init() {
  GuildStore = findStore("GuildStore");
  ChannelStore = findStore("ChannelStore");
  SelectedChannelStore = findStore("SelectedChannelStore");
  PermissionStore = findStore("PermissionStore");
  PermissionBits = PermissionBitsFallback;
}

const ALL_PERMS = [
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

const tags = [
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

function getPermissions(user: any, channel: any): string[] {
  if (!GuildStore || !PermissionStore || !PermissionBits) return [];
  const guildId = channel?.guild_id;
  const guild = GuildStore.getGuild?.(guildId);
  if (!guild) return [];
  if (guild.ownerId === user?.id) return ALL_PERMS;
  const result: string[] = [];
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
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
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
    for (const t of tags) {
      if (!getSetting<boolean>(`showOutsideChat_${t.name}`, true)) continue;
      if (t.condition) {
        if (t.condition(user, channel)) {
          tag = t;
          break;
        }
      } else if (t.permissions) {
        if (t.permissions.some((p) => perms.includes(p))) {
          tag = t;
          break;
        }
      }
    }
    if (tag) {
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
}

init();
setInterval(processMemberList, 2000);
