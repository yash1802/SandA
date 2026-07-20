# Scout & Alma — Workspace Memory

Durable context for this workspace. Read this before any branding, landing page, survey, copy, or app build.

## Brand / Naming (locked)
- **Product name:** Scout & Alma (formerly "Unilink" — DO NOT use Unilink anywhere).
- **Scout** = the student-facing side (formerly "Fit Shortlist" — that old name is dead).
- **Alma** = the university-facing side (formerly "Prospect Radar" — that old name is dead).
- One platform, two sides. Common framing line to use on both audiences: it is **one platform that is both a conversational AI and a marketplace** connecting students and universities.

## How to frame Scout to STUDENTS (important)
- Do **NOT** describe Scout as an "AI advisor." Describe it as a **conversational AI** (like ChatGPT, Gemini, Claude).
- The benefit is **NOT the shortlist**. The shortlist alone provides nothing.
- The real student benefits are:
  1. A **research tool** for exploring universities.
  2. **Making their profiles visible to a multitude of universities** (getting their profile pitched/seen by many universities).
- De-emphasize "personalised shortlist" framing in all student-facing copy.

## How to frame Alma to UNIVERSITIES
- Alma = recruitment platform giving universities access to a database of students who are **actively comparing universities right now**, with fit scores, targeted outreach, and engagement tracking.

## Landing page "How it works"
- Each side must reference ONLY its own product: student flow says **Scout**, university flow says **Alma**. Do NOT label the university flow "Scout & Alma."
- The "Follow on LinkedIn" URL was wrong/broken — do NOT invent a LinkedIn URL. Leave it removed until the user provides the correct one.

## Surveys
- **Two SEPARATE shareable links** (not a combined chooser).
- Public, no login gate — surveys live outside/before login.
- Audience-first titles (avoid "university" in the student survey title and "student" in the university survey title — it was confusing).
- Identification fields are **OPTIONAL, never mandatory**:
  - Students: Name, Email, Country.
  - Universities: Name, Email, Institution/University, Department/College — plus a note that **universities who complete it get a discount** when Alma launches.
- University pricing question is **open-ended** (no preset values).
- Student survey options include conversational AI (ChatGPT etc.) and the multi-select reaction options reframed away from shortlist-first.
- University survey: add LinkedIn as a recruitment channel option + a follow-up on how they do direct outreach.

## Working notes
- Landing page and mini-apps are generated **platform-side** (not editable files in the local workspace dir). Use the landing-page / app subagents and platform file reader.
- `workspace-branding.json` is the canonical source the landing page rebuilds from — keep it in sync with the above.
