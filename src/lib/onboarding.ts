import type { Projet } from '@/types'

/**
 * List of required fields for a projet to be considered "onboarded".
 * A sales user must fill all of these before the projet is archived.
 */
export const ONBOARDING_FIELDS = [
  'moisSignature',
  'currency',
  'clientLink',
  'origine',
  'agence',
  'numeroDevis',
  'devisSigne',
  'cogsBudget',
  'timeCreaBudget',
  'travelBudget',
  'timeProdBudget',
  'timeDaBudget',
  'dateFinalisationPrevue',
  'dureeContrat',
  'libelleFacture',
  'contactCompta',
  'typeDeContact',
  'pm',
  'briefEffectue',
  'bdc',
  'numeroCommande',
] as const

export type OnboardingField = typeof ONBOARDING_FIELDS[number]

/** Check each required onboarding field. Returns list of missing field keys. */
export function missingOnboardingFields(p: Projet): OnboardingField[] {
  const missing: OnboardingField[] = []
  if (!p.moisSignatureIds || p.moisSignatureIds.length === 0) missing.push('moisSignature')
  if (!p.currency) missing.push('currency')
  if (!p.clientId) missing.push('clientLink')
  if (!p.origine) missing.push('origine')
  if (!p.agence) missing.push('agence')
  if (!p.numeroDevis?.trim()) missing.push('numeroDevis')
  if (!p.devisSigne || p.devisSigne.length === 0) missing.push('devisSigne')
  if (p.cogsBudget == null) missing.push('cogsBudget')
  if (p.timeCreaBudget == null) missing.push('timeCreaBudget')
  if (p.travelBudget == null) missing.push('travelBudget')
  if (p.timeProdBudget == null) missing.push('timeProdBudget')
  if (p.timeDaBudget == null) missing.push('timeDaBudget')
  if (!p.dateFinalisationPrevue) missing.push('dateFinalisationPrevue')
  if (p.dureeContrat == null) missing.push('dureeContrat')
  if (!p.libelleFacture?.trim()) missing.push('libelleFacture')
  if (!p.contactCompta?.trim()) missing.push('contactCompta')
  if (!p.typeDeContact) missing.push('typeDeContact')
  if (!p.pm) missing.push('pm')
  if (!p.briefEffectue) missing.push('briefEffectue')
  if (!p.bdc) missing.push('bdc')
  // Numéro de commande required only when BDC requires one
  if (
    (p.bdc === 'Numéro à référencer' || p.bdc === 'Déposer sur Chorus') &&
    !p.numeroCommande?.trim()
  ) {
    missing.push('numeroCommande')
  }
  return missing
}

export function isOnboarded(p: Projet): boolean {
  return missingOnboardingFields(p).length === 0
}

export const ONBOARDING_FIELD_LABELS: Record<OnboardingField, string> = {
  moisSignature: 'Mois signature',
  currency: 'Currency',
  clientLink: 'Client',
  origine: 'Origine',
  agence: 'Agence',
  numeroDevis: 'Numéro de devis',
  devisSigne: 'Devis signé',
  cogsBudget: 'COGS - budget (€)',
  timeCreaBudget: 'Time Créa - budget (h)',
  travelBudget: 'Travel - budget (€)',
  timeProdBudget: 'Time Prod - budget (h)',
  timeDaBudget: 'Time DA - budget (h)',
  dateFinalisationPrevue: 'Date de finalisation prévue',
  dureeContrat: 'Durée contrat (mois)',
  libelleFacture: 'Libellé facture',
  contactCompta: 'Contact compta',
  typeDeContact: 'Type de contact',
  pm: 'PM',
  briefEffectue: 'Brief effectué',
  bdc: 'BDC',
  numeroCommande: 'Numéro de commande',
}
