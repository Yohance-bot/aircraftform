import StoreLayout from "../components/site/StoreLayout.jsx";
import Hero from "../sections/Hero.jsx";
import BrandMarquee from "../sections/BrandMarquee.jsx";
import WorldsSection from "../sections/WorldsSection.jsx";
import ShopSection from "../sections/ShopSection.jsx";
import WorkshopsSection from "../sections/WorkshopsSection.jsx";
import FinalCTA from "../sections/FinalCTA.jsx";

export default function StoreLandingPage() {
  return (
    <StoreLayout>
      <Hero />
      <BrandMarquee />
      <WorldsSection />
      <ShopSection />
      <WorkshopsSection />
      <FinalCTA />
    </StoreLayout>
  );
}
