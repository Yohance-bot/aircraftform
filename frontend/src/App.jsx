import { Routes, Route, Link } from "react-router-dom";

import RegistrationForm from "./components/RegistrationForm.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import PrestigeWhiteMeadowsForm from "./components/PrestigeWhiteMeadowsForm.jsx";
import WhatsAppOAuthCallback from "./components/WhatsAppOAuthCallback.jsx";

function Shell({ children, societyName = "Palm Meadows Aeromodelling Camp" }) {
  return (
    <div className="min-h-full flex flex-col">
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
      <Route
        path="/"
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
