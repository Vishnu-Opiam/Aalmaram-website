import type { Metadata } from "next";
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
    </html>
  );
}
