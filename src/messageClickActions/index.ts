import type { ExtensionWebExports } from "@moonlight-mod/types";

export const patches: ExtensionWebExports["patches"] = [
  {
    find: "Message must not be a thread starter message",
    replace: {
      match: /\)\("li",\{(.+?),className:/,
      replacement: (m: string, inner: string) =>
        ')("li",{' +
        inner +
        ",onClickCapture:(e)=>{" +
        'require("messageClickActions_main").onMessageClick(e,arguments[0])' +
        "},className:"
    }
  }
];

export const webpackModules: ExtensionWebExports["webpackModules"] = {
  main: {
    entrypoint: true,
    dependencies: [{ id: "discord/Dispatcher" }, { ext: "spacepack", id: "spacepack" }]
  }
};
