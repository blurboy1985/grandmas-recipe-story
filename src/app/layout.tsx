import "./globals.css";
import { Caveat, Fraunces, Lora, Special_Elite } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["400", "600", "700"], style: ["normal", "italic"], fallback: ["Georgia", "serif"] });
const body = Lora({ subsets: ["latin"], variable: "--font-body", style: ["normal", "italic"], fallback: ["Georgia", "serif"] });
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand", weight: ["600", "700"], fallback: ["cursive"] });
const type = Special_Elite({ subsets: ["latin"], variable: "--font-type", weight: ["400"], fallback: ["monospace"] });

export const viewport = { width: "device-width", initialScale: 1 };

export const metadata = {
  title: "Grandma's Recipe Story",
  description: "Preserve a family cooking recording as an editable recipe card and story, with the original voice kept alongside.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable} ${type.variable}`}>
      <body>
        <header className="masthead noprint">
          <div className="masthead-inner">
            <span className="masthead-title">Grandma&apos;s Recipe Story</span>
            <span className="masthead-sub">a family recipe box</span>
          </div>
        </header>
        <div className="shell">
          {children}
          <footer className="site-foot noprint">
            <span className="hand">— with love, from her kitchen —</span>
            From her voice, to your kitchen table.
          </footer>
        </div>
      </body>
    </html>
  );
}
