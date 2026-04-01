'use client'

import { Clock } from 'lucide-react'

interface Release {
  version: string
  date: string
  changes: string[]
}

const RELEASES: Release[] = [
  {
    version: '1.08',
    date: '01/04/2026',
    changes: [
      'Vue calendrier (semaine / mois) sur les Tasks avec drag & drop',
      'Filtre date specifique sur les Tasks',
      'Compteurs dynamiques A faire / En retard / Terminees selon le scope',
    ],
  },
  {
    version: '1.07',
    date: '01/04/2026',
    changes: [
      'Filtres "Mes projets" et "Mes tasks" sur la page Tasks',
      'Suppression du filtre "Tout"',
    ],
  },
  {
    version: '1.06',
    date: '01/04/2026',
    changes: [
      'Gestion des utilisateurs via Airtable (table App user)',
      'Champs Login / Matching / Password editables en admin',
      'Authentification basee sur le champ Login',
    ],
  },
  {
    version: '1.05',
    date: '01/04/2026',
    changes: [
      'Systeme de feedback / bug report / feature request',
      'Bouton feedback dans la sidebar',
      'Checklist feedback visible en admin',
      'Stockage des feedbacks dans Airtable',
    ],
  },
  {
    version: '1.04',
    date: '31/03/2026',
    changes: [
      'Colonne BU dans la liste projets',
      'Indicateurs KPI : projets sans tasks, tasks en retard',
      'Selecteur calendrier (DatePicker) pour creation de task',
      'Correction bug timezone calendrier (J+1)',
    ],
  },
  {
    version: '1.03',
    date: '31/03/2026',
    changes: [
      'Modification inline du nom de task',
      'Duplication de task avec assignee et projet',
      'ForceNewTaskModal conditionnel (uniquement si aucune task restante)',
      'Correction overflow sur les selects inline',
    ],
  },
  {
    version: '1.02',
    date: '31/03/2026',
    changes: [
      'Bouton de suppression individuel sur les fichiers joints (COGS)',
      'Numero de commande (BDC) visible en badge indigo',
      'Filtres ressource et categorie sur les COGS',
      'Bouton sync Airtable',
    ],
  },
  {
    version: '1.01',
    date: '31/03/2026',
    changes: [
      'Version initiale du projet',
      'Modules Projets, Tasks, COGS, Ressources',
      'Authentification par nom PM',
      'Synchronisation in-memory avec Airtable',
      'Upload de fichiers vers Airtable',
    ],
  },
]

export default function ChangelogPage() {
  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Changelog</h1>
        <p className="text-sm text-gray-500 mt-1">
          Historique des mises a jour de Peech PM
        </p>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[18px] top-2 bottom-0 w-px bg-gray-200" />

        <div className="space-y-8">
          {RELEASES.map((release, i) => (
            <div key={release.version} className="relative pl-12">
              {/* Timeline dot */}
              <div className={`absolute left-2 top-1 w-4 h-4 rounded-full border-2 ${
                i === 0 ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
              }`} />

              {/* Version header */}
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-lg font-bold ${i === 0 ? 'text-indigo-600' : 'text-gray-800'}`}>
                  v{release.version}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  {release.date}
                </span>
                {i === 0 && (
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded-full uppercase tracking-wider">
                    Derniere
                  </span>
                )}
              </div>

              {/* Changes list */}
              <ul className="space-y-1.5">
                {release.changes.map((change, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
