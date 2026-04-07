// ── Projets ──
export type Phase = 'Démarrage' | 'Conception' | 'Production' | 'Last modifs' | 'Done' | 'Archivé'
export type StatutProjet = 'Stand-by' | 'En cours' | 'Finalisation' | 'Done' | 'Tentative' | 'Intention'
export type TypeProjet = 'Live' | '2D' | 'Film' | 'Film scénarisé (acting)' | '3D' | 'Web' | 'Learning' | 'Stock' | 'Adapt' | 'Illustrations' | 'Photo' | 'Podcast' | 'Solo' | 'Duo'

export interface Attachment {
  url: string
  filename: string
  type?: string
  size?: number
}

export interface Projet {
  id: string
  ref?: string
  nom: string
  clientName?: string
  clientId?: string
  agence?: string
  bu?: string
  am?: string
  pm?: string
  pm2?: string
  da?: string
  daOfficial?: string
  pc?: string
  filmmaker?: string
  phase?: Phase
  statut?: StatutProjet
  typeProjet?: TypeProjet
  // Budgets
  cogsBudget?: number
  cogsReels?: number
  cogsPrevus?: number
  cogsAEngager?: number
  timeCreaBudget?: number
  sizing?: number
  travelBudget?: number
  offreInitiale?: number
  offreFinale?: number
  // Dates
  dateFinalisationPrevue?: string
  // Tasks
  nextTaskDate?: string
  nextTask?: string
  // Computed
  alerteHeures?: string
  progression?: string
  percentCogs?: string
  ehr?: string
  // Attachments
  devisSigne?: Attachment[]
  // IDs
  taskIds?: string[]
  cogsIds?: string[]
}

// ── Tasks ──
export type TaskPriority = 'Urgent' | 'Important' | 'Dans l\'idéal' | 'Optionnel' | 'Si retour client'
export type TaskType = 'Brief' | 'Call client' | 'Email client' | 'Demande float' | 'Shooting' | 'Delivery' | 'Envoi rétroplanning' | 'Task interne' | 'Contact presta' | 'Check' | 'Prez' | 'COGS' | 'Matos' | 'Retour presta' | 'Casting VO' | 'Casting acteur' | 'Prepa Tournage' | 'Call presta' | 'Calendar'

export interface Task {
  id: string
  name: string
  done: boolean
  clientName?: string
  priority?: TaskPriority
  projetId?: string
  projetName?: string
  projetRef?: string
  assigneeId?: string
  assigneeName?: string
  assigneManuel?: string
  dueDate?: string
  pm?: string
  type?: TaskType
  description?: string
  phase?: string
  createdAt?: string
}

// ── COGS ──
export type StatutCogs = 'A Approuver (CDP)' | 'A Approuver (CSM)' | 'Estimée' | 'Engagée' | 'A payer' | 'Autorisée via flash' | 'Payée' | 'Annulée' | 'Refusée' | 'Stand-by' | 'A Approuver'

export interface Cogs {
  id: string
  numeroCommande?: string
  statut?: StatutCogs
  projetId?: string
  projetName?: string
  projetRef?: string
  clientName?: string
  categorie?: string
  ressourceId?: string
  ressourceName?: string
  montantBudgeteSales?: number
  montantEngageProd?: number
  tva?: number
  montantTTC?: number
  bdcEnvoye?: boolean
  numeroFacture?: string
  facture?: Attachment[]
  commentaire?: string
  pm?: string
  createdAt?: string
  okPourPaiement?: boolean
  methodePaiement?: string
  qualiteNote?: number
  qualiteComment?: string
}

// ── Ressources ──
export interface Ressource {
  id: string
  name: string
  email?: string
  categorie?: string[]
  statut?: string
  telephone?: string
  description?: string
  iban?: string
  photo?: { url: string; filename: string }[]
}

// ── User (session) ──
export type UserRole = 'Admin' | 'PM' | 'DA'

export interface AppUser {
  name: string
  role: UserRole
}
