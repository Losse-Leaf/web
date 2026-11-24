import type { EntryGalleryCategory, LifeEntry } from '../types/index.ts'
import { isTransactionEntry, isWishEntry, normalizeEntryCategory } from '../types/index.ts'

const GALLERY_BADGE_CLASSES: Record<Exclude<EntryGalleryCategory, ''>, string> = {
  Photography:
    'border-[var(--tag-photography)]/40 bg-[var(--tag-photography)]/8 text-[var(--tag-photography)]',
  Travel: 'border-[var(--tag-travel)]/40 bg-[var(--tag-travel)]/8 text-[var(--tag-travel)]',
  'Still Life':
    'border-[var(--tag-still-life)]/40 bg-[var(--tag-still-life)]/8 text-[var(--tag-still-life)]',
  Motion: 'border-[var(--tag-motion)]/40 bg-[var(--tag-motion)]/8 text-[var(--tag-motion)]',
}

const GALLERY_NODE_CLASSES: Record<Exclude<EntryGalleryCategory, ''>, string> = {
  Photography: 'border-[var(--tag-photography)] bg-[var(--tag-photography)]/20',
  Travel: 'border-[var(--tag-travel)] bg-[var(--tag-travel)]/20',
  'Still Life': 'border-[var(--tag-still-life)] bg-[var(--tag-still-life)]/20',
  Motion: 'border-[var(--tag-motion)] bg-[var(--tag-motion)]/20',
}

export function getEntryBadgeClass(entry: LifeEntry): string {
  if (isTransactionEntry(entry)) {
    return 'border-emerald-700/40 bg-emerald-700/8 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300'
  }
  if (isWishEntry(entry)) {
    return 'border-[var(--accent-warm)]/40 bg-[var(--accent-warm)]/8 text-[var(--accent-warm)]'
  }
  const normalized = normalizeEntryCategory(entry.category)
  if (normalized) {
    return GALLERY_BADGE_CLASSES[normalized]
  }
  return 'border-[var(--border-subtle)] text-[var(--ink-secondary)]'
}

export function getEntryTimelineNodeClass(entry: LifeEntry): string {
  if (isTransactionEntry(entry)) {
    return 'border-emerald-600 dark:border-emerald-400'
  }
  if (isWishEntry(entry)) {
    return 'border-[var(--accent-warm)] bg-[var(--accent-warm)]/20'
  }
  const normalized = normalizeEntryCategory(entry.category)
  if (normalized) {
    return GALLERY_NODE_CLASSES[normalized]
  }
  return 'border-[var(--ink-secondary)]'
}
