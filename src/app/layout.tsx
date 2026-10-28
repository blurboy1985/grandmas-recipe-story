import "./globals.css";

export const viewport = { width: "device-width", initialScale: 1 };

export const metadata = {
  title: "Grandma's Recipe Story",
  description: "Preserve a family cooking recording as an editable recipe card and story, with the original voice kept alongside.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="masthead noprint">
          <div className="masthead-inner">
            <span className="masthead-title">Grandma&apos;s Recipe Story</span>
            <span className="masthead-sub">a family recipe box</span>
          </div>
        </header>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
