import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

let ChannelStore: any = null;
let UserStore: any = null;
let RelationshipStore: any = null;
let IconUtils: any = null;
let SelectedChannelActionCreators: any = null;
let MutualsListClasses: any = null;
let ProfileListClasses: any = null;
let TabBarClasses: any = null;

function findStore(name: string): any {
  try {
    const mods = spacepack.findByCode(`"${name}"`);
    for (const mod of mods) {
      const exp = mod.exports?.default || mod.exports;
      if (exp?.getName?.() === name) return exp;
      for (const key of Object.keys(exp || {})) {
        if (exp[key]?.getName?.() === name) return exp[key];
      }
    }
  } catch {}
  return null;
}

function init() {
  ChannelStore = findStore("ChannelStore");
  UserStore = findStore("UserStore");
  RelationshipStore = findStore("RelationshipStore");

  try {
    const results = spacepack.findByCode("getChannelIconURL");
    for (const res of results) {
      const exp = res.exports?.default || res.exports;
      if (exp?.getChannelIconURL) {
        IconUtils = exp;
        break;
      }
    }
  } catch {}

  try {
    const results = spacepack.findByCode("selectPrivateChannel");
    for (const res of results) {
      const exp = res.exports?.default || res.exports;
      if (exp?.selectPrivateChannel) {
        SelectedChannelActionCreators = exp;
        break;
      }
    }
  } catch {}

  try {
    const results = spacepack.findByCode("textContainer:", "empty:", "connectionIcon:");
    for (const res of results) {
      const exp = res.exports?.default || res.exports;
      if (exp?.empty && exp?.textContainer) {
        ProfileListClasses = exp;
        break;
      }
    }
  } catch {}

  try {
    const results = spacepack.findByCode("row:", "icon:", "details:", "name:");
    for (const res of results) {
      const exp = res.exports?.default || res.exports;
      if (exp?.row && exp?.details && exp?.name) {
        if (Object.keys(exp).length < 20) {
          MutualsListClasses = exp;
          break;
        }
      }
    }
  } catch {}

  try {
    const results = spacepack.findByCode("tabPanelScroller:", "tabBarPanel:");
    for (const res of results) {
      const exp = res.exports?.default || res.exports;
      if (exp?.tabPanelScroller) {
        TabBarClasses = exp;
        break;
      }
    }
  } catch {}
}

function getMutualGroupDms(userId: string) {
  if (!ChannelStore) return [];
  try {
    const channels = ChannelStore.getSortedPrivateChannels?.() || [];
    return channels.filter((c: any) => {
      const isGroup = c.type === 3 || (typeof c.isGroupDM === "function" ? c.isGroupDM() : c.isGroupDM === true);
      return isGroup && c.recipients?.includes(userId);
    });
  } catch {
    return [];
  }
}

function getGroupDMName(channel: any) {
  if (channel.name) return channel.name;
  const recipients = channel.recipients || [];
  const names = recipients
    .map((rid: string) => {
      const user = UserStore?.getUser?.(rid);
      const nick = RelationshipStore?.getNickname?.(rid);
      return nick || user?.globalName || user?.username || rid;
    })
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Unnamed Group DM";
}

function createDMRow(channel: any, onClose: () => void) {
  const row = document.createElement("div");
  row.className = MutualsListClasses?.row || "mgdm-row";
  row.onclick = (e) => {
    e.stopPropagation();
    onClose();
    SelectedChannelActionCreators?.selectPrivateChannel(channel.id);
  };

  const icon = document.createElement("img");
  icon.className = MutualsListClasses?.icon || "mgdm-icon";
  if (IconUtils) {
    try {
      icon.src = IconUtils.getChannelIconURL({ id: channel.id, icon: channel.icon, size: 40 });
    } catch {
      if (channel.icon)
        icon.src = `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.webp?size=40`;
    }
  } else if (channel.icon) {
    icon.src = `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.webp?size=40`;
  }

  const details = document.createElement("div");
  details.className = MutualsListClasses?.details || "mgdm-details";

  const name = document.createElement("div");
  name.className = MutualsListClasses?.name || "mgdm-name";
  name.textContent = getGroupDMName(channel);

  const members = document.createElement("div");
  members.style.fontSize = "12px";
  members.style.color = "var(--header-secondary)";
  members.textContent = `${(channel.recipients?.length || 0) + 1} Members`;

  details.appendChild(name);
  details.appendChild(members);
  row.appendChild(icon);
  row.appendChild(details);

  return row;
}

function processProfile() {
  const modal = document.querySelector(
    '[class*="userProfileModalInner_"], [class*="userProfileOuter_"], [class*="profileModal_"], [class*="root_"][class*="small_"]'
  );
  if (!modal) return;
  if (modal.querySelector(".mgdm-tab")) return;

  const tabBar = modal.querySelector('[role="tablist"], [class*="tabBar_"]');
  if (!tabBar) return;

  const fiberKey = Object.keys(modal).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
  );
  let fiber = fiberKey ? (modal as any)[fiberKey] : null;
  let user = null;
  let depth = 0;
  while (fiber && !user && depth < 60) {
    user =
      fiber.memoizedProps?.user ||
      fiber.pendingProps?.user ||
      fiber.memoizedProps?.profileUser ||
      fiber.pendingProps?.profileUser;
    fiber = fiber.return;
    depth++;
  }

  if (!user || user.id === UserStore?.getCurrentUser()?.id || user.bot) return;

  const mutuals = getMutualGroupDms(user.id);
  if (mutuals.length === 0) return;

  const tab = document.createElement("div");
  tab.className = "mgdm-tab";
  tab.setAttribute("role", "tab");
  tab.textContent = `${mutuals.length} Mutual Group${mutuals.length !== 1 ? "s" : ""}`;

  tab.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const body = modal.querySelector(
      '[class*="tabBody_"], [class*="body_"], [class*="content_"], [class*="scroller_"]'
    );
    if (!body) return;

    const allTabs = tabBar.querySelectorAll('[role="tab"], [class*="tabBarItem_"], .mgdm-tab');
    allTabs.forEach((t) => {
      (t as any).style.borderBottomColor = "transparent";
      (t as any).style.color = "var(--interactive-normal)";
      (t as any).classList.remove("mgdm-active-tab");
    });
    tab.classList.add("mgdm-active-tab");

    body.innerHTML = "";
    const scroller = document.createElement("div");
    scroller.className = TabBarClasses?.tabPanelScroller || "mgdm-scroller";
    scroller.style.overflowY = "auto";
    scroller.style.height = "100%";
    scroller.style.padding = "16px";

    if (mutuals.length > 0) {
      mutuals.forEach((c: any) => {
        scroller.appendChild(
          createDMRow(c, () => {
            const closeBtn = document.querySelector('[class*="closeButton_"]');
            if (closeBtn) (closeBtn as any).click();
            const backdrop = document.querySelector('[class*="backdrop_"]');
            if (backdrop) (backdrop as any).click();
          })
        );
      });
    }
    body.appendChild(scroller);
  };

  tabBar.appendChild(tab);
}

init();
setInterval(processProfile, 2000);
