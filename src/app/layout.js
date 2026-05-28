import "./globals.css";

export const metadata = {
  title: "ChatTree",
  description: "ChatTree – Non-linear chat interface for LLMs",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
