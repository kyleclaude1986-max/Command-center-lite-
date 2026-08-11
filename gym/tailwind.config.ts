import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        ink: {
          DEFAULT: "#111318",
          soft: "#2b2f36",
          muted: "#6a7380",
        },
        paper: {
          DEFAULT: "#faf8f4",
          card: "#ffffff",
          line: "#e7e3db",
        },
        accent: {
          stone: "#7c6f5a",
          warm: "#b08968",
        },
        state: {
          hit: "#4a7c59",
          miss: "#a4553a",
          partial: "#b08968",
          idle: "#e7e3db",
        },
      },
      spacing: {
        safe: "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
};

export default config;
