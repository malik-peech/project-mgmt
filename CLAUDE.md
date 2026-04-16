# Peech PM - Project Management Tool

## Overview
Internal project management tool for **Peech Studio** (production agency). Built with Next.js, backed by **Airtable as the single source of truth**. Deployed on **Coolify** at `pm.peech-newic.com`.

GitHub repo: https://github.com/malik-peech/project-mgmt

## Architecture

### Stack
- **Next.js 16.2.1** with App Router (Turbopack)
- **React 19** + **TypeScript 6**
- **Tailwind CSS 4.2.2** (with `@tailwindcss/postcss`)
- **Airtable API** via `airtable` npm package — all data lives in Airtable
- **NextAuth v4** with Credentials provider (login field + password from Airtable)
- **date-fns 4** for date manipulation (French locale)
- **lucide-react** for icons
- **Dockerfile** for Coolify deployment (node:20-alpine)

### Performance: In-Memory Store
All Airtable data is cached server-side in RAM (`src/lib/store.ts`):
- On server start, fetches all 5 tables from Airtable into memory
- Background sync every **10 minutes** refreshes the store
- API routes read from memory (0ms) instead of calling Airtable
- Writes go to Airtable first, then trigger immediate table re-sync
- Singleton pattern with lazy initialization + Map-based ID lookups for O(1) access
- Client-side: SWR-like hook (`src/hooks/useData.ts`) with localStorage persistence + stale-while-revalidate

