import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import RegistrationForm from "../RegistrationForm.jsx";

gsap.registerPlugin(ScrollTrigger);

export default function RegistrationSection() {
  const sectionRef = useRef(null);

  useEffect(() => {
    const bgTween = gsap.to("main", {
      "--page-bg": "#F97316",
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top center",
        end: "top 20%",
        scrub: true,
      },
    });
    return () => bgTween.scrollTrigger?.kill();
  }, []);

  return (
    <section
      id="register"
      ref={sectionRef}
      className="w-full bg-brand-500 px-5 py-24 sm:px-10 lg:px-16"
    >
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
        <div>
          <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black leading-[1.05] text-black">
            Ready to fly?
            <br />
            Register here.
          </h2>
          <p className="mt-6 max-w-md text-base text-black/80 sm:text-lg">
            Whether you're a school looking to run a workshop, a parent
            enrolling your child, or a student who wants to build and fly —
            fill in your details and we'll reach out within 24 hours.
          </p>
          <a
            href="/shop"
            className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-black underline underline-offset-4 hover:no-underline"
          >
            Or explore our products →
          </a>
        </div>

        <div className="rounded-3xl bg-white p-2 shadow-2xl sm:p-4">
          <div className="flex justify-center">
            <RegistrationForm />
          </div>
        </div>
      </div>
    </section>
  );
}
