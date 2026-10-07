import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14221E",
        linen: "#E9ECE8",
        paper: "#FAFBF9",
        line: "#CBD2CC",
        mist: "#5F6E67",
        fennel: "#2E6B50",
        chili: "#B83A28",
        saffron: "#B97C12",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
