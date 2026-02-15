import type { ExtensionWebExports } from "@moonlight-mod/types";

export const patches: ExtensionWebExports["patches"] = [
  {
    find: 'className:"mention"',
    replace: {
      match:
        /react(?=\(\i,\i,\i\).{0,100}return null==.{0,70}\?\(0,\i\.jsx\)\((\i\.\i),.+?jsx\)\((\i\.\i),\{className:"mention")/,
      replacement: (_, RoleMention: string, UserMention: string) =>
        `react:(...args)=>require("validUser_main").renderMention(${RoleMention},${UserMention},...args),originalReact`
    }
  },
  {
    find: "unknownUserMentionPlaceholder:",
    replace: {
      match: /unknownUserMentionPlaceholder:/,
      replacement: "unknownUserMentionPlaceholder:false&&"
    }
  }
];

export const webpackModules: ExtensionWebExports["webpackModules"] = {
  main: {
    entrypoint: true,
    dependencies: [{ id: "discord/Dispatcher" }, { ext: "spacepack", id: "spacepack" }, { id: "react" }]
  }
};
