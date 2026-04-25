// ── Projets ──
export type Phase = 'Démarrage' | 'Conception' | 'Production' | 'Last modifs' | 'Done' | 'Archivé'
export type StatutProjet = 'Stand-by' | 'En cours' | 'Finalisation' | 'Done' | 'Tentative' | 'Intention'
export type TypeProjet = 'Live' | '2D' | 'Film' | 'Film scénarisé (acting)' | '3D' | 'Web' | 'Learning' | 'Stock' | 'Adapt' | 'Illustrations' | 'Photo' | 'Podcast' | 'Solo' | 'Duo'
export type Currency = 'EUR' | 'USD' | 'CHF'
export type Origine = 'Client existant' | 'Nouveau client'
export type TypeDeContact = 'Compta' | 'Client'
export type Bdc = 'Numéro à référencer' | 'Déposer sur Chorus' | 'Pas de bon de commande'
export type Diffusable = 'OK pour diffusion' | 'Diffusion interdite'
export type PointEop = 'Prévu' | 'Done' | 'No need (vu avec sales)'

export interface Attachment {
  id?: string
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
  pasDeDa?: boolean
  briefEffectue?: boolean
  dateBrief?: string
  statutBrief?: string
  pc?: string
  filmmaker?: string
  phase?: Phase
  statut?: StatutProjet
  typeProjet?: TypeProjet
  // Sales / onboarding
  sales?: string
  moisSignatureIds?: string[]
  moisSignatureNames?: string[]
  currency?: Currency
  origine?: Origine
  numeroDevis?: string
  dureeContrat?: number
  libelleFacture?: string
  contactCompta?: string
  typeDeContact?: TypeDeContact
  bdc?: Bdc
  numeroCommande?: string
  bonDeCommande?: Attachment[]
  repriseLigneDevisFacture?: boolean
  // Offboarding
  frameArchive?: boolean
  slackArchive?: boolean
  eopMonthIds?: string[]
  eopMonthNames?: string[]
  diffusable?: Diffusable
  pointEop?: PointEop
  datePointEop?: string
  eopFeedback?: string
  eopRating?: number
  // Budgets
  cogsBudget?: number
  cogsReels?: number
  cogsPrevus?: number
  cogsAEngager?: number
  timeCreaBudget?: number
  timeProdBudget?: number
  timeDaBudget?: number
  sizing?: number
  travelBudget?: number
  offreInitiale?: number
  offreFinale?: number
  // Dates
  dateFinalisationPrevue?: string
  // Billing
  facturable100?: boolean
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
  autorisationVanessa?: number
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

// ── Clients (onboarding) ──
export interface Client {
  id: string
  name: string
}

// ── Mensuel (Mois signature / EOP month) ──
export interface Mensuel {
  id: string
  name: string
}

// ── Belle base livrable ──
export interface BelleBaseEntry {
  id: string
  titre: string
  vimeoLink?: string
  projetIds: string[]        // IDs in Belle base's synced Projets table
  projetRefs: string[]        // Project réf values (for matching against PM base)
}

// ── User (session) ──
export type UserRole = 'Admin' | 'PM' | 'DA' | 'Sales'

export interface AppUser {
  name: string
  role: UserRole
}

// ── References (AI sales assistant) ──
// Denormalized view of a Belle-base livrable, ready for filtering + LLM tool-calling.
export interface Reference {
  id: string
  titre: string
  vimeoUrl?: string

  // Client / project
  clientName?: string
  projetRef?: string
  year?: number

  // Categorization
  industry?: string          // primary (singleSelect)
  industries?: string[]      // all industries combined (Main Industries + Industry New)
  useCase?: string           // primary (singleSelect)
  useCases?: string[]        // all (lookup)
  style?: string             // primary (singleSelect)
  mainStyle?: string         // (singleSelect)
  format?: string            // (singleSelect)
  duree?: string             // (singleSelect)
  narration?: string         // (singleSelect)
  moodTone?: string[]        // (multipleSelects)
  langue?: string[]          // (multipleSelects)
  bu?: string[]              // lookup from projet
  product?: string[]         // lookup from projet
  typeProjet?: string[]      // lookup from projet (3D, Live, 2D…)

  // Quality
  rating?: number
  creativeQuality?: number

  // Diffusion
  diffusable?: string        // "OK pour diffusion" / "Diffusion interdite" / etc.

  // Metadata
  createdAt?: string

  // Canva enrichment (joined by Vimeo ID from src/data/canva-enrichment.json)
  pitch?: string             // narrative commercial — "Nous avons accompagné X dans…"
  testimonial?: string       // client testimonial (Trustfolio)
  canvaCategory?: string     // e.g. "Motion Design", "Tournage" (Newic only)
  canvaPageUrl?: string      // direct link to the Canva page to pitch
  canvaDesignTitle?: string  // "Références - Newic" or "RÉFÉRENCES PEECH"

  // Front evidence (joined by Vimeo ID from src/data/front-evidence.json)
  // — signals real-world sales usage: who sent it, how often, to whom.
  frontEvidence?: {
    sentCount: number
    firstSentAt?: string
    lastSentAt?: string
    recipientDomains?: string[]
    senders?: string[]
  }
}
