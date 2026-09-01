import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { m as motion, AnimatePresence } from "framer-motion";
import { translateExactText, useUserLang } from "@/lib/authI18n";

const CookieConsent = () => {
  const lang = useUserLang();
  const tx = (text: string) => translateExactText(text, lang);
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const accepted = localStorage.getItem("megsy_cookies_accepted");
    if (!accepted) {
      const isMobileLanding =
        typeof window !== "undefined" &&
        window.innerWidth < 768 &&
        /^\/(en|ar|ar-eg|es|fr|de|pt|it|tr|ru|zh|ja|ko|hi|id|nl|sv|cs|ro|el|uk|he|fa|vi|th|pl)?\/?$/.test(
          window.location.pathname,
        );
      if (isMobileLanding) {
        const onScroll = () => {
          if (window.scrollY > window.innerHeight * 0.9) {
            setVisible(true);
            window.removeEventListener("scroll", onScroll);
          }
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
      }
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleChoice = (choice: string) => {
    localStorage.setItem("megsy_cookies_accepted", choice);
    setVisible(false);
  };

  // Hide on chat/workspace surfaces where it would overlap the mobile composer.
  const path = location.pathname;
  const isAppSurface =
    path === "/" ||
    path.startsWith("/chat") ||
    path.startsWith("/settings") ||
    path.startsWith("/billing") ||
    path.startsWith("/workspace") ||
    path.startsWith("/operator") ||
    path.startsWith("/research");
  if (isAppSurface) return null;


  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="cookie-card"
          role="dialog"
          aria-label={tx("Cookie preferences")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="50"
            height="50"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            id="cookieSvg"
          >
            <g>
              <path
                d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"
                fill="rgb(97, 81, 81)"
              />
              <path d="M8.5 8.5v.01" />
              <path d="M16 15.5v.01" />
              <path d="M12 12v.01" />
              <path d="M11 17v.01" />
              <path d="M7 14v.01" />
            </g>
          </svg>

          <p className="cookieHeading">{tx("Cookies")}</p>
          <p className="cookieDescription">
            {tx("We use cookies to keep Megsy reliable and improve your experience.")}{" "}
            <a href="https://privacy.megsyai.com" target="_blank" rel="noopener noreferrer">
              {tx("Learn more about our cookie policy")}
            </a>
            .
          </p>

          <div className="buttonContainer">
            <button className="acceptButton" onClick={() => handleChoice("true")}>
              {tx("Accept")}
            </button>
            <button className="declineButton" onClick={() => handleChoice("declined")}>
              {tx("Decline")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsent;
