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

export default function Home() {
  return (
    <>
      <Header />
      <StickyBar />
      <a id="top" />
      <Hero />
      <Marquee />
      <Products />
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
