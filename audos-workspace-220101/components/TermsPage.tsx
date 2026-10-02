import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

const sections = [
  {
    title: '1. Acceptance of these Terms',
    paragraphs: [
      'These Terms of Service (the “Terms”) govern your access to and use of Scout & Alma, including our websites, applications, artificial intelligence features, and related services (collectively, the “Service”). By accessing or using the Service, you agree to these Terms. If you do not agree, do not use the Service.',
      'If you use the Service on behalf of a university, company, or other organisation, you confirm that you have authority to bind that organisation to these Terms.',
    ],
  },
  {
    title: '2. Who may use the Service',
    paragraphs: [
      'You must be legally able to enter into these Terms. If you are under the age at which you can consent to online services in your country, a parent or legal guardian must review and agree to these Terms for you.',
      'You must provide accurate information and keep your account credentials secure. You are responsible for activity under your account and must notify us promptly if you believe it has been accessed without permission.',
    ],
  },
  {
    title: '3. What Scout & Alma provides',
    paragraphs: [
      'Scout helps students explore and compare education opportunities. Alma helps universities identify and engage prospective students who may align with their programmes. Features may include conversational guidance, matching, shortlists, profile tools, surveys, and communications.',
      'The Service supports research and decision-making, but it does not provide legal, financial, immigration, admissions, or other professional advice. Matches, rankings, generated text, and other AI-assisted outputs may be incomplete or inaccurate and should be independently checked. We do not guarantee admission, enrolment, funding, recruitment outcomes, or that any institution or student will be a suitable match.',
    ],
  },
  {
    title: '4. Acceptable use',
    paragraphs: [
      'You may use the Service only for lawful purposes and in accordance with these Terms. You must not misuse the Service, interfere with its operation, attempt to gain unauthorised access, introduce malicious code, scrape or harvest data without permission, impersonate another person, infringe intellectual-property or privacy rights, submit deceptive information, or use the Service to discriminate unlawfully, harass, exploit, or harm others.',
      'Universities and other organisations are responsible for ensuring that their use of student information, outreach, selection processes, and communications complies with applicable privacy, equality, marketing, and education laws.',
    ],
  },
  {
    title: '5. Your content and data',
    paragraphs: [
      'You retain ownership of information and materials you submit to the Service (“Your Content”). You grant us a worldwide, non-exclusive, royalty-free licence to host, process, reproduce, and display Your Content only as needed to operate, secure, improve, and provide the Service.',
      'You confirm that you have the rights and permissions needed to submit Your Content. Our collection and use of personal information is described in our Privacy Policy. Students control whether profile information is made available to universities where the Service offers that choice.',
    ],
  },
  {
    title: '6. Our content and intellectual property',
    paragraphs: [
      'The Service, including its software, design, branding, and content provided by Scout & Alma, is owned by us or our licensors and is protected by intellectual-property laws. Subject to these Terms, we grant you a limited, revocable, non-exclusive, non-transferable right to use the Service for its intended purpose.',
      'You may not copy, sell, sublicense, reverse engineer, or create derivative works from the Service except where applicable law expressly permits it. If you provide feedback, you allow us to use it without restriction or compensation.',
    ],
  },
  {
    title: '7. Third-party services and content',
    paragraphs: [
      'The Service may link to or work with third-party websites, institutions, tools, and content. We do not control or endorse third-party services and are not responsible for their availability, accuracy, security, or practices. Your use of a third-party service may be governed by separate terms.',
    ],
  },
  {
    title: '8. Paid services',
    paragraphs: [
      'Some features may require payment. Before a purchase, we will show the applicable price, billing period, and material payment terms. You authorise the stated charges and are responsible for applicable taxes. Additional purchase, renewal, cancellation, or refund terms presented at checkout form part of these Terms.',
    ],
  },
  {
    title: '9. Availability, changes, and termination',
    paragraphs: [
      'We may update, suspend, or discontinue parts of the Service, including to maintain security, comply with law, or improve features. We do not promise that the Service will always be uninterrupted or error-free.',
      'You may stop using the Service at any time. We may restrict or terminate access if you materially breach these Terms, create risk or harm, or where required by law. Provisions that by their nature should survive termination will remain in effect.',
    ],
  },
  {
    title: '10. Disclaimers',
    paragraphs: [
      'To the fullest extent permitted by law, the Service is provided “as is” and “as available”. We disclaim implied warranties, including merchantability, fitness for a particular purpose, non-infringement, and any warranty arising from course of dealing. Nothing in these Terms excludes rights or warranties that cannot legally be excluded.',
    ],
  },
  {
    title: '11. Limitation of liability',
    paragraphs: [
      'To the fullest extent permitted by law, Scout & Alma and its affiliates, officers, employees, and suppliers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, revenue, data, goodwill, or opportunities arising from or related to the Service.',
      'Where liability cannot be excluded, our total liability for claims arising from or related to the Service will not exceed the greater of the amount you paid us for the Service in the 12 months before the event giving rise to the claim or £100. These limitations do not apply where prohibited by law, including liability that cannot lawfully be limited.',
    ],
  },
  {
    title: '12. Changes to these Terms',
    paragraphs: [
      'We may update these Terms from time to time. We will post the revised Terms and update the effective date. If a change is material, we will provide reasonable notice where required. Continuing to use the Service after the revised Terms take effect means you accept them.',
    ],
  },
  {
    title: '13. General',
    paragraphs: [
      'If any provision of these Terms is found unenforceable, the remaining provisions remain in effect. Our failure to enforce a provision is not a waiver. You may not transfer these Terms without our consent; we may transfer them as part of a reorganisation, financing, merger, acquisition, or sale of assets.',
      'These Terms, together with any additional terms presented for a specific feature or purchase, form the entire agreement between you and Scout & Alma concerning the Service.',
    ],
  },
  {
    title: '14. Contact',
    paragraphs: [
      'If you have questions about these Terms, contact Scout & Alma through the support channel provided in the Service.',
    ],
  },
];

