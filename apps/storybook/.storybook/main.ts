import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: [
    "../../../packages/ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../../called-together/**/*.stories.tsx",
  ],
  staticDirs: ["../public"],
  addons: ["@storybook/addon-docs"],
  // Next.js preserves JSX for its compiler; Vite must compile app-owned stories.
  viteFinal: (config) => ({
    ...config,
    oxc: { ...config.oxc, jsx: { runtime: "automatic" } },
  }),
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
