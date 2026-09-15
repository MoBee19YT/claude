/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Parking status palette - kept subdued so the map stays legible,
        // and always paired with an icon (see utils/colors.ts) so the
        // system doesn't rely on color alone.
        park: {
          free: "#16a34a",
          paid: "#2563eb",
          resident: "#9333ea",
          restricted: "#ea580c",
          ev: "#0d9488",
          no: "#dc2626",
          private: "#64748b",
          unknown: "#ca8a04",
        },
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          700: "#334155",
          900: "#0f172a",
        },
      },
      boxShadow: {
        panel: "0 8px 30px -8px rgba(15, 23, 42, 0.25)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