### Data Sanitization
Airtable formula/rollup fields sometimes return `{specialValue: ...}` objects instead of primitives. `src/lib/sanitize.ts` recursively strips these before any JSON response to prevent React error #31.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Projects list (main page)
│   ├── tasks/page.tsx              # Tasks module (list + calendar views)
│   ├── cogs/page.tsx               # COGS/expenses module
│   ├── ressources/page.tsx         # Resources directory
│   ├── admin/page.tsx              # Admin panel (users + feedback)
│   ├── onboarding/page.tsx         # Sales onboarding list (à onboarder + archive)
│   ├── offboarding/page.tsx        # PM offboarding list for Done projets (à offboarder + archive)
│   ├── changelog/page.tsx          # Changelog (static, versioned)
│   ├── login/page.tsx              # Login page
│   ├── layout.tsx                  # Root layout
│   ├── error.tsx                   # Error boundary
│   ├── global-error.tsx            # Global error boundary
│   └── api/
│       ├── auth/[...nextauth]/route.ts  # NextAuth config
│       ├── projets/route.ts             # GET/POST projects
│       ├── tasks/route.ts               # GET/POST tasks
│       ├── tasks/[id]/route.ts          # GET/PATCH/DELETE task
│       ├── cogs/route.ts                # GET/POST COGS
│       ├── cogs/[id]/route.ts           # GET/PATCH/DELETE COG
│       ├── cogs/[id]/upload/route.ts    # File upload to Airtable
│       ├── ressources/route.ts          # GET resources
│       ├── onboarding/route.ts          # GET sales projets split by onboarded status
│       ├── onboarding/[id]/route.ts     # PATCH onboarding fields
│       ├── onboarding/[id]/upload/route.ts # POST/DELETE Devis signé attachments
│       ├── offboarding/route.ts         # GET PM Done projets split by offboarded status
│       ├── offboarding/[id]/route.ts    # PATCH offboarding fields (Frame/Slack archive, EOP month, Diffusable, Point EOP)
│       ├── belle-base/route.ts          # GET/POST/DELETE livrables in external Belle Base (appEVRkaM6cM2EeDs)
│       ├── clients/route.ts             # GET list + POST create client (onboarding)
│       ├── mensuel/route.ts              # GET list of Mois signature entries
│       ├── users/route.ts               # GET/POST/PATCH/DELETE users
│       ├── feedback/route.ts            # POST feedback (Airtable)
│       ├── admin/refresh/route.ts       # POST force store re-sync
│       ├── health/route.ts              # GET health check
│       ├── tmp/[id]/route.ts            # GET temp file proxy
│       ├── references/search/route.ts   # GET filtered Belle Base refs (Sales AI assistant backend)
│       └── assistant/chat/route.ts      # POST chat with Claude Haiku 4.5 + search_references tool
├── components/
│   ├── OnboardingPanel.tsx         # Sales onboarding form (side panel with 6 sections + file upload + live progress)
│   ├── OffboardingPanel.tsx        # PM offboarding form (Archivage / Fin de projet / Diffusion / Belle Base)
│   ├── Sidebar.tsx                 # Navigation + user info + feedback modal
│   ├── TaskCalendarView.tsx        # Calendar view (week/month) with drag-drop
│   ├── DatePicker.tsx              # Custom date picker (timezone-safe)
│   ├── ForceNewTaskModal.tsx       # Modal forcing future task on completion
│   ├── ContextMenu.tsx             # Right-click context menu
│   ├── ComboSelect.tsx             # Searchable select dropdown
│   ├── FileViewer.tsx              # Attachment viewer/preview
│   ├── ClientLayout.tsx            # Client-side layout wrapper
│   └── SessionProviderWrapper.tsx  # NextAuth session provider
├── hooks/
│   └── useData.ts                  # SWR-like data hook with localStorage
├── lib/
│   ├── airtable.ts                 # Airtable API client (fetch helpers)
│   ├── store.ts                    # In-memory data store (singleton)
│   ├── sanitize.ts                 # Airtable {specialValue} sanitizer
│   ├── onboarding.ts               # Onboarding required-fields list + missingOnboardingFields()
│   ├── offboarding.ts              # Offboarding required-fields list + missingOffboardingFields()
│   ├── users.ts                    # User management (Airtable-backed)
│   ├── references-store.ts         # RAM cache of Belle Base livrables + Canva/Front join (AI assistant)
│   ├── canva-enrichment.ts         # Loads src/data/canva-enrichment.json, indexes by Vimeo ID
│   └── front-evidence.ts           # Loads src/data/front-evidence.json, indexes by Vimeo ID
├── data/
│   ├── canva-enrichment.json       # Pre-extracted pitch/testimonial/canvaPageUrl per Vimeo ID (committed, gitignored dir forced via -f)
│   └── front-evidence.json         # Pre-aggregated sales send-count per Vimeo ID (currently empty — Front MCP blocked)
├── types/
│   └── index.ts                    # All TypeScript interfaces
└── middleware.ts                    # Auth middleware
```

## Airtable Schema

**Base ID:** `appYFl5MvR7VeL0uB`

| Table | ID | Key Fields |
|-------|-----|------------|
| Projets | `tbl0Pij0JqZFD9Ijr` | `Projet`, `Project ref`, `PM (manual)`, `Sales` (singleSelect), `Statut`, `Phase`, `Client link`, `Mois signature` (linked → Mensuel), `Currency`, `Origine`, `Agence`, `Numéro de devis`, `Devis signé` (attachment), `COGS/Time*/Travel - budget`, `Date de finalisation prévue`, `Durée contrat (mois)`, `Libellé facture`, `Contact compta`, `type de contact` |
| Tasks | `tbl63pL1r1ArbEY88` | `Name`, `Done`, `Projets` (link), `Due date`, `Priority`, `Type`, `PM` (lookup) |
| COGS (Depenses) | `tblnrqX6xNx5EWFsC` | `Statut de la depense`, `Projet` (link), `Ressource` (link), `Montant HT engage (prod)`, `Facture` (attachment), `Numero de facture` |
| Ressources | `tblgwh9bP5Piz32SL` | `Name`, `Email`, `Categorie`, `Blacklist` |
| Clients | `tblquwXMfnSWP3syD` | `Client` |
| Mensuel | `tblJUFh1AceiFNJJe` | `Name` (YYYY-MM) — linked from Projets via `Mois signature` |
| App user | `tblGJI7r6LpcFbqZQ` | `Name`, `Login`, `Password`, `Type` (PM/DA/Admin/**Sales**), `Matching` |
| Feedback | `tbl9xr21gRYnG9XtC` | `Name`, `User`, `Type` (Bug/Feature/Feedback), `Description`, `Done` |

### Important field notes
- PM field is **`PM (manual)`** (singleSelect) — NOT `Project Manager (PM)`
- Projects with Statut "Done" are excluded from default views
- `Project ref` is used as "code projet" throughout the UI
- Lookup fields (Client, PM in Tasks/COGS) return arrays — always access `[0]`
- Attachment fields (Devis signe, Facture) return arrays of `{url, filename, type, size}`
- `Matching` field in App user = the name as it appears in Airtable PM (manual) / DA fields

## Authentication

### User Management (Airtable-backed)
- Users managed in Airtable table `App user` (`tblGJI7r6LpcFbqZQ`)
- **Login** field = what users type to log in
- **Matching** field = name as it appears in Airtable's PM/DA fields (used for filtering)
- **Password** field = plain text (no hashing, internal tool)
- **Type** field = role (PM, DA, Admin)
- `src/lib/users.ts` handles all CRUD with 60-second in-memory cache

### Auth Flow
1. User enters Login + Password on `/login`
2. `authorize()` in NextAuth calls `getUserByLogin()` (async, Airtable)
3. Session `user.name` is set to `matching || name` for downstream filtering
4. Middleware redirects unauthenticated users to `/login`

### Roles & Permissions
- **PM** users see only their projects/tasks/COGS (filtered by `pm === session.user.name`)
- **DA** users see projects where they are DA
- **Admin** users (`Malik Goulamhoussen`, `Vanessa Goulamhoussen`) see everything
- **Sales** users (and PM/Admin who are ALSO in Projets.Sales field) see an additional "Onboarding" menu with their sales projects
- A user can cumulate roles: primary role from `App user.Type` (PM/DA/Admin/Sales) + derived "is sales" flag from `Projets.Sales === user.matching`. Example: Fabien = PM + Sales; Malik = Admin + Sales; Laurine = Sales only.
- Scope filters on Tasks page: "Mes projets" (all project tasks) / "Mes tasks" (only assigned to me)

## 4 Modules

### 1. Projects (`src/app/page.tsx`)
- Compact list view with search bar and statut tabs
- Columns: Code, Client, Projet, Phase, Statut, BU, Next Task, Date (prochaine task)
- Next task colors: **vert** = aujourd'hui ou futur, **rouge** = en retard, **jaune** = aucune task
- BU column: reads `Bu lookup` field (lookup from linked BU table)
- Overdue count badge: filters by `assigneManuel === userName` (not all project tasks)
- Sliding side panel (480px) with: team, budget, devis signe (PJ), task list with inline creation, COGS list with status coloring
- Marking a task done triggers ForceNewTaskModal

### 2. Tasks (`src/app/tasks/page.tsx`)
- **Tabs**: A faire (count) / En retard (count, red) / Terminées (count)
- **Scope toggle**: "Mes projets" (tasks des projets du user) / "Mes tasks" (tasks où Assigné = user)
- **Filters**: type pills, date pills (overdue/today/week/no date/specific date), project dropdown
- **Views**: List view (default) / Calendar view (week/month)
- Inline task creation bar: auto-assign `Assigné` = utilisateur connecté, auto-assign projet si filtré
- Inline date editing (click on date via DatePicker), inline name editing
- Right-click context menu: duplicate/delete
- Marking done triggers ForceNewTaskModal (only if no remaining tasks on project)
- Visibility logic: task remonte si PM du projet = user, OU DA du projet = user, OU `Assigné` = user

### 3. Tasks Calendar (`src/components/TaskCalendarView.tsx`)
- **Week view**: 5-column grid (Mon-Fri), min-h-400px cells, scrollable, up to 50 tasks visible
- **Month view**: 5-column grid, min-h-110px cells, max 4 visible with "+N autres" overflow
- **Drag & drop**: native HTML5 DnD to reschedule tasks between days
- **Unscheduled sidebar**: tasks without dates, accepts drops to unschedule
- **Type-based coloring**: each task type has a unique border-left + background color
- **Task pills**: checkbox (toggle done), name, project ref + client, assignee initials
- Navigation: prev/next, "Aujourd'hui" button, week/month toggle
- Weekends hidden (Saturday/Sunday filtered out)

### 4. COGS (`src/app/cogs/page.tsx`)
- Table with search bar, statut pill tabs, project/resource/category filters
- Click on row opens side panel with full details
- Side panel editable fields: Montant HT engagé, TVA, Qualité note (étoiles 1-5), Qualité commentaire, N° facture, Commentaire
- "À compléter" tab: COGS avec statut "A payer" mais champs incomplets (montantHT + ressource + TVA + qualiteNote + qualiteComment + facture)
- Right-click context menu: duplicate/delete
- New expense modal with resource search

### 5. Resources (`src/app/ressources/page.tsx`)
- Directory of external resources (freelancers, providers)
- Search and category filtering

### 6. Admin (`src/app/admin/page.tsx`)
- **User management**: CRUD for App user table (Name, Login, Role, Matching, Password)
- **Feedback checklist**: list of all feedback with category badges, done checkboxes
- Admin-only (requires Admin role)

### 7. Onboarding (`src/app/onboarding/page.tsx`)
- Visible only to Sales users (role='Sales' or matching name present in `Projets.Sales`)
- Admin sees the menu and can switch to any sales' queue via the top-right selector
- Two tabs backed by a single fetch: **À onboarder** (missing at least one required field) / **Onboardés** (archive, all 18 fields complete)
- Clicking a project opens `OnboardingPanel` — a 640px side panel with all fields grouped into sections (Informations client / Devis / Budgets / Contrat / Facturation / Équipe)
- Live progress bar (0-100%) + missing-field checklist that updates as you type
- "Client" field supports inline creation via `POST /api/clients` (creates a new Client record if it doesn't exist)
- "Mois signature" is a multi-select picker backed by the Mensuel table (linked field on Airtable)
- "Devis signé" upload via `/api/onboarding/[id]/upload` (same tmp-proxy pattern as COGS uploads)
- Required fields (`src/lib/onboarding.ts` / `ONBOARDING_FIELDS`): Mois signature, Currency, Client, Origine, Agence, Numéro de devis, Devis signé, COGS/Time Créa/Travel/Time Prod/Time DA budgets, Date de finalisation prévue, Durée contrat, Libellé facture, Contact compta, Type de contact, PM (manual)

### 8. Offboarding (`src/app/offboarding/page.tsx`)
- Visible for PMs and Admins once they have at least one projet in Statut = Done
- Two tabs: **À offboarder** / **Offboardés** (archive)
- Panel form (`OffboardingPanel.tsx`) with 4 sections:
  - **Archivage** — Frame archivé + Slack archivé checkboxes
  - **Fin de projet** — EOP month (linked → Mensuel) + Point EOP (Prévu/Done/No need)
    - If Point EOP = "Prévu", a Date point EOP date field appears
  - **Diffusion** — Diffusable ? (OK / Interdite / En attente)
  - **Belle Base** — list & create livrables (Titre + Vimeo link) in the external Belle Base (`appEVRkaM6cM2EeDs`, table `Base`). Belle Base has a sync'd Projets table; we match by `Project réf` to resolve the linked record
- Completion rule (→ moves to Archive): Frame + Slack checked, EOP month set, Diffusable set, Point EOP = Done OR No need
- Admin sees all PMs by default and can filter by PM via dropdown

### 9. Changelog (`src/app/changelog/page.tsx`)
- Static page with versioned release notes
- `RELEASES` array: add new entry at top, increment version by .01
- Timeline UI with dots and version badges

### 10. Assistant Sales IA (`src/app/assistant/page.tsx`)
- AI chat to help Sales find the right video references in natural French
- Accessible to: **Sales** (primary role=Sales OR `hasSalesProjects`), **Admin**, **PM+Sales** (same rule as Onboarding: `showAssistant = isSales || isAdmin`)
- Model: **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) via `@anthropic-ai/sdk`
- UI: minimal chat bubbles + suggestions ("Refs 3D pharma", "Motion design banque"…), Enter to send, markdown-ish rendering (linkify URLs, **bold**)
- Conversation state is client-side only (no persistence across sessions — each reload = new chat)
- Requires `ANTHROPIC_API_KEY` env var in Coolify

#### How it works (tool-use loop)
1. User message → `POST /api/assistant/chat` with `{ messages }`
2. Route calls Claude with system prompt (cached via ephemeral cache_control) + tool `search_references`
3. Claude decides to call the tool with filters (industry, style, format, typeProjet, etc.)
4. Server executes `filterReferences(store, filters)` against the in-memory store — **Claude never sees the 3466+ refs**, only the 20 matched ones
5. Tool result returns to Claude; it formulates the final response citing Vimeo links, pitch, testimonial, Canva page URL
6. Loop max 4 tool turns (guard against infinite calls)

#### Cost (prod today)
- ~$0.003–0.008 per user query (input ~2k tok + output ~500 tok, Haiku 4.5 pricing $1/$5 per MTok)
- 500 queries/month ≈ **$2–4/month**

## References enrichment pipeline (data layer for the Assistant)

Each Reference (= a Belle Base livrable) is built by joining **3 data sources** by normalized Vimeo ID (numeric part of the URL, see `normalizeVimeoId()` in `canva-enrichment.ts`):

| Source | Path | What it brings | Loaded how |
|---|---|---|---|
| **Belle Base** (Airtable `appEVRkaM6cM2EeDs`, table `Base`) | `src/lib/references-store.ts` | title, client, industry, style, format, durée, narration, rating, diffusable, year, BU, productType, typeProjet | Direct REST fetch, 10-min sync (like the main store) |
| **Canva** (Peech + Newic decks) | `src/data/canva-enrichment.json` → `canva-enrichment.ts` | `pitch` (narrative commercial), `testimonial` (Trustfolio), `canvaPageUrl`, `canvaCategory`, `canvaDesignTitle` | Static JSON loaded once on first `ensureReferencesStore()` |
| **Front emails** | `src/data/front-evidence.json` → `front-evidence.ts` | `frontEvidence.sentCount`, `firstSentAt`, `lastSentAt`, `recipientDomains`, `senders` | Static JSON, currently empty (see Known issues) |

### Ranking score (`score(r)` in references-store.ts)
- `+50` diffusable ("OK pour diffusion" prefix)
- `+20` has Vimeo URL
- `+5 × rating` (1–5)
- `+3 × creativeQuality` (1–5)
- `+min(year-2020, 5)` recency bonus
- `+15` has Canva pitch (curated sales content)
- `+10` has client testimonial
- `+min(log2(sentCount+1)×4, 20)` Front send-count (log-scaled to avoid domination)

### API endpoint for raw search
`GET /api/references/search?q=&industry=&style=&format=&useCase=&client=&typeProjet=&bu=&minRating=&minCreativeQuality=&diffusableOnly=1&yearFrom=&yearTo=&hasVimeo=1&limit=50`
Returns `{ count, total, lastSync, references: Reference[] }`. Sales-auth gated (like all other API routes).

### Regenerating the Canva JSON
1. The extraction was run **once** via a Claude Code agent in-chat — the agent called MCP `get-design-content` per page, parsed the text for Vimeo URLs + client + pitch + testimonial, and wrote the JSON.
2. To re-sync when the canvases are updated: in a new Claude Code session, spawn a subagent with the same prompt pattern (see git history of commit `5879d0d`). Budget: ~400 MCP calls, ~10 min.
3. Current state: 88 entries from Peech canvas (`DAGzJTSskTg`, pages 7–103 of 111), 0 from Newic canvas (`DAGyGTsyRTc`, 279 pages — not yet extracted, many have no Vimeo anyway).
4. `canva-enrichment.ts` has an `isPlaceholder()` filter that drops entries with `client="Nom du client"` or `pitch="xxxxxxx"` or lorem ipsum.
5. **Known quirk:** Canva text export strips accents (`"Nous avons accompagn"` instead of `"accompagné"`). Claude paraphrases so it's mostly invisible to users.
6. `src/data/` is gitignored but the JSON is committed via `git add -f`.

### Generating the Front evidence JSON (NOT YET WORKING)
- Target: scan outbound emails in inbox `#Hello - Peech` (inbox ID `inb_vsl`) since 2025-01-01, extract Vimeo URLs, aggregate per Vimeo ID.
- **Blocked:** the Front MCP `search_conversations` endpoint returns 404; `list_conversations` ignores the `q` parameter. Full enumeration of 20k conversations exceeds agent budget.
- Front JSON ships empty with `scanMeta.status = "aborted"` and abortReason documented.
- **Follow-up plan:** add `FRONT_API_TOKEN` env var in Coolify → build an admin route that uses Front's REST API directly (`GET /conversations/search/vimeo.com`, paginated, rate-limited). Trigger-able from Admin page, plus a daily cron. Ranking score + chat prompt already wired to consume the data once populated.

