import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";

import RegistrationForm from "./components/RegistrationForm.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import PrestigeWhiteMeadowsForm from "./components/PrestigeWhiteMeadowsForm.jsx";
import StoreLandingPage from "./pages/StoreLandingPage.jsx";
import HomePage from "./pages/HomePage.jsx";

// The standalone product-catalog page has been retired in favor of the
// storefront's own inline shop section (id="shop"). Old /shop links —
// including category deep-links like /shop?category=gliders — still resolve,
// just onto the storefront instead of a separate page.
function ShopRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: "/", search: location.search, hash: "shop" }}
      replace
    />
  );
}

// Legacy shell for the summer-camp / admin experience. Keeps its warm cream
// theme via `.theme-camp` so the new storefront can stay sky-white.
function Shell({ children, societyName = "Palm Meadows Aeromodelling Camp" }) {
  return (
    <div className="theme-camp min-h-full flex flex-col">
      <main className="flex-1 flex flex-col items-center px-4 py-8 sm:py-12">
        {children}
      </main>
      <footer className="text-center text-xs text-slate-500 py-6">
        <Link to="/" className="hover:text-brand-600">Home</Link>
        <span className="mx-2">·</span>
        <span>{societyName}</span>
        <span className="mx-2">·</span>
        <a
          href="https://www.airmodelcrafts.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand-600"
        >
          Air Model Crafts
        </a>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StoreLandingPage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/shop" element={<ShopRedirect />} />
      <Route
        path="/camp"
        element={
          <Shell>
            <RegistrationForm />
          </Shell>
        }
      />
      <Route
        path="/admin"
        element={
          <Shell>
            <AdminDashboard />
          </Shell>
        }
      />
      <Route
        path="/prestige-white-meadows"
        element={
          <Shell societyName="Prestige White Meadows Aeromodelling Camp">
            <PrestigeWhiteMeadowsForm />
          </Shell>
        }
      />
    </Routes>
  );
}
