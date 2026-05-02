import type { ExtensionWebExports } from "@moonlight-mod/types";

export const patches: ExtensionWebExports["patches"] = [];

export const webpackModules: ExtensionWebExports["webpackModules"] = {
  main: {
    entrypoint: true,
    dependencies: [
      { ext: "spacepack", id: "spacepack" },
      { ext: "common", id: "stores" },
      { id: "discord/Dispatcher" },
      { id: "discord/Constants" },
      { id: "discord/utils/ClipboardUtils" },
      { id: "discord/design/components/Toast/web/Toast" },
      { id: "discord/design/components/Toast/web/ToastAPI" },
      { id: "discord/design/components/Toast/web/ToastConstants" }
    ]
  }
};