## Key Components
- `ForceNewTaskModal.tsx` — Popup when marking task done, forces planning a future task (only if no remaining tasks)
- `ContextMenu.tsx` — Reusable right-click menu (discriminated union type)
- `Sidebar.tsx` — Navigation (Projets, Tasks, COGS, Ressources, Admin) + user info + feedback modal + sync button + logout
- `DatePicker.tsx` — Custom calendar picker with **timezone-safe** date formatting (uses local getFullYear/getMonth/getDate, NOT toISOString which causes J+1 bug in UTC+1/+2)
- `ComboSelect.tsx` — Searchable select with keyboard navigation
- `TaskCalendarView.tsx` — Full calendar component with drag-drop rescheduling

## Environment Variables
```
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=appYFl5MvR7VeL0uB
NEXTAUTH_SECRET=<random-string>
NEXTAUTH_URL=https://pm.peech-newic.com
APP_PASSWORD=peech2024
ANTHROPIC_API_KEY=sk-ant-api03-...   # for /api/assistant/chat (Claude Haiku 4.5)
# FRONT_API_TOKEN=...                # TODO: needed once the Front production sync route lands
```

## Deployment (Coolify)
- **Build Pack: Dockerfile** (NOT Nixpacks — Nixpacks OOMs on small servers)
- Dockerfile: `node:20-alpine`, standard `npm ci && npm run build && npm start`
- Health check: `/api/health` on port 3000
- Auto-deploy on push to `main`
- Dev: `npm run dev` runs on port 5000 (configurable via PORT env)

