import "./globals.css";

export const viewport = { width: "device-width", initialScale: 1 };

export const metadata = { title: "Grandma's Recipe Story (Sample)", description: "Milestone A sample capture flow" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
