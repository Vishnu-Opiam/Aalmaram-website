import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { CartProvider } from "@/context/CartContext";
import { PreOrderProvider } from "@/context/PreOrderContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aalmaram - Nandu in Muziris",
  description:
    "Set in the ancient port of Muziris, Nandu in Muziris follows a young crow named Nandu after a storm destroys his home. A beautifully illustrated children's book rooted in Kerala's history.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="paper">
        <CartProvider>
          <PreOrderProvider>{children}</PreOrderProvider>
        </CartProvider>
      </body>
      {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
    </html>
  );
}