## Conventions
- Use amber/orange for warnings, never red text for UI alerts
- No COGS gauge/progress bars — use colored status pills instead
- Every active project must have a planned future task (enforced via ForceNewTaskModal)
- French UI throughout (`fr-FR` locale for dates and currency)
- Always use `sanitize()` wrapper on API JSON responses
- Use `str()` and `num()` helpers when mapping Airtable fields to handle `{specialValue}` objects
- Dynamic Tailwind classes must use **explicit full class strings** (not template interpolation like `bg-${color}-50` which gets purged)
- **Date formatting**: ALWAYS use `parseLocalDate(dateStr)` helper — never `new Date("YYYY-MM-DD")` which parses as UTC and causes J-1 display bug in UTC+1/+2. `parseLocalDate` splits the string and calls `new Date(y, m-1, d)` (local time). Defined in `page.tsx` and `tasks/page.tsx`.
- Lookup fields from Airtable always return arrays — access with `[0]`
- **BU field** on projects: reads `Bu lookup` (lookup field from linked BU table), fallback to `BU`
- **Assigné** on tasks: auto-filled with logged-in user name on creation (inline + modal)
- **Overdue count** (Projects page): filters by `assigneManuel === userName` only (not all project tasks)
- **COGS "À compléter"** condition: `montantEngageProd` + `ressourceName` + `tva` + `qualiteNote` + `qualiteComment` + `facture` must all be filled
- **COGS panel editable fields**: montantHT, TVA, qualiteNote (stars), qualiteComment, numeroFacture, commentaire
- **Next task colors** in Projects table: green = today/future, red = overdue, yellow = no task
- Changelog: add new release at top of `RELEASES` array in `src/app/changelog/page.tsx`, increment version by .01

