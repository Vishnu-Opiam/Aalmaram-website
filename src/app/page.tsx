import Header from "@/components/Header";
import StickyBar from "@/components/StickyBar";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Products from "@/components/Products";
import AboutAalmaram from "@/components/AboutAalmaram";
import Updates from "@/components/Updates";
import Collaborate from "@/components/Collaborate";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";
import Toast from "@/components/Toast";
import ProgressRail from "@/components/ProgressRail";
import RevealObserver from "@/components/RevealObserver";
import SmoothScroll from "@/components/SmoothScroll";
import PreOrderModal from "@/components/PreOrderModal";
import { getFeaturedProduct } from "@/lib/commerce";

// Stock moves with every order and events drop off the day after; admin saves
// revalidate straight away, and this is the floor for everything else.
export const revalidate = 300;

export default async function Home() {
  const product = await getFeaturedProduct();

  return (
    <>
      <Header />
      <StickyBar />
      <a id="top" />
      <Hero />
      <Marquee />
      <Products product={product} />
      <AboutAalmaram />
      <Updates />
      <Collaborate />
      <Footer />
      <ProgressRail />
      <CartDrawer />
      <Toast />
      <PreOrderModal />
      <RevealObserver />
      <SmoothScroll />
    </>
  );
}
