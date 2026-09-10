import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { CartProvider } from "@/context/CartContext";
import { PreOrderProvider } from "@/context/PreOrderContext";
import { getFeaturedProduct } from "@/lib/commerce";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aalmaram - Nandu in Muziris",
  description:
    "Set in the ancient port of Muziris, Nandu in Muziris follows a young crow named Nandu after a storm destroys his home. A beautifully illustrated children's book rooted in Kerala's history.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The cart needs a real variant id to put in the basket, so the featured
  // product is read here rather than in each page that shows a buy button.
  // A failure must not take the whole site down — the storefront still reads
  // fine without a basket.
  let product = null;
  try {
    product = await getFeaturedProduct();
  } catch (err) {
    console.error("Could not load the featured product", err);
  }

  return (
    <html lang="en">
      <body className="paper">
        <CartProvider product={product}>
          <PreOrderProvider>{children}</PreOrderProvider>
        </CartProvider>
      </body>
      {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
    </html>
  );
}