## TypeScript Types (src/types/index.ts)

### Key interfaces
- **Projet**: id, ref, nom, clientName, pm, da, daOfficial, bu, phase, statut, typeProjet, budgets (cogs/time/travel/offre), devisSigne (attachments), taskIds, cogsIds
- **Task**: id, name, done, projetId, projetRef, clientName, assigneManuel, dueDate, priority, type, pm, description
- **Cogs**: id, statut, projetId, projetRef, ressourceName, montantEngageProd, tva, qualiteNote, qualiteComment, facture (attachments), numeroFacture, commentaire
- **Ressource**: id, name, email, categorie[], telephone, iban
- **UserRole**: 'Admin' | 'PM' | 'DA' | 'Sales'
- **Reference** (AI assistant): id, titre, vimeoUrl, clientName, projetRef, year, industry/industries, useCase/useCases, style/mainStyle, format, duree, narration, moodTone, langue, bu, product, typeProjet, rating, creativeQuality, diffusable + Canva fields (pitch, testimonial, canvaCategory, canvaPageUrl, canvaDesignTitle) + frontEvidence sub-object (sentCount, lastSentAt, recipientDomains, senders)

### Task types (for calendar coloring)
Brief, Call client, Email client, Demande float, Shooting, Delivery, Envoi retroplanning, Task interne, Contact presta, Check, Prez, COGS, Matos, Retour presta, Casting VO, Casting acteur, Prepa Tournage, Call presta, Calendar

