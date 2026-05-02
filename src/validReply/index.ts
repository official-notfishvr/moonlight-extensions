import type { ExtensionWebExports } from "@moonlight-mod/types";

export const patches: ExtensionWebExports["patches"] = [
  {
    find: "REPLY_QUOTE_MESSAGE_NOT_LOADED",
    replace: {
      match: /REPLY_QUOTE_MESSAGE_NOT_LOADED\}\)/,
      replacement: (m: string) => m + `,onMouseEnter:()=>{require("validReply_main").fetchReply(arguments[0])}`
    }
  }
];

export const webpackModules: ExtensionWebExports["webpackModules"] = {
  main: {
    entrypoint: true,
    dependencies: [
      { ext: "spacepack", id: "spacepack" },
      { id: "discord/Dispatcher" },
      { id: "discord/modules/replies/ReferencedMessageStore" },
      { id: "discord/stores/AuthenticationStore" }
    ]
  }
};
