import { Link } from "react-router-dom";

const LOGO_SRC = "/aeromodelling%20logo.gif";

/**
 * AMC company logo (animated GIF from public/).
 * `variant` is kept for API compatibility with the footer;
 * the asset is the same in both contexts.
 */
export default function Logo({ variant = "dark", className = "" }) {
  void variant;
  return (
    <Link
      to="/"
      className={`group inline-flex items-center ${className}`}
      aria-label="AMC Airmodelcrafts home"
    >
      <img
        src={LOGO_SRC}
        alt="AMC Airmodelcrafts"
        className="h-11 w-auto transition-transform duration-300 group-hover:-translate-y-0.5 sm:h-12"
      />
    </Link>
  );
}
