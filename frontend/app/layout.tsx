import "./globals.css";

export const metadata = {
  title: "TermsGuard — GenLayer",
  description: "Semantic commitment and policy verification on GenLayer.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
