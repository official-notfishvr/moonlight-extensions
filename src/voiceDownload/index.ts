import type { ExtensionWebExports } from "@moonlight-mod/types";

export const webpackModules: ExtensionWebExports["webpackModules"] = {
  main: {
    entrypoint: true,
    dependencies: [{ ext: "spacepack", id: "spacepack" }]
  }
};
