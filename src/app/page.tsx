import Header from "@/components/Header";
import StickyBar from "@/components/StickyBar";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Ethos from "@/components/Ethos";
import Gallery from "@/components/Gallery";
import Voices from "@/components/Voices";
import Craft from "@/components/Craft";
import Specs from "@/components/Specs";
import FinalCTA from "@/components/FinalCTA";
import NewsletterEvents from "@/components/NewsletterEvents";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";
import Toast from "@/components/Toast";
import ProgressRail from "@/components/ProgressRail";
import RevealObserver from "@/components/RevealObserver";
import SmoothScroll from "@/components/SmoothScroll";

export default function Home() {
  return (
    <>
      <Header />
      <StickyBar />
      <a id="top" />
      <Hero />
      <Marquee />
      <Ethos />
      <Gallery />
      <Voices />
      <Craft />
      <Specs />
      <NewsletterEvents />
      <FinalCTA />
      <Footer />
      <ProgressRail />
      <CartDrawer />
      <Toast />
      <RevealObserver />
      <SmoothScroll />
    </>
  );
}
