import SmoothScroll from "../components/home/SmoothScroll.jsx";
import HomeNav from "../components/home/HomeNav.jsx";
import HeroSection from "../components/home/HeroSection.jsx";
import BentoGrid from "../components/home/BentoGrid.jsx";
import AboutSection from "../components/home/AboutSection.jsx";
import HorizontalGallery from "../components/home/HorizontalGallery.jsx";
import WhatWeOffer from "../components/home/WhatWeOffer.jsx";
import StatsBar from "../components/home/StatsBar.jsx";
import RegistrationSection from "../components/home/RegistrationSection.jsx";
import SiteFooter from "../components/site/SiteFooter.jsx";

export default function HomePage() {
  return (
    <SmoothScroll>
      <div className="min-h-full">
        <HomeNav />
        <main className="page-bg-root">
          <HeroSection />
          <BentoGrid />
          <AboutSection />
          <HorizontalGallery />
          <WhatWeOffer />
          <StatsBar />
          <RegistrationSection />
        </main>
        <SiteFooter />
      </div>
    </SmoothScroll>
  );
}
