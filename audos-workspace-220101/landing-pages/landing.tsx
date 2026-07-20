import React, { useState, useEffect } from 'react';

import { AlertCircle, ArrowRight, CheckCircle2, GraduationCap, Menu, Radar, Target, X } from 'lucide-react';
import { createRoot } from 'react-dom/client';

const Fallback = (props: any) => <section data-stub-component="Fallback">{props.children}</section>;


// Fallback wrapper to prevent crashes from missing icons
const IconFallback = ({ icon: Icon, fallback: Fallback = AlertCircle, ...props }) => {
  if (!Icon) {
    console.warn('Icon component is undefined, using fallback');
    return <Fallback {...props} />;
  }
  try {
    return <Icon {...props} />;
  } catch (e) {
    console.error('Icon render failed:', e);
    return <Fallback {...props} />;
  }
};

// Create safe icon components for potentially non-existent icons
const createSafeIcon = (IconComponent, iconName) => {
  if (typeof IconComponent === 'undefined') {
    console.warn(`Icon "${iconName}" not found, using AlertCircle as fallback`);
    return AlertCircle;
  }
  return IconComponent;
};

const ProductEntry = (props: any) => <section data-stub-component="ProductEntry">{props.children}</section>;

// === CONFIGURATION ===
const WORKSPACE_BRAND_NAME = 'Scout & Alma';
const WORKSPACE_TAGLINE =
  'Where students and universities connect smarter.';
const WORKSPACE_PRIMARY_COLOR = '#31a1b4';
const WORKSPACE_HIGHLIGHT_COLOR = '#e32626';
const WORKSPACE_CONTRAST_COLOR = '#07bb8e';
const WORKSPACE_FONT_FAMILY =
  '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const WORKSPACE_SURFACE_PAGE = '#f2fbfd';
const WORKSPACE_BORDER_COLOR = '#c7eff7';
const WORKSPACE_BORDER_STRONG_COLOR = '#a8e7f2';
const WORKSPACE_TEXT_PRIMARY = '#00343d';
const WORKSPACE_TEXT_SECONDARY = '#006375';
const WORKSPACE_TEXT_MUTED = '#008198';
const WORKSPACE_TEXT_ON_PRIMARY = '#000000';
const WORKSPACE_TEXT_ON_HIGHLIGHT = '#000000';
const WORKSPACE_EDITORIAL_BG = '#F9F9F9';
const WORKSPACE_SPACE_URL = '/space/workspace-220101';

const STUDENT_SIGNUP_URL = `${WORKSPACE_SPACE_URL}?role=student&auth=signup`;
const UNIVERSITY_SIGNUP_URL = `${WORKSPACE_SPACE_URL}?role=university&auth=signup`;
const STUDENT_SURVEY_URL = `${WORKSPACE_SPACE_URL}?app=student-survey`;
const UNIVERSITY_SURVEY_URL = `${WORKSPACE_SPACE_URL}?app=university-survey`;
const LOGIN_URL = `${WORKSPACE_SPACE_URL}?auth=login`;
const SIGNUP_URL = `${WORKSPACE_SPACE_URL}?auth=signup`;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function colorWithAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

