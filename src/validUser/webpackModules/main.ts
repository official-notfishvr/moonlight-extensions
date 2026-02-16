import Dispatcher from "@moonlight-mod/wp/discord/Dispatcher";
import spacepack from "@moonlight-mod/wp/spacepack_spacepack";
import React from "@moonlight-mod/wp/react";

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
let _UserProfileStore: any = null;

function ensureStores() {
  if (!_UserStore) _UserStore = findStore("UserStore");
  if (!_UserProfileStore) _UserProfileStore = findStore("UserProfileStore");
}

const UserFlags: Record<string, number> = {
  STAFF: 1 << 0,
  PARTNER: 1 << 1,
  HYPESQUAD: 1 << 2,
  BUG_HUNTER_LEVEL_1: 1 << 3,
  HYPESQUAD_ONLINE_HOUSE_1: 1 << 6,
  HYPESQUAD_ONLINE_HOUSE_2: 1 << 7,
  HYPESQUAD_ONLINE_HOUSE_3: 1 << 8,
  PREMIUM_EARLY_SUPPORTER: 1 << 9,
  BUG_HUNTER_LEVEL_2: 1 << 14,
  VERIFIED_DEVELOPER: 1 << 17,
  CERTIFIED_MODERATOR: 1 << 18,
  ACTIVE_DEVELOPER: 1 << 22,
  DISCORD_EMPLOYEE: 1 << 0
};

const badges: Record<string, { id: string; description: string; icon: string; link?: string }> = {
  active_developer: {
    id: "active_developer",
    description: "Active Developer",
    icon: "6bdc42827a38498929a4920da12695d9",
    link: "https://support-dev.discord.com/hc/en-us/articles/10113997751447"
  },
  bug_hunter_level_1: {
    id: "bug_hunter_level_1",
    description: "Discord Bug Hunter",
    icon: "2717692c7dca7289b35297368a940dd0",
    link: "https://support.discord.com/hc/en-us/articles/360046057772-Discord-Bugs"
  },
  bug_hunter_level_2: {
    id: "bug_hunter_level_2",
    description: "Discord Bug Hunter",
    icon: "848f79194d4be5ff5f81505cbd0ce1e6",
    link: "https://support.discord.com/hc/en-us/articles/360046057772-Discord-Bugs"
  },
  certified_moderator: {
    id: "certified_moderator",
    description: "Moderator Programs Alumni",
    icon: "fee1624003e2fee35cb398e125dc479b",
    link: "https://discord.com/safety"
  },
  discord_employee: {
    id: "staff",
    description: "Discord Staff",
    icon: "5e74e9b61934fc1f67c65515d1f7e60d",
    link: "https://discord.com/company"
  },
  staff: {
    id: "staff",
    description: "Discord Staff",
    icon: "5e74e9b61934fc1f67c65515d1f7e60d",
    link: "https://discord.com/company"
  },
  hypesquad: {
    id: "hypesquad",
    description: "HypeSquad Events",
    icon: "bf01d1073931f921909045f3a39fd264",
    link: "https://discord.com/hypesquad"
  },
  hypesquad_online_house_1: {
    id: "hypesquad_house_1",
    description: "HypeSquad Bravery",
    icon: "8a88d63823d8a71cd5e390baa45efa02",
    link: "https://discord.com/settings/hypesquad-online"
  },
  hypesquad_online_house_2: {
    id: "hypesquad_house_2",
    description: "HypeSquad Brilliance",
    icon: "011940fd013da3f7fb926e4a1cd2e618",
    link: "https://discord.com/settings/hypesquad-online"
  },
  hypesquad_online_house_3: {
    id: "hypesquad_house_3",
    description: "HypeSquad Balance",
    icon: "3aa41de486fa12454c3761e8e223442e",
    link: "https://discord.com/settings/hypesquad-online"
  },
  partner: {
    id: "partner",
    description: "Partnered Server Owner",
    icon: "3f9748e53446a137a052f3454e2de41e",
    link: "https://discord.com/partners"
  },
  premium: {
    id: "premium",
    description: "Subscriber",
    icon: "2ba85e8026a8614b640c2837bcdfe21b",
    link: "https://discord.com/settings/premium"
  },
  premium_early_supporter: {
    id: "early_supporter",
    description: "Early Supporter",
    icon: "7060786766c9c840eb3019e725d2b358",
    link: "https://discord.com/settings/premium"
  },
  verified_developer: {
    id: "verified_developer",
    description: "Early Verified Bot Developer",
    icon: "6df5892e0f35b051f8b61eace34f4967"
  }
};

