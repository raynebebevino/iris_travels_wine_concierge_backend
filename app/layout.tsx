import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "Iris Travels Wine Concierge API",
  description: "Backend API for Iris Travels Wine Concierge Service",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
