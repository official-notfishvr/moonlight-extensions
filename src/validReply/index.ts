import type { ExtensionWebExports } from "@moonlight-mod/types";

export const patches: ExtensionWebExports["patches"] = [
  {
    find: "REPLY_QUOTE_MESSAGE_NOT_LOADED",
    replace: {
      match: /REPLY_QUOTE_MESSAGE_NOT_LOADED\}\)/,
      replacement: (m: string) => m + `,onMouseEnter:()=>{require("validReply_main").fetchReply(arguments[0])}`
    }
  },
  {
    find: '"ReferencedMessageStore"',
    replace: {
      match: /_channelCaches=new Map/,
      replacement: (m: string) => m + `;require("validReply_main").setReplyStore(this)`
    }
  }
];

export const webpackModules: ExtensionWebExports["webpackModules"] = {
  main: {
    entrypoint: true,
    dependencies: [{ id: "discord/Dispatcher" }, { ext: "spacepack", id: "spacepack" }]
  }
};
