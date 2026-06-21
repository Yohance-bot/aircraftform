// The four product "worlds". Each scroll section drops you into one universe,
// Nike-style. `id` matches product.category in products.js.

export const categories = [
  {
    id: "drones-rc",
    anchor: "flagship",
    kicker: "Flagship",
    name: "Drones & RC Aircraft",
    headline: "Built to fly hard.",
    blurb:
      "FPV racing drones, fighter jets and powered RC planes for pilots who push the throttle. The high-performance end of the hangar.",
    accent: "#0E90F1",
    tone: "from-aero-500 to-aero-700",
    image:
      "https://static.wixstatic.com/media/ee6bbc_1f65d1695a624601990166b0768b2212~mv2.jpeg/v1/fill/w_1100,h_1100,al_c,q_85,enc_auto/file.jpeg",
  },
  {
    id: "kits-diy",
    anchor: "build",
    kicker: "Build Your Own",
    name: "Kits & DIY",
    headline: "Make it yourself.",
    blurb:
      "Static models, rocketry, ornithopters and DIY kits. Open the box, follow the build, and learn how flight actually works — one part at a time.",
    accent: "#0073D6",
    tone: "from-aero-600 to-aero-800",
    image:
      "https://static.wixstatic.com/media/ee6bbc_ad41d6e1354e4d7281a00fb52351574c~mv2.jpeg/v1/fill/w_1100,h_1100,al_c,q_85,enc_auto/file.jpeg",
  },
  {
    id: "gliders",
    anchor: "gliders",
    kicker: "Entry Level",
    name: "Gliders & First Flights",
    headline: "Where everyone starts.",
    blurb:
      "Rubber-powered, catapult and chuck gliders that are perfect for kids, classrooms and first-time flyers. Affordable, forgiving, and endlessly fun.",
    accent: "#38ABFF",
    tone: "from-aero-400 to-aero-600",
    image:
      "https://static.wixstatic.com/media/ee6bbc_7db3a03f183f4358b3a5bc24ddc7cf31~mv2.jpeg/v1/fill/w_1100,h_1100,al_c,q_85,enc_auto/file.jpeg",
  },
  {
    id: "parts-electronics",
    anchor: "parts",
    kicker: "For the builder",
    name: "Parts & Electronics",
    headline: "Engineer the details.",
    blurb:
      "Transmitters, servos, motors, ESCs, LiPo packs, balsa and covering film. Everything the serious builder needs to spec, repair and upgrade.",
    accent: "#005AAD",
    tone: "from-aero-700 to-aero-900",
    image:
      "https://static.wixstatic.com/media/ee6bbc_39dca9a2762a4184b52f3107e7f0df7e~mv2.png/v1/fill/w_1100,h_1100,al_c,q_85,enc_auto/file.png",
  },
];

export const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));

// Shop filter chips ("All" + the four worlds).
export const shopFilters = [
  { id: "all", label: "All Products" },
  ...categories.map((c) => ({ id: c.id, label: c.name })),
];
