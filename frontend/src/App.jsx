import { Routes, Route, Link, useSearchParams } from "react-router-dom";

import RegistrationForm from "./components/RegistrationForm.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import PrestigeWhiteMeadowsForm from "./components/PrestigeWhiteMeadowsForm.jsx";
import WhatsAppOAuthCallback from "./components/WhatsAppOAuthCallback.jsx";
import HomePage from "./pages/HomePage.jsx";
import ShopPage from "./pages/ShopPage.jsx";

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

// At "/", a Meta OAuth redirect arrives with ?code= / ?error=. Preserve the
// WhatsApp onboarding callback there; otherwise show the new storefront.
function HomeRoute() {
  const [searchParams] = useSearchParams();
  if (searchParams.get("code") || searchParams.get("error")) {
    return (
      <Shell>
        <WhatsAppOAuthCallback />
      </Shell>
    );
  }
  return <HomePage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/shop" element={<ShopPage />} />
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
        path="/admin/whatsapp-callback"
        element={
          <Shell>
            <WhatsAppOAuthCallback />
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
