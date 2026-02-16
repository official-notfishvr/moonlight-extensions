import type { ExtensionWebExports } from "@moonlight-mod/types";

const EXT_ID = "noPendingCount";

function getSetting<T>(name: string): T | undefined {
  return moonlight.getConfigOption<T>(EXT_ID, name);
}

export const patches: ExtensionWebExports["patches"] = [
  {
    find: "getPendingCount(){",
    prerequisite: () => getSetting<boolean>("hideFriendRequestsCount") ?? true,
    replace: {
      match: /(?<=getPendingCount\(\)\{)/,
      replacement: "return 0;"
    }
  },
  {
    find: "getMessageRequestsCount(){",
    prerequisite: () => getSetting<boolean>("hideMessageRequestsCount") ?? true,
    replace: {
      match: /(?<=getMessageRequestsCount\(\)\{)/,
      replacement: "return 0;"
    }
  },
  {
    find: ".getSpamChannelsCount();return",
    prerequisite: () => getSetting<boolean>("hideMessageRequestsCount") ?? true,
    replace: {
      match: /(?<=getSpamChannelsCount\(\);return )(\i)\.getMessageRequestsCount\(\)/,
      replacement: (_, store) => `${store}.getMessageRequestChannelIds().size`
    }
  },
  {
    find: "showProgressBadge:",
    prerequisite: () => getSetting<boolean>("hidePremiumOffersCount") ?? true,
    replace: {
      match: /(\{unviewedTrialCount:(\i),unviewedDiscountCount:(\i)\}.+?)\2\+\3/,
      replacement: (_, rest) => `${rest}0`
    }
  }
];
