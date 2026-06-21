// Central site configuration: brand, contact, navigation and social links.
// Location updated from New Delhi -> Bengaluru per the brand's relocation.

export const site = {
  name: "AMC Airmodelcrafts",
  shortName: "AMC",
  tagline: "Aeromodelling, built in Bengaluru.",
  manifesto: "Build it. Fly it. Own the sky.",
  city: "Bengaluru",

  contact: {
    phoneDisplay: "+91 99534 03698",
    phoneRaw: "919953403698",
    whatsapp: "919953403698",
    whatsappMessage:
      "Hi AMC Airmodelcrafts! I'd like to know more about your products and workshops.",
    email: "hello@airmodelcrafts.com",
    addressLine1: "AMC Airmodelcrafts",
    addressLine2: "100 Feet Road, Indiranagar",
    addressCity: "Bengaluru, Karnataka 560038",
    mapsUrl: "https://maps.google.com/?q=Indiranagar+Bengaluru",
  },

  social: {
    instagram: "https://www.instagram.com/airmodelcrafts/",
    facebook: "https://www.facebook.com/modelaircrafts",
    youtube: "https://www.youtube.com/channel/UC_5wgLbTsU7Ivhehue4_3ow",
  },

  // Primary storefront store link (existing Wix catalogue) used by product CTAs.
  storeUrl: "https://www.airmodelcrafts.com/category/all-products",
};

export function whatsappLink(message = site.contact.whatsappMessage) {
  return `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(message)}`;
}

// Top navigation for the storefront. Hash links scroll within the home page;
// path links route elsewhere (shop, summer-camp registration, etc.).
export const navLinks = [
  { label: "Shop", to: "/shop" },
  { label: "Drones & RC", to: "/#flagship" },
  { label: "Build Your Own", to: "/#build" },
  { label: "Workshops", to: "/#workshops" },
  { label: "Summer Camp", to: "/camp" },
];