// === NAVIGATION ===
function Navigation() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileNavOpen(false);
  };

  return (
    <header
      className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b"
      style={{ borderColor: WORKSPACE_BORDER_COLOR }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="#hero" className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-base font-bold"
            style={{ backgroundColor: WORKSPACE_PRIMARY_COLOR, color: WORKSPACE_TEXT_ON_PRIMARY }}
          >
            {WORKSPACE_BRAND_NAME.charAt(0)}
          </span>
          <span className="font-semibold text-base" style={{ color: WORKSPACE_TEXT_PRIMARY }}>
            {WORKSPACE_BRAND_NAME}
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          <button type="button" onClick={() => scrollTo('students-section')} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: WORKSPACE_TEXT_MUTED }}>Students</button>
          <button type="button" onClick={() => scrollTo('universities-section')} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: WORKSPACE_TEXT_MUTED }}>Universities</button>
          <button type="button" onClick={() => scrollTo('how-it-works')} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: WORKSPACE_TEXT_MUTED }}>How it works</button>
          <button type="button" onClick={() => scrollTo('faq-section')} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: WORKSPACE_TEXT_MUTED }}>FAQ</button>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <a href={LOGIN_URL} className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors" style={{ borderColor: WORKSPACE_BORDER_COLOR, color: WORKSPACE_TEXT_PRIMARY }}>Log In</a>
          <a href={SIGNUP_URL} className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors" style={{ backgroundColor: WORKSPACE_PRIMARY_COLOR, color: WORKSPACE_TEXT_ON_PRIMARY }}>Sign Up</a>
        </div>

        <button type="button" className="md:hidden p-2 rounded-lg" onClick={() => setMobileNavOpen((v) => !v)} aria-label="Menu">
          {mobileNavOpen ? <X className="w-5 h-5" style={{ color: WORKSPACE_TEXT_PRIMARY }} /> : <Menu className="w-5 h-5" style={{ color: WORKSPACE_TEXT_PRIMARY }} />}
        </button>
      </div>

      {mobileNavOpen && (
        <div className="md:hidden border-t px-4 py-4 space-y-3" style={{ borderColor: WORKSPACE_BORDER_COLOR, backgroundColor: 'white' }}>
          <button type="button" onClick={() => scrollTo('students-section')} className="block w-full text-left py-2 text-sm font-medium" style={{ color: WORKSPACE_TEXT_PRIMARY }}>Students</button>
          <button type="button" onClick={() => scrollTo('universities-section')} className="block w-full text-left py-2 text-sm font-medium" style={{ color: WORKSPACE_TEXT_PRIMARY }}>Universities</button>
          <button type="button" onClick={() => scrollTo('how-it-works')} className="block w-full text-left py-2 text-sm font-medium" style={{ color: WORKSPACE_TEXT_PRIMARY }}>How it works</button>
          <button type="button" onClick={() => scrollTo('faq-section')} className="block w-full text-left py-2 text-sm font-medium" style={{ color: WORKSPACE_TEXT_PRIMARY }}>FAQ</button>
          <div className="flex gap-2 pt-2">
            <a href={LOGIN_URL} className="flex-1 py-2.5 text-sm font-medium rounded-lg border text-center" style={{ borderColor: WORKSPACE_BORDER_COLOR, color: WORKSPACE_TEXT_PRIMARY }}>Log In</a>
            <a href={SIGNUP_URL} className="flex-1 py-2.5 text-sm font-semibold rounded-lg text-center" style={{ backgroundColor: WORKSPACE_PRIMARY_COLOR, color: WORKSPACE_TEXT_ON_PRIMARY }}>Sign Up</a>
          </div>
        </div>
      )}
    </header>
  );
}

