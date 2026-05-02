import type { ExtensionWebExports } from "@moonlight-mod/types";

export const patches: ExtensionWebExports["patches"] = [];

export const webpackModules: ExtensionWebExports["webpackModules"] = {
  main: {
    entrypoint: true,
    dependencies: [
      { id: "react" },
      { ext: "common", id: "stores" },
      { id: "discord/stores/SelectedChannelStore" },
      { id: "discord/Constants" }
    ]
  }
};

export const styles: ExtensionWebExports["styles"] = ["./style.css"];
