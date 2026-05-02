import type { ExtensionWebExports } from "@moonlight-mod/types";

export const patches: ExtensionWebExports["patches"] = [];

export const webpackModules: ExtensionWebExports["webpackModules"] = {
  diffUtils: {
    dependencies: []
  },
  main: {
    entrypoint: true,
    dependencies: [
      { id: "react" },
      { ext: "contextMenu", id: "contextMenu" },
      { ext: "common", id: "stores" },
      { ext: "componentEditor", id: "messages" },
      { ext: "spacepack", id: "spacepack" },
      { id: "discord/Dispatcher" },
      { id: "discord/Constants" },
      { id: "discord/lib/ChannelMessages" }
    ]
  }
};

export const styles: ExtensionWebExports["styles"] = ["./style.css"];
