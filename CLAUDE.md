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
│       ├── users/route.ts               # GET/POST/PATCH/DELETE users
│       ├── feedback/route.ts            # POST feedback (Airtable)
│       ├── admin/refresh/route.ts       # POST force store re-sync
│       ├── health/route.ts              # GET health check
│       └── tmp/[id]/route.ts            # GET temp file proxy
├── components/
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
│   └── users.ts                    # User management (Airtable-backed)
├── types/
│   └── index.ts                    # All TypeScript interfaces
└── middleware.ts                    # Auth middleware
```

## Airtable Schema

**Base ID:** `appYFl5MvR7VeL0uB`

| Table | ID | Key Fields |
|-------|-----|------------|
| Projets | `tbl0Pij0JqZFD9Ijr` | `Projet`, `Project ref`, `PM (manual)`, `Statut`, `Phase`, `Client link`, `Devis signe` (attachment) |
| Tasks | `tbl63pL1r1ArbEY88` | `Name`, `Done`, `Projets` (link), `Due date`, `Priority`, `Type`, `PM` (lookup) |
| COGS (Depenses) | `tblnrqX6xNx5EWFsC` | `Statut de la depense`, `Projet` (link), `Ressource` (link), `Montant HT engage (prod)`, `Facture` (attachment), `Numero de facture` |
| Ressources | `tblgwh9bP5Piz32SL` | `Name`, `Email`, `Categorie`, `Blacklist` |
| Clients | `tblquwXMfnSWP3syD` | `Client` |
| App user | `tblGJI7r6LpcFbqZQ` | `Name`, `Login`, `Password`, `Type` (PM/DA/Admin), `Matching` |
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
- Scope filters on Tasks page: "Mes projets" (all project tasks) / "Mes tasks" (only assigned to me)

## 4 Modules

### 1. Projects (`src/app/page.tsx`)
- Compact list view with search bar and statut tabs
- Columns: Code, Client, Projet, Phase, Statut, BU, Next Task, Date
- Sliding side panel (480px) with: team, budget, devis signe (PJ), task list with inline creation, COGS list with status coloring
- Marking a task done triggers ForceNewTaskModal

### 2. Tasks (`src/app/tasks/page.tsx`)
- **Tabs**: A faire (count) / En retard (count, red) / Terminées (count)
- **Scope toggle**: "Mes projets" / "Mes tasks"
- **Filters**: type pills, date pills (overdue/today/week/no date/specific date), project dropdown
- **Views**: List view (default) / Calendar view (week/month)
- Inline task creation bar (auto-assigns project if filtered)
- Inline date editing (click on date), inline name editing
- Right-click context menu: duplicate/delete
- Marking done triggers ForceNewTaskModal (only if no remaining tasks on project)

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
- Side panel: montants, resource info, facture attachment, editable N° facture + commentaire
- Right-click context menu: duplicate/delete
- New expense modal with resource search

### 5. Resources (`src/app/ressources/page.tsx`)
- Directory of external resources (freelancers, providers)
- Search and category filtering

### 6. Admin (`src/app/admin/page.tsx`)
- **User management**: CRUD for App user table (Name, Login, Role, Matching, Password)
- **Feedback checklist**: list of all feedback with category badges, done checkboxes
- Admin-only (requires Admin role)

### 7. Changelog (`src/app/changelog/page.tsx`)
- Static page with versioned release notes
- `RELEASES` array: add new entry at top, increment version by .01
- Timeline UI with dots and version badges

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
- Date formatting: always use local date components (getFullYear/getMonth/getDate), never `toISOString().split('T')[0]` (causes timezone J+1 bug)
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
- **UserRole**: 'Admin' | 'PM' | 'DA'

### Task types (for calendar coloring)
Brief, Call client, Email client, Demande float, Shooting, Delivery, Envoi retroplanning, Task interne, Contact presta, Check, Prez, COGS, Matos, Retour presta, Casting VO, Casting acteur, Prepa Tournage, Call presta, Calendar
