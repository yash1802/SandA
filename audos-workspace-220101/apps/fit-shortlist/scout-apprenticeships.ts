import { NewProgram, ScoutStore, webSearch } from './scout-store';
import { CountryResidency, normalizeIntakeEligibility } from './scout-types';

export interface ApprenticeshipDiscoveryResult {
  attempted: boolean;
  added: number;
  note: string;
}

const AGGREGATOR_HOSTS = /(?:indeed|glassdoor|linkedin|ziprecruiter|simplyhired|talent\.com|jooble|careerjet|facebook|instagram)\./i;
const SEARCH_INTENT = /\b(find|search|recommend|discover|show|match|programme|program|apprentice|options)\b/i;

function cleanTitle(title: string): string {
  return title
    .replace(/\s+[|–—-]\s+(careers?|jobs?|apply|home).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function companyFromTitle(title: string, host: string): string {
  const parts = title.split(/\s+[|–—-]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1].replace(/\b(careers?|jobs?)\b/gi, '').trim();
  return host.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function eligibleResidencies(store: ScoutStore): CountryResidency[] {
  const normalized = normalizeIntakeEligibility(store.intake);
  return (normalized.citizenshipCountries || []).filter(
    (entry) => entry.status === 'citizen' || entry.status === 'permanent_resident'
  );
}

function localTerm(code: string): string {
  if (code === 'GB') return 'degree apprenticeship';
  if (code === 'US') return 'registered apprenticeship';
  if (code === 'CA') return 'apprenticeship program';
  if (code === 'AU' || code === 'NZ') return 'apprenticeship traineeship';
  if (code === 'DE' || code === 'AT' || code === 'CH') return 'dual study apprenticeship';
  return 'apprenticeship programme';
}

export async function discoverEligibleApprenticeships(
  message: string,
  store: ScoutStore
): Promise<ApprenticeshipDiscoveryResult> {
  const normalized = normalizeIntakeEligibility(store.intake);
  if (!normalized.apprenticeshipOptIn || !SEARCH_INTENT.test(message)) {
    return { attempted: false, added: 0, note: '' };
  }

  const residencies = eligibleResidencies(store);
  if (!residencies.length) {
    return {
      attempted: true,
      added: 0,
      note:
        'You opted into apprenticeships, but you have not listed citizenship or permanent residency in an eligible country. Most schemes require local work or residency rights, so I have not shown irrelevant overseas apprenticeships. I can still search university programmes for you.',
    };
  }

  const currentYear = new Date().getFullYear();
  const subjects = String(normalized.answers.majors || 'your preferred field').trim();
  const existing = new Set(
    store.programs.map((program) => String(program.website || '').replace(/\/$/, '').toLowerCase()).filter(Boolean)
  );
  const discovered: NewProgram[] = [];

  for (const residency of residencies) {
    const query = `${subjects} ${localTerm(residency.country_code)} ${residency.country_name} applications open ${currentYear} ${currentYear + 1} official employer careers`;
    let hits: Awaited<ReturnType<typeof webSearch>> = [];
    try {
      hits = await webSearch(query, 10);
    } catch {
      continue;
    }

    for (const hit of hits) {
      if (discovered.filter((item) => item.country_code === residency.country_code).length >= 5) break;
      const link = String(hit.link || '').trim();
      const title = cleanTitle(String(hit.title || ''));
      const snippet = String(hit.snippet || '').trim();
      if (!link || !title || !/^https?:\/\//i.test(link)) continue;
      let host = '';
      try {
        host = new URL(link).hostname;
      } catch {
        continue;
      }
      if (AGGREGATOR_HOSTS.test(host)) continue;
      const key = link.replace(/\/$/, '').toLowerCase();
      if (existing.has(key) || discovered.some((item) => item.website?.replace(/\/$/, '').toLowerCase() === key)) continue;
      const staleYears = (snippet.match(/\b20\d{2}\b/g) || []).map(Number);
      if (staleYears.length && Math.max(...staleYears) < currentYear) continue;
      const company = companyFromTitle(String(hit.title || ''), host);
      discovered.push({
        university: company,
        company_name: company,
        program_name: title,
        degree_type: 'Apprenticeship',
        program_type: 'apprenticeship',
        country_code: residency.country_code,
        country_name: residency.country_name,
        location: residency.country_name,
        website: link,
        summary: snippet || `Current ${localTerm(residency.country_code)} opportunity found on the employer's live website.`,
        eligibility_notes: `Surfaced because you are a ${residency.status === 'citizen' ? 'citizen' : 'permanent resident'} of ${residency.country_name}. Confirm role-specific age, education and right-to-work requirements on the source page.`,
        active_status: /\b(apply|applications?\s+(?:are\s+)?open|deadline|vacanc|recruit)/i.test(`${title} ${snippet}`)
          ? 'active'
          : 'uncertain',
        last_seen_active: new Date().toISOString(),
        fit_reasons: [
          {
            title: `Eligible country: ${residency.country_name}`,
            detail: `Your ${residency.status === 'citizen' ? 'citizenship' : 'permanent residency'} makes this a locally relevant scheme to investigate.`,
          },
          {
            title: 'Live source',
            detail: `Scout found this on the current ${host} result for ${currentYear}/${currentYear + 1}; use the source page to confirm the latest closing date.`,
          },
        ],
      });
    }
  }

  if (!discovered.length) {
    return {
      attempted: true,
      added: 0,
      note: `I searched current apprenticeship listings across ${residencies.map((entry) => entry.country_name).join(', ')}, but did not find a new official listing I could verify as current. I left older and aggregator-only results out rather than lowering recommendation quality.`,
    };
  }

  const added = await store.addPrograms(discovered);
  return {
    attempted: true,
    added,
    note: `I also searched live apprenticeship listings across ${residencies.map((entry) => entry.country_name).join(', ')} and added ${added} current scheme${added === 1 ? '' : 's'} from official sources.`,
  };
}
