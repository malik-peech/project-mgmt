import type { Projet } from '@/types'

/**
 * Required steps for a projet to be considered "offboarded" by its PM.
 * Once Point EOP = Done, the projet moves from "À offboarder" to Archive.
 */
export const OFFBOARDING_FIELDS = [
  'frameArchive',
  'slackArchive',
  'eopMonth',
  'diffusable',
  'pointEop',
  'eopFeedback',
  'eopRating',
] as const

export type OffboardingField = typeof OFFBOARDING_FIELDS[number]

/**
 * Returns the list of offboarding steps that are still missing.
 *
 * A projet is considered fully offboarded when Point EOP === 'Done' (or
 * 'No need') AND the archive checkboxes are ticked AND EOP month is set AND
 * Diffusable is answered. Belle-base entries are tracked separately.
 */
export function missingOffboardingFields(p: Projet, belleCount = 0): OffboardingField[] {
  const missing: OffboardingField[] = []
  if (!p.frameArchive) missing.push('frameArchive')
  if (!p.slackArchive) missing.push('slackArchive')
  if (!p.eopMonthIds || p.eopMonthIds.length === 0) missing.push('eopMonth')
  if (!p.diffusable) missing.push('diffusable')
  // Point EOP: Done or "No need" → archived; Prévu → still in queue
  if (p.pointEop !== 'Done' && p.pointEop !== 'No need (vu avec sales)') {
    missing.push('pointEop')
  }
  // EOP feedback + rating only required once the EOP call was actually held
  if (p.pointEop === 'Done') {
    if (!p.eopFeedback || !p.eopFeedback.trim()) missing.push('eopFeedback')
    if (!p.eopRating || p.eopRating <= 0) missing.push('eopRating')
  }
  // Belle-base entries are not gated (a projet can legitimately have 0 if
  // "Diffusion interdite"), but we expose the count in the UI.
  void belleCount
  return missing
}

export function isOffboarded(p: Projet): boolean {
  return missingOffboardingFields(p).length === 0
}

export const OFFBOARDING_FIELD_LABELS: Record<OffboardingField, string> = {
  frameArchive: 'Frame archivé',
  slackArchive: 'Slack archivé',
  eopMonth: 'EOP month',
  diffusable: 'Diffusable ?',
  pointEop: 'Point EOP',
  eopFeedback: 'EOP feedback',
  eopRating: 'EOP rating',
}