const fetching = new Set<string>();
const queue: (() => Promise<void>)[] = [];
let processing = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const task = queue.shift();
    if (task) {
      try {
        await task();
      } catch {}
    }
    await sleep(300);
  }
  processing = false;
}

async function getToken(): Promise<string | null> {
  try {
    const authStore = findStore("AuthenticationStore");
    return authStore?.getToken?.() ?? null;
  } catch {
    return null;
  }
}

async function getUser(id: string) {
  ensureStores();
  let userObj = _UserStore?.getUser?.(id);
  if (userObj) return userObj;

  const token = await getToken();
  if (!token) return null;

  try {
    const resp = await fetch(`https://discord.com/api/v9/users/${id}`, {
      headers: { Authorization: token }
    });

    if (resp.status === 429) {
      const body = await resp.json().catch(() => ({}));
      throw { status: 429, body };
    }

    if (!resp.ok) return null;

    const user = await resp.json();

    Dispatcher.dispatch({
      type: "USER_UPDATE",
      user: user
    });

    await Dispatcher.dispatch({
      type: "USER_PROFILE_FETCH_FAILURE",
      userId: id
    });

    userObj = _UserStore?.getUser?.(id);
    if (!userObj) return null;

    const fakeBadges: any[] = [];
    for (const [key, flag] of Object.entries(UserFlags)) {
      if (!isNaN(flag) && userObj.hasFlag?.(flag)) {
        const badge = badges[key.toLowerCase()];
        if (badge) fakeBadges.push(badge);
      }
    }
    if (user.premium_type || (!user.bot && (user.banner || user.avatar?.startsWith?.("a_")))) {
      fakeBadges.push(badges.premium);
    }

    const profile = _UserProfileStore?.getUserProfile?.(id);
    if (profile) {
      profile.accentColor = user.accent_color;
      profile.badges = fakeBadges;
      profile.banner = user.banner;
      profile.premiumType = user.premium_type;
    }

    return userObj;
  } catch (e: any) {
    if (e?.status === 429) throw e;
    return null;
  }
}

function MentionWrapper({ data, UserMention, RoleMention, parse, props }: any) {
  const [userId, setUserId] = React.useState(data.userId);

  if (userId) {
    return React.createElement(UserMention, {
      className: "mention",
      userId: userId,
      channelId: data.channelId,
      inlinePreview: props.noStyleAndInteraction,
      props: props,
      key: props.key
    });
  }

  const children = parse(data.content, props);

  return React.createElement(
    RoleMention,
    {
      ...data,
      props: props,
      inlinePreview: props.formatInline
    },
    React.createElement(
      "span",
      {
        onMouseEnter: () => {
          const mention = children?.[0]?.props?.children;
          if (typeof mention !== "string") return;

          const match = mention.match(/<@!?(\d+)>/);
          const id = match?.[1];
          if (!id) return;

          if (fetching.has(id)) return;

          ensureStores();
          if (_UserStore?.getUser?.(id)) {
            setUserId(id);
            return;
          }

          const doFetch = () => {
            fetching.add(id);
            queue.push(async () => {
              try {
                await getUser(id);
                setUserId(id);
                fetching.delete(id);
              } catch (e: any) {
                if (e?.status === 429) {
                  fetching.delete(id);
                  const retryAfter = e?.body?.retry_after ?? 1000;
                  queue.unshift(async () => {
                    await sleep(retryAfter);
                    doFetch();
                  });
                }
              }
            });
            processQueue();
          };

          doFetch();
        }
      },
      children
    )
  );
}

export function renderMention(RoleMention: any, UserMention: any, data: any, parse: any, props: any) {
  return React.createElement(MentionWrapper, {
    key: "mention" + data.userId,
    RoleMention,
    UserMention,
    data,
    parse,
    props
  });
}
