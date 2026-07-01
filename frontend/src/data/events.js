// Upcoming workshops, camps and competitions shown on the /home events
// calendar. Dates use ISO strings (YYYY-MM-DD); `endDate` is optional for
// multi-day events. `category` drives the color tag in the UI.

export const eventCategories = {
  workshop: { label: "Workshop", color: "#38ABFF" },
  camp: { label: "Camp", color: "#F97316" },
  training: { label: "Training", color: "#34D399" },
  competition: { label: "Competition", color: "#F472B6" },
  event: { label: "Event", color: "#A78BFA" },
};

export const events = [
  {
    id: "maker-jul",
    date: "2026-07-12",
    title: "Weekend Maker Workshop",
    category: "workshop",
    location: "AMC Workshop, Indiranagar",
    time: "10:00 AM – 1:00 PM",
    blurb: "Drop-in build session — gliders and rubber-powered planes. Walk in curious, walk out with something that flies.",
  },
  {
    id: "drone-cohort",
    date: "2026-07-19",
    title: "Drone Pilot Training — New Cohort",
    category: "training",
    location: "AMC Flying Field, Bengaluru",
    time: "9:00 AM onward",
    blurb: "Weekend cohort kicks off — from first hover to confident FPV flight.",
  },
  {
    id: "inter-school-champs",
    date: "2026-07-25",
    endDate: "2026-07-26",
    title: "Inter-School Aeromodelling Championship",
    category: "competition",
    location: "KIADB Grounds, Bengaluru",
    time: "All day",
    blurb: "Schools across Bengaluru compete in glider distance, RC precision and drone racing events.",
  },
  {
    id: "summer-camp-batch3",
    date: "2026-08-03",
    endDate: "2026-08-07",
    title: "Summer Flying Camp — Batch 3",
    category: "camp",
    location: "AMC Campus, Bengaluru",
    time: "2 hrs/day",
    blurb: "Five days of building, flying and friendly competition for ages 6–14.",
  },
  {
    id: "independence-flyin",
    date: "2026-08-15",
    title: "Independence Day Fly-In",
    category: "event",
    location: "Community Park, Indiranagar",
    time: "7:30 AM – 10:00 AM",
    blurb: "Open fly-in for the community — bring your own aircraft or fly one of ours.",
  },
  {
    id: "cambridge-stem",
    date: "2026-08-22",
    title: "School STEM Workshop — Cambridge School",
    category: "workshop",
    location: "Cambridge School, Bengaluru",
    time: "Full school day",
    blurb: "Curriculum-aligned aeromodelling and drone modules delivered on campus.",
  },
  {
    id: "fpv-meetup",
    date: "2026-09-05",
    title: "FPV Racing Meetup",
    category: "competition",
    location: "AMC Flying Field, Bengaluru",
    time: "4:00 PM – 7:00 PM",
    blurb: "Casual timed races for FPV pilots of every skill level. Spectators welcome.",
  },
];
