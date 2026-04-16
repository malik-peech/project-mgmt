'use client'

import { Clock } from 'lucide-react'

interface Release {
  version: string
  date: string
  changes: string[]
}

const RELEASES: Release[] = [
  {
    version: '1.19',
    date: '16/04/2026',
    changes: [
      'Projets – panneau latéral : les tasks du jour cochées restent visibles (cochée + barrée), un second clic permet de décocher si erreur',
      'COGS : bouton vue condensée / vue aérée (persisté en localStorage) pour densifier le tableau sur une seule ligne',
      'COGS : nouvelle colonne Facture dans le tableau avec glisser-déposer de la PJ directement sur la ligne (toute la ligne devient une zone de drop)',
      'COGS : méthode de paiement éditable dans le panneau latéral (Virement / Paypal / CB / Malt / Déjà payé / Process spécifique / Upwork)',
      'COGS : bloc Montants réorganisé HT → TVA → TTC, TVA en € (plus de signe %)',
    ],
  },
  {
    version: '1.18',
    date: '16/04/2026',
    changes: [
      'Non assignés : les projets dont le client est "Peech" (projets internes) sont exclus',
      'Non assignés : nouvel onglet Stand-by (à côté de Sans PM / Sans DA) — les projets en stand-by sont séparés et ne comptent pas dans les compteurs PM/DA ni dans le badge de la sidebar',
    ],
  },
  {
    version: '1.17',
    date: '16/04/2026',
    changes: [
      'Sidebar : nouveau bouton "Non assignés" avec badge ambre du nombre de projets actifs sans PM et/ou sans DA',
      'Modale Non assignés : accessible à tous (sauf Sales-only), filtres Tous / Sans PM / Sans DA, recherche, assignation inline via dropdown',
      'Assignation sauvegardée automatiquement sur Airtable, feedback visuel (spinner + coche verte), la ligne disparaît quand PM et DA sont remplis',
    ],
  },
  {
    version: '1.16',
    date: '16/04/2026',
    changes: [
      'Nouveau module Offboarding (côté PM) pour archiver les projets en statut Done',
      'Sidebar : menu Offboarding avec badge du nombre de projets à offboarder (PM + Admin)',
      'Formulaire offboarding : Frame archivé, Slack archivé, EOP month (linked field), Diffusable ?',
      'Point EOP (Prévu / Done / No need) : si Prévu, champ Date point EOP affiché. Si Done le projet passe en archive',
      'Belle Base : ajout/suppression de livrables (Titre, Vimeo link) directement dans la base externe Belle Base, linké au projet via le sync',
      'Vue Archive pour revenir sur les projets déjà offboardés',
      'Admin : sélecteur PM pour voir la file d\'un autre PM (défaut : tous les PM)',
    ],
  },
  {
    version: '1.15',
    date: '16/04/2026',
    changes: [
      'Sales-only : menu restreint à COGS + Onboarding (plus de Projets / Tasks / Ressources)',
      'Sales-only : redirection auto vers /onboarding si tentative d\'accès à une page bloquée',
      'Les utilisateurs PM/Admin cumulant le rôle Sales gardent leur menu complet',
    ],
  },
  {
    version: '1.14',
    date: '16/04/2026',
    changes: [
      'Fix du lag après modification : les changements (PM, tasks, COGS, onboarding…) apparaissent désormais instantanément sans attendre 5s ni rafraîchir la page',
      'Routes API : remplacement du re-fetch complet Airtable (2-5s) par un patch ciblé du cache en mémoire avec la réponse Airtable',
      'Suppression des headers Cache-Control max-age=5 qui forçaient le navigateur à servir la version périmée',
      'Onboarding : mise à jour optimiste immédiate de la liste et des stats dès le clic Enregistrer',
    ],
  },
  {
    version: '1.13',
    date: '16/04/2026',
    changes: [
      'Nouveau rôle Sales : une personne peut cumuler Sales + PM / Admin (champ Sales d\'Airtable)',
      'Nouvel onglet Onboarding dans la sidebar (visible pour les Sales) avec badge du nombre de projets à onboarder',
      'Page Onboarding : tableau des projets à onboarder (barre de progression par projet) et vue Archive des projets déjà onboardés',
      'Formulaire d\'onboarding en panneau latéral : Mois signature, Currency, Client link (avec création inline), Origine, Agence, Numéro de devis, Devis signé (upload PDF)',
      'Onboarding : budgets COGS / Créa / Prod / DA / Travel, Date de finalisation, Durée contrat, Libellé facture, Contact compta, Type de contact, PM',
      'Admin : peut voir l\'onboarding d\'un autre sales via un sélecteur',
      'Admin : rôle Sales disponible à la création d\'un utilisateur',
    ],
  },
  {
    version: '1.12',
    date: '03/04/2026',
    changes: [
      'Creation de task : assignation automatique a la personne connectee',
      'Compteur tasks en retard (page Projets) : filtre uniquement par Assigne, plus juste',
      'COGS volet : Montant HT engage et TVA editables directement',
      'COGS volet : Qualite (note) sous forme d\'etoiles cliquables (1 a 5)',
      'COGS volet : Qualite (commentaire) editable',
      'COGS volet : suppression du champ BDC envoye',
      'COGS "A completer" : condition basee sur Montant HT, Ressource, TVA, Qualite et Facture',
      'Projets : next task en vert (aujourd\'hui/futur), rouge (en retard), jaune (aucune task)',
      'Projets : colonne Date affiche la date de la prochaine task avec code couleur',
      'Projets : champ BU lit desormais le champ lookup "Bu lookup" d\'Airtable',
    ],
  },
  {
    version: '1.11',
    date: '01/04/2026',
    changes: [
      'Compteur tasks en retard corrige (compte les vraies tasks, pas les projets)',
      'Fix filtre "projets sans task" qui ne fonctionnait pas au clic',
      'Assignee visible sur les tasks dans le panneau projet',
      'Date du jour par defaut a la creation rapide de task (projets + tasks)',
      'Clic sur un COGS dans le projet ouvre la page COGS filtree',
    ],
  },
  {
    version: '1.10',
    date: '01/04/2026',
    changes: [
      'Nouvel onglet "A completer" dans COGS (COGS A payer avec infos manquantes)',
      'Qualite (note/comment), TVA, methode paiement visibles dans le panneau COGS',
      'Vue calendrier respecte les filtres A faire / En retard / Terminees',
      'Page Ressources redesignee : categories prioritaires, photos, grille visuelle',
      'Categories secondaires dans un volet pliable "Autres categories"',
    ],
  },
  {
    version: '1.09',
    date: '01/04/2026',
    changes: [
      'Correction noms clients (affichait des IDs Airtable au lieu des noms)',
      'Calendrier pleine largeur, bloc "Sans date" en bandeau compact',
      'Couleurs distinctes par type et priorite de task',
      'Filtre "Demain" sur les tasks',
      'Creation rapide de task enrichie (projet, type, priorite)',
      'Nouvel onglet Ressources dans la sidebar',
      'Colonnes COGS triables + Montant HT sales ajoute',
    ],
  },
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
