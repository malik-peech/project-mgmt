# Peech PM - Project Management Tool

## Overview
Internal project management tool for **Peech Studio** (production agency). Built with Next.js, backed by **Airtable as the single source of truth**. Deployed on **Coolify** at `pm.peech-newic.com`.

GitHub repo: https://github.com/malik-peech/project-mgmt

## Architecture

### Stack
- **Next.js 16.2.1** with App Router (Turbopack)
- **Tailwind CSS 4.2.2**
- **Airtable API** via `airtable` npm package — all data lives in Airtable
- **NextAuth v4** with Credentials provider (PM name + shared password)
- **Dockerfile** for Coolify deployment (node:20-alpine)

### Performance: In-Memory Store
All Airtable data is cached server-side in RAM (`src/lib/store.ts`):
- On server start, fetches all 5 tables from Airtable into memory
- Background sync every 30s refreshes the store
- API routes read from memory (0ms) instead of calling Airtable
- Writes go to Airtable first, then trigger immediate table re-sync
- Client-side: SWR-like hook (`src/hooks/useData.ts`) with localStorage persistence + stale-while-revalidate

### Data Sanitization
Airtable formula/rollup fields sometimes return `{specialValue: ...}` objects instead of primitives. `src/lib/sanitize.ts` recursively strips these before any JSON response to prevent React error #31.

## Airtable Schema

**Base ID:** `appYFl5MvR7VeL0uB`

| Table | ID | Key Fields |
|-------|-----|------------|
| Projets | `tbl0Pij0JqZFD9Ijr` | `Projet`, `Project réf`, `PM (manual)`, `Statut`, `Phase`, `Client link`, `Devis signé` (attachment) |
| Tasks | `tbl63pL1r1ArbEY88` | `Name`, `Done`, `Projets` (link), `Due date`, `Priority`, `Type`, `PM` (lookup) |
| COGS (Dépenses) | `tblnrqX6xNx5EWFsC` | `Statut de la dépense`, `Projet` (link), `Ressource` (link), `Montant HT engagé (prod)`, `Facture` (attachment), `Numéro de facture` |
| Ressources | `tblgwh9bP5Piz32SL` | `Name`, `Email`, `Catégorie`, `Blacklist` |
| Clients | `tblquwXMfnSWP3syD` | `Client` |

### Important field notes
- PM field is **`PM (manual)`** (singleSelect) — NOT `Project Manager (PM)`
- Projects with Statut "Done" are excluded from default views
- `Project réf` is used as "code projet" throughout the UI
- Lookup fields (Client, PM in Tasks/COGS) return arrays — always access `[0]`
- Attachment fields (Devis signé, Facture) return arrays of `{url, filename, type, size}`

## Authentication
- Auth uses `PM (manual)` field values as usernames
- Shared password via `APP_PASSWORD` env var (default: `peech2024`)
- PM users see only their projects/tasks/COGS
- Admin users (`Malik Goulamhoussen`, `Vanessa Goulamhoussen`) see everything
- PM names list in `src/app/api/auth/[...nextauth]/route.ts`

## 3 Modules

### 1. Projects (`src/app/page.tsx`)
- Compact list view with search bar and statut tabs
- Columns: Code, Client, Projet, Phase, Statut, Next Task, Date
- Sliding side panel (480px) with: team, budget, devis signé (PJ), task list with inline creation, COGS list with status coloring
- Marking a task done triggers ForceNewTaskModal

### 2. Tasks (`src/app/tasks/page.tsx`)
- Todo/Done tabs with search bar
- Pill filters: type, date (overdue/today/week/no date), project
- Inline task creation bar (auto-assigns project if filtered)
- Inline date editing (click on date)
- Right-click context menu: duplicate/delete
- Marking done triggers ForceNewTaskModal

### 3. COGS (`src/app/cogs/page.tsx`)
- Table with search bar, statut pill tabs, project filter
- Click on row opens side panel with full details
- Side panel: montants, resource info, facture attachment, editable N° facture + commentaire
- Right-click context menu: duplicate/delete
- New expense modal with resource search

## Key Components
- `src/components/ForceNewTaskModal.tsx` — Popup when marking task done, forces planning a future task
- `src/components/ContextMenu.tsx` — Reusable right-click menu (discriminated union type)
- `src/components/Sidebar.tsx` — Navigation (Projets, Tasks, COGS) + user info + logout

## Environment Variables
```
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=appYFl5MvR7VeL0uB
NEXTAUTH_SECRET=<random-string>
NEXTAUTH_URL=https://pm.peech-newic.com
APP_PASSWORD=peech2024
```

## Deployment (Coolify)
- Dockerfile-based build (node:20-alpine)
- Health check: `/api/health` on port 3000
- Auto-deploy on push to `main`
- `npm start` uses `PORT` env var (default 3000)

## Conventions
- Use amber/orange for warnings, never red text for UI alerts
- No COGS gauge/progress bars — use colored status pills instead
- Every active project must have a planned future task (enforced via ForceNewTaskModal)
- French UI throughout (`fr-FR` locale for dates and currency)
- Always use `sanitize()` wrapper on API JSON responses
- Use `str()` and `num()` helpers when mapping Airtable fields to handle `{specialValue}` objects