## Pending work on the Assistant Sales IA

Ordered by value / effort:

1. **Debug the chat response quality** — first user test (query "qu'est-ce qu'on a fait pour SNCF ?") returned a terse answer with NO pitch and NO Canva page URL even though the data exists in the JSON for the matched Vimeo ID `1084252537`. First diagnostic: hit `GET /api/references/search?client=SNCF&limit=5` on prod and inspect whether the returned Reference objects contain `pitch` + `canvaPageUrl`. If yes → tighten system prompt in `src/app/api/assistant/chat/route.ts` to force inclusion. If no → check that `src/data/canva-enrichment.json` is bundled into the Docker image (Dockerfile `COPY . .` should work, but worth verifying `src/data/` is not excluded by `.dockerignore`).
2. **Front production sync** — add `FRONT_API_TOKEN` in Coolify, build `POST /api/admin/sync-front` using Front REST API directly (`GET https://api2.frontapp.com/conversations/search/vimeo.com` with Bearer auth), aggregate per Vimeo ID, write to `src/data/front-evidence.json` OR to a new Airtable table `FrontEvidence` in Belle Base. Daily cron.
3. **Newic canvas extraction** — spawn a subagent to cover pages 1–279 of `DAGyGTsyRTc` with the same logic as Peech. Many pages have no Vimeo (infographics) so net gain likely smaller.
4. **Push Front-only refs into Belle Base** — for Vimeo IDs found in Front but not in Belle Base, auto-create a livrable with status "à tagger" so the team can see what's missing from their official catalog.
5. **Auto-tag Haiku for untagged refs** — batch Claude Haiku 4.5 on Belle Base livrables with empty `industry`/`style`, infer from titre + client + projet context, write back to Airtable. One-shot cost ~$0.50 for 1000 refs.
6. **Admin button to refresh Canva/Front JSON** — manual trigger in `/admin` that spawns the extraction, writes the JSON, and restarts the references store. Only useful once the extraction scripts are production-runnable (today they require a Claude Code session).

### Git history of the feature
- `a965132` — PR1: references store + `/api/references/search` (3466 refs in RAM)
- `41b1b48` — PR3: chat IA `/assistant` + `/api/assistant/chat` (Haiku 4.5 + tool calling + prompt caching) + Sidebar link for Sales/Admin
- `5879d0d` — PR2 + PR4: Canva enrichment (82 Peech entries joined by Vimeo ID) + Front evidence skeleton (empty, MCP blocked)

### Files to touch for future iterations
- Ranking tweaks → `src/lib/references-store.ts` `score()` function
- Chat tone/format → `src/app/api/assistant/chat/route.ts` `SYSTEM_PROMPT`
- Tool filters exposed to Claude → `TOOL_SEARCH_REFERENCES` in same file + corresponding handler in `runSearchReferences()`
- Adding new enrichment source → create `src/lib/<source>-evidence.ts`, add field to `Reference` type, join in `mapLivrable()`, expose in `slim()` + system prompt