// === HERO ===
function Hero() {
  return (
    <section className="px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]" style={{ color: WORKSPACE_TEXT_PRIMARY, fontFamily: WORKSPACE_FONT_FAMILY }}>
          Find the university that&apos;s genuinely right for you
        </h1>
        <p className="mt-6 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed" style={{ color: WORKSPACE_TEXT_SECONDARY, fontFamily: WORKSPACE_FONT_FAMILY }}>
          Conversational AI that understands your goals, budget, and priorities — then matches you with universities that actually fit.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href={STUDENT_SIGNUP_URL} className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all hover:opacity-90" style={{ backgroundColor: WORKSPACE_PRIMARY_COLOR, color: WORKSPACE_TEXT_ON_PRIMARY }}>
            I&apos;m a Student <ArrowRight className="w-4 h-4" />
          </a>
          <a href={UNIVERSITY_SIGNUP_URL} className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 border transition-all hover:bg-white" style={{ borderColor: WORKSPACE_BORDER_COLOR, color: WORKSPACE_TEXT_PRIMARY, backgroundColor: 'white' }}>
            I&apos;m a University <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

// === SCOUT SECTION (For Students) ===
function ScoutSection() {
  return (
    <section id="students-section" className="px-4 sm:px-6 py-20 bg-white">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ backgroundColor: colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.1), color: WORKSPACE_PRIMARY_COLOR }}>
            <GraduationCap className="w-3.5 h-3.5" /> For Students
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: WORKSPACE_TEXT_PRIMARY, fontFamily: WORKSPACE_FONT_FAMILY }}>
            Meet Scout — conversational AI for university research
          </h2>
          <p className="mt-4 text-base leading-relaxed" style={{ color: WORKSPACE_TEXT_SECONDARY }}>
            Personalised university matching with Dream, Target, and Safe tiering. Conversational — not forms. A persistent chat that learns what matters to you.
          </p>
          <ul className="mt-6 space-y-3">
            {['Personalised university matching', 'Dream / Target / Safe tiering', 'Conversational intake — not forms', 'Persistent chat that remembers your goals'].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm" style={{ color: WORKSPACE_TEXT_MUTED }}>
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: WORKSPACE_PRIMARY_COLOR }} />{item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <a href={STUDENT_SURVEY_URL} className="px-6 py-3 rounded-xl font-semibold text-sm border text-center" style={{ borderColor: WORKSPACE_BORDER_COLOR, color: WORKSPACE_TEXT_PRIMARY }}>Take the student survey</a>
            <a href={STUDENT_SIGNUP_URL} className="px-6 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2" style={{ backgroundColor: WORKSPACE_PRIMARY_COLOR, color: WORKSPACE_TEXT_ON_PRIMARY }}>Start with Scout <ArrowRight className="w-4 h-4" /></a>
          </div>
        </div>
        <div className="rounded-2xl border p-6 shadow-sm" style={{ borderColor: WORKSPACE_BORDER_COLOR, backgroundColor: WORKSPACE_SURFACE_PAGE }}>
          <div className="space-y-3">
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-white border" style={{ borderColor: WORKSPACE_BORDER_COLOR, color: WORKSPACE_TEXT_PRIMARY }}>Hi there — I&apos;m Scout. What subjects or fields excite you most?</div>
            <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm ml-8" style={{ backgroundColor: WORKSPACE_PRIMARY_COLOR, color: WORKSPACE_TEXT_ON_PRIMARY }}>Computer science and environmental studies — ideally somewhere with strong research opportunities.</div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-white border" style={{ borderColor: WORKSPACE_BORDER_COLOR, color: WORKSPACE_TEXT_PRIMARY }}>Great choices. I&apos;m building your shortlist — 3 universities matched so far…</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// === ALMA SECTION (For Universities) ===
function AlmaSection() {
  return (
    <section id="universities-section" className="px-4 sm:px-6 py-20" style={{ backgroundColor: WORKSPACE_SURFACE_PAGE }}>
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div className="order-2 md:order-1 rounded-2xl border p-6 shadow-sm bg-white" style={{ borderColor: WORKSPACE_BORDER_COLOR }}>
          <div className="space-y-3">
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm border" style={{ borderColor: WORKSPACE_BORDER_COLOR, color: WORKSPACE_TEXT_PRIMARY }}>Hi — I&apos;m Alma. Which programs are you actively trying to fill?</div>
            <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm ml-8" style={{ backgroundColor: WORKSPACE_HIGHLIGHT_COLOR, color: WORKSPACE_TEXT_ON_HIGHLIGHT }}>Postgraduate STEM programs — targeting students from Southeast Asia and India.</div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm border" style={{ borderColor: WORKSPACE_BORDER_COLOR, color: WORKSPACE_TEXT_PRIMARY }}>I&apos;ve found 5 intent-qualified prospects matched to your programs…</div>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ backgroundColor: colorWithAlpha(WORKSPACE_HIGHLIGHT_COLOR, 0.12), color: WORKSPACE_HIGHLIGHT_COLOR }}>
            <Radar className="w-3.5 h-3.5" /> For Universities
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: WORKSPACE_TEXT_PRIMARY, fontFamily: WORKSPACE_FONT_FAMILY }}>
            Meet Alma — reach students who are actively deciding
          </h2>
          <p className="mt-4 text-base leading-relaxed" style={{ color: WORKSPACE_TEXT_SECONDARY }}>
            Access intent-qualified student profiles matched to your programs. Data consent built in from day one.
          </p>
          <ul className="mt-6 space-y-3">
            {['Intent-qualified student profiles', 'Matched to your specific programs', 'Data consent built in', 'Personalised outreach strategies'].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm" style={{ color: WORKSPACE_TEXT_MUTED }}>
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: WORKSPACE_HIGHLIGHT_COLOR }} />{item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <a href={UNIVERSITY_SURVEY_URL} className="px-6 py-3 rounded-xl font-semibold text-sm border bg-white text-center" style={{ borderColor: WORKSPACE_BORDER_COLOR, color: WORKSPACE_TEXT_PRIMARY }}>Take the university survey</a>
            <a href={UNIVERSITY_SIGNUP_URL} className="px-6 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2" style={{ backgroundColor: WORKSPACE_HIGHLIGHT_COLOR, color: WORKSPACE_TEXT_ON_HIGHLIGHT }}>Get started with Alma <ArrowRight className="w-4 h-4" /></a>
          </div>
        </div>
      </div>
    </section>
  );
}

