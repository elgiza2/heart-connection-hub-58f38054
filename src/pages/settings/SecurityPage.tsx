/** @doc Security overview — sessions, MFA, recovery codes. */
// Security — Amber/Gold "The Vault" redesign.
import { m as motion } from "framer-motion";
import LandingNavbar from "@/components/landing/LandingNavbar";
import { lazy, Suspense } from "react";
import { LazyOnVisible } from "@/components/common/LazyOnVisible";
const LandingFooter = lazy(() => import("@/components/landing/LandingFooter"));
import SEOHead from "@/components/common/SEOHead";
import {
  Lock,
  Server,
  Eye,
  FileCheck,
  AlertTriangle,
  Globe,
  Key,
  Shield,
  ShieldCheck,
} from "lucide-react";

const practices = [
  {
    icon: Lock,
    title: "Encryption",
    desc: "TLS 1.3 in transit and AES-256 at rest. API keys are hashed with bcrypt.",
  },
  {
    icon: Server,
    title: "Infrastructure",
    desc: "SOC 2 cloud infra with automated backups, multi-region redundancy, 99.9% uptime SLA.",
  },
  {
    icon: Key,
    title: "Authentication",
    desc: "Industry-standard auth, optional 2FA, secure sessions, automatic expiration.",
  },
  {
    icon: Eye,
    title: "Access control",
    desc: "RBAC across systems. Least-privilege enforced. All access is logged.",
  },
  {
    icon: FileCheck,
    title: "Compliance",
    desc: "GDPR and CCPA compliant. Regular privacy impact assessments and DPAs.",
  },
  {
    icon: AlertTriangle,
    title: "Incident response",
    desc: "24/7 monitoring. Documented plan, <1 hour response, 72h GDPR notice.",
  },
  {
    icon: Globe,
    title: "Data residency",
    desc: "Export anytime. Full deletion upon account closure within 30 days.",
  },
  {
    icon: Shield,
    title: "Responsible AI",
    desc: "Content safety filters, harmful content detection, regular bias audits.",
  },
];

const SecurityPage = () => (
  <div className="amber-settings min-h-dvh">
    <SEOHead
      title="Security"
      description="Learn about Megsy AI's security practices, data protection, encryption, and compliance commitments. Your data safety is our priority."
      path="/security"
    />
    <LandingNavbar />

    <section>
    <section className="max-w-5xl mx-auto px-5 pt-24 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="amb-hero"
      >
        <div className="amb-hero-inner flex flex-col items-center text-center">
          <div className="amb-emblem">
            <ShieldCheck className="w-7 h-7" strokeWidth={2.2} />
          </div>
          <p className="amb-eyebrow text-[13px]">The Vault</p>
          <h1 className="amb-display text-4xl sm:text-6xl leading-[1.02] font-semibold mt-2">
            Security &{" "}
            <span className="amb-gold-text italic">Trust.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[color:var(--amb-cream-dim)]">
            Your data security is foundational to everything we build. Here's
            how we protect your creative work and personal information.
          </p>
          <div className="amb-rule w-40 mt-6" />
        </div>
      </motion.div>
    </section>

    <section className="max-w-5xl mx-auto px-5 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {practices.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.04 }}
            className="amb-plate p-6"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="amb-icon-capsule">
                <p.icon className="w-5 h-5" strokeWidth={2} />
              </div>
              <h2 className="amb-display text-lg font-semibold text-[color:var(--amb-cream)]">
                {p.title}
              </h2>
            </div>
            <p className="text-[14px] leading-relaxed text-[color:var(--amb-cream-dim)]">
              {p.desc}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mt-10 amb-plate-strong p-8 text-center"
      >
        <p className="amb-mono mb-2">Coordinated disclosure</p>
        <h2 className="amb-display text-2xl font-semibold mb-2 text-[color:var(--amb-cream)]">
          Report a{" "}
          <span className="amb-gold-text italic">vulnerability</span>
        </h2>
        <p className="text-[13.5px] mb-5 text-[color:var(--amb-cream-dim)]">
          If you discover a vulnerability, please report it responsibly.
        </p>
        <a href="mailto:security@megsyai.com" className="amb-btn-gold">
          security@megsyai.com
        </a>
      </motion.div>
    </section>
    </section>

    <LazyOnVisible minHeight={320} rootMargin="600px"><Suspense fallback={<div style={{ minHeight: 320 }} />}><LandingFooter /></Suspense></LazyOnVisible>
  </div>
);

export default SecurityPage;
