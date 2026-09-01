/**
 * @doc Public legal & company pages (terms, privacy, refund, contact, about).
 * These used to redirect to Chat, which is a soft-404 for crawlers and a dead
 * end for users who need policy information before paying. Content here is
 * factual and descriptive only — no invented guarantees or legal claims.
 */
import { Link, useLocation } from "react-router-dom";
import SEOHead from "@/components/common/SEOHead";

interface Section {
  heading: string;
  body: string[];
}

interface LegalDoc {
  path: string;
  title: string;
  description: string;
  intro: string;
  sections: Section[];
}

const SUPPORT_EMAIL = "support@megsyai.com";

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  terms: {
    path: "/terms",
    title: "Terms of Service",
    description:
      "The terms that apply when you use Megsy AI, including account rules, acceptable use, subscriptions and account termination.",
    intro:
      "These terms describe how Megsy AI may be used. By creating an account or using the service you agree to them.",
    sections: [
      {
        heading: "Your account",
        body: [
          "You need an account to use most of Megsy. You are responsible for keeping your credentials safe and for the activity that happens under your account.",
          "You must be legally able to enter into an agreement in your country to use the service.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "Do not use Megsy to break the law, to attack or overload the service, to bypass usage limits or billing, or to generate content that harms other people.",
          "Automated scraping, credential sharing, and reselling access without a written agreement are not permitted.",
        ],
      },
      {
        heading: "Plans, credits and usage limits",
        body: [
          "Paid plans include monthly usage allowances. Some features consume credits, and some models are limited to specific plans. Current limits are shown on the pricing page and inside your account.",
          "Limits are enforced by our servers. Attempting to circumvent them may result in suspension.",
        ],
      },
      {
        heading: "AI-generated content",
        body: [
          "Model output can be inaccurate or incomplete. Review results before relying on them, especially for legal, medical, financial or safety-critical decisions.",
          "You are responsible for how you use the output you generate.",
        ],
      },
      {
        heading: "Changes and termination",
        body: [
          "We may update the service and these terms. Material changes are announced in the app or by email.",
          "You may stop using Megsy and delete your account at any time from your account settings. We may suspend accounts that violate these terms.",
        ],
      },
      {
        heading: "Contact",
        body: [`Questions about these terms: ${SUPPORT_EMAIL}`],
      },
    ],
  },
  privacy: {
    path: "/privacy",
    title: "Privacy Policy",
    description:
      "How Megsy AI collects, uses, stores and protects your data, including chats, files, account information and third-party processors.",
    intro:
      "This page explains what data Megsy collects, why it is collected, and the control you have over it.",
    sections: [
      {
        heading: "Data we collect",
        body: [
          "Account data: email address, authentication identifiers, and profile details you provide.",
          "Product data: conversations, prompts, uploaded files, generated media, skills, memory entries and settings you create in the app.",
          "Technical data: request logs, usage counters, error reports and security events needed to operate and protect the service.",
          "Billing data: subscription status and transaction records. Card details are handled by our payment provider, not stored by Megsy.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To deliver the features you request, apply plan limits and credits, provide support, detect abuse, and improve reliability and safety.",
        ],
      },
      {
        heading: "Processors and model providers",
        body: [
          "Prompts and files you submit may be sent to the AI model provider needed to fulfil the request, and to infrastructure providers used for hosting, storage, authentication and payments.",
          "Integrations you connect yourself (for example calendars or third-party tools) receive only the data required for the actions you trigger.",
        ],
      },
      {
        heading: "Retention and deletion",
        body: [
          "Conversations, files and memories stay until you delete them or delete your account. Some records — such as billing history and security logs — are retained where required for accounting or fraud prevention.",
          "You can delete individual items, export or clear data from Settings, and delete your account from Settings.",
        ],
      },
      {
        heading: "Security",
        body: [
          "Access to your data is restricted per user at the database level, transport is encrypted, and privileged operations are authorised server-side.",
          "No system is perfectly secure. Report suspected vulnerabilities to " + SUPPORT_EMAIL + ".",
        ],
      },
      {
        heading: "Your rights",
        body: [
          `Depending on where you live you may request access, correction, export or deletion of your personal data. Contact ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
  refund: {
    path: "/refund",
    title: "Refund Policy",
    description:
      "How refunds, cancellations and billing issues are handled for Megsy AI subscriptions and credit purchases.",
    intro:
      "This page describes how cancellations and refund requests are handled.",
    sections: [
      {
        heading: "Cancelling a subscription",
        body: [
          "You can cancel at any time from Settings → Billing. Cancellation stops the next renewal; your plan stays active until the end of the period you already paid for.",
          "Pausing is offered as an alternative to cancelling where available.",
        ],
      },
      {
        heading: "Refund requests",
        body: [
          `Refund requests are reviewed case by case. Email ${SUPPORT_EMAIL} from your account address with the transaction date and the reason for the request.`,
          "Requests are more likely to be approved when the subscription was charged in error, was a duplicate charge, or when the paid features could not be delivered.",
        ],
      },
      {
        heading: "Consumed usage",
        body: [
          "Credits and usage already consumed (generated images, videos, research runs, chat usage) cannot be restored after a refund is issued.",
        ],
      },
      {
        heading: "Processing",
        body: [
          "Approved refunds are returned through the original payment method by our payment provider. Bank processing time depends on your issuer.",
        ],
      },
    ],
  },
  about: {
    path: "/about",
    title: "About Megsy AI",
    description:
      "Megsy AI is an AI workspace for chat, research, media generation, skills and connected tools.",
    intro:
      "Megsy AI is an AI workspace that brings chat, deep research, media generation, skills and connected tools into a single product.",
    sections: [
      {
        heading: "What Megsy does",
        body: [
          "Chat with modern AI models, run multi-step deep research with sources, generate images and video, build reusable skills, and connect tools through integrations — from one interface on desktop and mobile.",
        ],
      },
      {
        heading: "How it is built",
        body: [
          "Megsy runs on a modern web stack with a managed Postgres backend. Access control, usage limits and credit accounting are enforced on the server, not in the browser.",
        ],
      },
      {
        heading: "Contact",
        body: [`For support, partnerships or press: ${SUPPORT_EMAIL}`],
      },
    ],
  },
  contact: {
    path: "/contact",
    title: "Contact Megsy AI",
    description:
      "Get in touch with the Megsy AI team for support, billing questions, security reports or partnership enquiries.",
    intro: "We read every message sent to our support address.",
    sections: [
      {
        heading: "Support",
        body: [
          `General help, bugs and account issues: ${SUPPORT_EMAIL}`,
          "Include your account email and a description of what you expected versus what happened.",
        ],
      },
      {
        heading: "Billing",
        body: [
          `Subscription, invoice and refund questions: ${SUPPORT_EMAIL} — see the refund policy for what to include.`,
        ],
      },
      {
        heading: "Security",
        body: [
          `Report a suspected vulnerability to ${SUPPORT_EMAIL} with steps to reproduce. Please do not share details publicly before we respond.`,
        ],
      },
    ],
  },
};

const LegalPage = ({ slug }: { slug: keyof typeof LEGAL_DOCS }) => {
  const doc = LEGAL_DOCS[slug];
  const location = useLocation();

  return (
    <>
      <SEOHead title={doc.title} description={doc.description} path={doc.path || location.pathname} />
      <main className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-16">
          <Link
            to="/chat"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to Megsy
          </Link>

          <header className="mt-6">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{doc.title}</h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">{doc.intro}</p>
          </header>

          <div className="mt-10 space-y-9">
            {doc.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-lg font-semibold tracking-tight">{section.heading}</h2>
                <div className="mt-3 space-y-3">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <footer className="mt-14 border-t border-border pt-6 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Link className="hover:text-foreground" to="/terms">Terms</Link>
              <Link className="hover:text-foreground" to="/privacy">Privacy</Link>
              <Link className="hover:text-foreground" to="/refund">Refunds</Link>
              <Link className="hover:text-foreground" to="/contact">Contact</Link>
              <Link className="hover:text-foreground" to="/about">About</Link>
              <Link className="hover:text-foreground" to="/pricing">Pricing</Link>
            </div>
          </footer>
        </div>
      </main>
    </>
  );
};

export default LegalPage;