export default function TermsPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Terms of Service | Scout & Alma';
    window.scrollTo(0, 0);
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{
        color: 'var(--space-text-primary, #0e2d32)',
        background: 'var(--space-surface-page, #f5fafb)',
        fontFamily: 'var(--space-font-body, system-ui, -apple-system, sans-serif)',
      }}
    >
      <header
        className="sticky top-0 z-10 border-b backdrop-blur-md"
        style={{
          borderColor: 'var(--space-border-default, #d2eaef)',
          background: 'color-mix(in srgb, var(--space-surface-card, #ffffff) 95%, transparent)',
        }}
      >
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5 font-semibold">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
              style={{
                background: 'var(--space-brand-primary, #31a1b4)',
                color: 'var(--space-text-on-primary, #111827)',
              }}
            >
              S
            </span>
            Scout & Alma
          </a>
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--space-text-secondary, #1a5761)' }}
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <article
          className="rounded-2xl border p-6 shadow-sm sm:p-10"
          style={{
            borderColor: 'var(--space-border-default, #d2eaef)',
            background: 'var(--space-surface-card, #ffffff)',
          }}
        >
          <p
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--space-text-muted, #22717e)' }}
          >
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Terms of Service</h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--space-text-secondary, #1a5761)' }}>
            Effective date: 2 September 2026
          </p>

          <div className="mt-10 space-y-9">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold">{section.title}</h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-7"
                      style={{ color: 'var(--space-text-secondary, #1a5761)' }}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>

      <footer
        className="border-t px-4 py-8 text-sm"
        style={{
          borderColor: 'var(--space-border-default, #d2eaef)',
          color: 'var(--space-text-secondary, #1a5761)',
          background: 'var(--space-surface-muted, #fbfdfe)',
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 sm:px-2">
          <span>© {new Date().getFullYear()} Scout & Alma. All rights reserved.</span>
          <a href="/" className="hover:opacity-70">Home</a>
        </div>
      </footer>
    </div>
  );
}