// === SOCIAL PROOF ===
function SocialProof() {
  return (
    <section className="px-4 sm:px-6 py-16 bg-white text-center">
      <p className="text-sm font-medium uppercase tracking-wide" style={{ color: WORKSPACE_TEXT_MUTED }}>Trusted by students exploring universities worldwide</p>
      <p className="mt-3 text-2xl font-semibold" style={{ color: WORKSPACE_TEXT_PRIMARY }}>Join students from 40+ countries</p>
      <p className="mt-2 text-sm" style={{ color: WORKSPACE_TEXT_MUTED }}>Making better university decisions with AI-powered matching</p>
    </section>
  );
}

// === HOW IT WORKS ===
function HowItWorks() {
  return (
    <section id="how-it-works" className="px-4 sm:px-6 py-20" style={{ backgroundColor: WORKSPACE_SURFACE_PAGE }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold" style={{ color: WORKSPACE_TEXT_PRIMARY, fontFamily: WORKSPACE_FONT_FAMILY }}>How it works</h2>
          <p className="mt-3 text-base max-w-2xl mx-auto" style={{ color: WORKSPACE_TEXT_MUTED }}>
            One platform, two experiences — Scout for students discovering their fit, Alma for universities reaching aligned prospects.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="p-6 rounded-2xl bg-white border" style={{ borderColor: WORKSPACE_BORDER_COLOR }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ backgroundColor: colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.1), color: WORKSPACE_PRIMARY_COLOR }}>
              <GraduationCap className="w-3.5 h-3.5" /> Scout — for students
            </div>
            <ol className="space-y-4">
              {[
                { title: 'Tell Scout what matters', desc: 'A short conversational intake about your goals, budget, locations, and priorities — not a long form.' },
                { title: 'Get a ranked shortlist', desc: 'Universities matched to your profile with honest reasoning behind each recommendation.' },
                { title: 'Refine and decide', desc: 'Keep chatting with Scout to compare options until you are confident in your choice.' },
              ].map((item, i) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.12), color: WORKSPACE_PRIMARY_COLOR }}>{i + 1}</span>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: WORKSPACE_TEXT_PRIMARY }}>{item.title}</p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: WORKSPACE_TEXT_MUTED }}>{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="p-6 rounded-2xl bg-white border" style={{ borderColor: WORKSPACE_BORDER_COLOR }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ backgroundColor: colorWithAlpha(WORKSPACE_HIGHLIGHT_COLOR, 0.12), color: WORKSPACE_HIGHLIGHT_COLOR }}>
              <Radar className="w-3.5 h-3.5" /> Alma — for universities
            </div>
            <ol className="space-y-4">
              {[
                { title: 'Share your recruiting brief', desc: 'Tell Alma which programs you are filling, target regions, and enrollment priorities.' },
                { title: 'Review matched prospects', desc: 'Access student profiles aligned to your programs — with fit scores and clear reasoning.' },
                { title: 'Connect with confidence', desc: 'Reach out to intent-qualified students with personalised outreach, consent built in.' },
              ].map((item, i) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: colorWithAlpha(WORKSPACE_HIGHLIGHT_COLOR, 0.12), color: WORKSPACE_HIGHLIGHT_COLOR }}>{i + 1}</span>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: WORKSPACE_TEXT_PRIMARY }}>{item.title}</p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: WORKSPACE_TEXT_MUTED }}>{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

// === FAQ ===
function FAQSection() {
  return (
    <section id="faq-section" className="px-4 sm:px-6 py-20 bg-white">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-10" style={{ color: WORKSPACE_TEXT_PRIMARY, fontFamily: WORKSPACE_FONT_FAMILY }}>Frequently asked questions</h2>

        <h3 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: WORKSPACE_TEXT_MUTED }}>FAQ: For Students</h3>
        <div className="space-y-4 mb-10">
          {[
            { q: 'What is Scout?', a: "Scout is a conversational AI — like ChatGPT, but built specifically for university search. You tell Scout your goals, budget, location preferences, program interests, and must-haves. It builds you a personalised shortlist of universities that genuinely fit — including ones you've never heard of that might be the best match for your specific program." },
            { q: 'Is Scout free?', a: 'Yes — completely free for every student, everywhere, always. No subscriptions, no unlocks, no hidden fees.' },
            { q: 'How is this different from rankings and university directories?', a: "Rankings tell you who's well-known. Scout tells you who's the best fit for YOU — including universities that are world-class for a specific program but not globally famous. It also surfaces your profile strengths and weaknesses so you know where you stand." },
            { q: 'What if I already have universities in mind?', a: "Great — Scout works with your existing list. Mark schools as Dream, Target, or Safe and Scout will help you build around them, filling gaps and flagging better-fit options you might have missed." },
          ].map((item) => (
            <details key={item.q} className="group rounded-xl border p-5" style={{ borderColor: WORKSPACE_BORDER_COLOR }}>
              <summary className="font-semibold text-sm cursor-pointer list-none flex items-center justify-between gap-4" style={{ color: WORKSPACE_TEXT_PRIMARY }}>
                {item.q}
                <span className="text-lg leading-none group-open:rotate-45 transition-transform" style={{ color: WORKSPACE_TEXT_MUTED }}>+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: WORKSPACE_TEXT_MUTED }}>{item.a}</p>
            </details>
          ))}
        </div>

        <h3 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: WORKSPACE_TEXT_MUTED }}>FAQ: For Universities</h3>
        <div className="space-y-4">
          {[
            { q: 'What is Alma?', a: 'Alma gives universities access to students who are actively searching right now. Instead of broad recruitment campaigns, you see matched profiles of students whose goals, program interests, budget, and preferences genuinely align with what you offer.' },
            { q: 'How do universities pay?', a: 'Universities pay a monthly or annual subscription for access to matched student profiles. You can start with departmental access (one program or department) or go full-university (all departments, at a discount).' },
            { q: 'What makes this different from university fairs or social ads?', a: "University fairs are expensive and broad. Social ads can't target students at the moment of decision — students don't publicly signal intent on LinkedIn or Instagram. Every student on Scout is actively deciding right now. That intent signal is something no other channel can replicate." },
            { q: 'Is student data handled with consent?', a: 'Yes. Students explicitly opt in for their profiles to be visible to universities. No student data is shared without their permission.' },
          ].map((item) => (
            <details key={item.q} className="group rounded-xl border p-5" style={{ borderColor: WORKSPACE_BORDER_COLOR }}>
              <summary className="font-semibold text-sm cursor-pointer list-none flex items-center justify-between gap-4" style={{ color: WORKSPACE_TEXT_PRIMARY }}>
                {item.q}
                <span className="text-lg leading-none group-open:rotate-45 transition-transform" style={{ color: WORKSPACE_TEXT_MUTED }}>+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: WORKSPACE_TEXT_MUTED }}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// === FOOTER ===
function Footer() {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <footer className="border-t py-12 px-4" style={{ borderColor: WORKSPACE_BORDER_COLOR, backgroundColor: WORKSPACE_SURFACE_PAGE }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold"
                style={{ backgroundColor: WORKSPACE_PRIMARY_COLOR, color: WORKSPACE_TEXT_ON_PRIMARY }}
              >
                {WORKSPACE_BRAND_NAME.charAt(0)}
              </span>
              <span className="font-semibold" style={{ color: WORKSPACE_TEXT_PRIMARY }}>{WORKSPACE_BRAND_NAME}</span>
            </div>
            <p className="text-sm max-w-xs" style={{ color: WORKSPACE_TEXT_MUTED }}>{WORKSPACE_TAGLINE}</p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm" style={{ color: WORKSPACE_TEXT_MUTED }}>
            <button type="button" onClick={() => scrollTo('students-section')} className="hover:opacity-70">Students</button>
            <button type="button" onClick={() => scrollTo('universities-section')} className="hover:opacity-70">Universities</button>
            <button type="button" onClick={() => scrollTo('how-it-works')} className="hover:opacity-70">How it works</button>
            <button type="button" onClick={() => scrollTo('faq-section')} className="hover:opacity-70">FAQ</button>
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
        <p className="text-xs mt-8" style={{ color: WORKSPACE_TEXT_MUTED }}>© {new Date().getFullYear()} Scout & Alma. All rights reserved.</p>
      </div>
    </footer>
  );
}

// === MAIN COMPONENT ===
export default function LandingPage() {
  useEffect(() => {
    const existingLink = document.querySelector<HTMLLinkElement>('link[href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"]');
    if (!existingLink) {
      const link = document.createElement('link');
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    document.title = WORKSPACE_BRAND_NAME;
  }, []);

  return (
    <div className="min-h-screen" style={{ fontFamily: WORKSPACE_FONT_FAMILY, backgroundColor: WORKSPACE_EDITORIAL_BG }}>
      <Navigation />
      <Hero />
      <ScoutSection />
      <AlmaSection />
      <SocialProof />
      <HowItWorks />
      <FAQSection />
      <Footer />
    </div>
  );
}

// === ROOT RENDER ===
function Root() {
  return <LandingPage />;
}

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<Root />);
