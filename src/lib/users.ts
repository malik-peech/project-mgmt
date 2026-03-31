/**
 * User management store backed by a JSON file.
 * Each user has: name, password, role (PM | DA | Admin).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export type UserRole = 'PM' | 'DA' | 'Admin'

export interface AppUser {
  name: string
  password: string
  role: UserRole
}

const DATA_DIR = join(process.cwd(), 'data')
const USERS_FILE = join(DATA_DIR, 'users.json')

// Default seed data (migrated from hardcoded lists)
const DEFAULT_USERS: AppUser[] = [
  // Admins
  { name: 'Malik Goulamhoussen', password: 'peech2024', role: 'Admin' },
  { name: 'Vanessa Goulamhoussen', password: 'peech2024', role: 'Admin' },
  // PMs
  { name: 'Margaux Fluttaz', password: 'peech2024', role: 'PM' },
  { name: 'Julien Munier', password: 'peech2024', role: 'PM' },
  { name: 'Max Robé', password: 'peech2024', role: 'PM' },
  { name: 'Alexis Mervant', password: 'peech2024', role: 'PM' },
  { name: 'Amandine', password: 'peech2024', role: 'PM' },
  { name: 'Athenaïs Ozanne-de Buchy', password: 'peech2024', role: 'PM' },
  { name: 'Elsa Lopez', password: 'peech2024', role: 'PM' },
  { name: 'Eugénie Perrin', password: 'peech2024', role: 'PM' },
  { name: 'Fabien Dhondt', password: 'peech2024', role: 'PM' },
  { name: 'LAURA ARNAUD', password: 'peech2024', role: 'PM' },
  { name: 'Marie Adrait', password: 'peech2024', role: 'PM' },
  { name: 'Marlène De Almeida', password: 'peech2024', role: 'PM' },
  { name: 'Shana Briand', password: 'peech2024', role: 'PM' },
  { name: 'Tiphaine Mounier', password: 'peech2024', role: 'PM' },
  // DAs
  { name: 'Agathe DA SILVA', password: 'peech2024', role: 'DA' },
  { name: 'Camille Nestal', password: 'peech2024', role: 'DA' },
  { name: 'Johanne Courcelle', password: 'peech2024', role: 'DA' },
]

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function loadUsers(): AppUser[] {
  ensureDataDir()
  if (!existsSync(USERS_FILE)) {
    writeFileSync(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2), 'utf-8')
    return DEFAULT_USERS
  }
  try {
    const raw = readFileSync(USERS_FILE, 'utf-8')
    return JSON.parse(raw) as AppUser[]
  } catch {
    return DEFAULT_USERS
  }
}

function saveUsers(users: AppUser[]) {
  ensureDataDir()
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')
}

// ── Public API ──

export function getUsers(): AppUser[] {
  return loadUsers()
}

export function getUserByName(name: string): AppUser | undefined {
  return loadUsers().find((u) => u.name.toLowerCase() === name.toLowerCase())
}

export function getUsersByRole(role: UserRole): AppUser[] {
  return loadUsers().filter((u) => u.role === role)
}

export function createUser(user: AppUser): AppUser {
  const users = loadUsers()
  if (users.find((u) => u.name.toLowerCase() === user.name.toLowerCase())) {
    throw new Error(`User "${user.name}" already exists`)
  }
  users.push(user)
  saveUsers(users)
  return user
}

export function updateUser(name: string, updates: Partial<Omit<AppUser, 'name'>> & { newName?: string }): AppUser {
  const users = loadUsers()
  const idx = users.findIndex((u) => u.name.toLowerCase() === name.toLowerCase())
  if (idx === -1) throw new Error(`User "${name}" not found`)

  if (updates.newName && updates.newName !== users[idx].name) {
    if (users.find((u) => u.name.toLowerCase() === updates.newName!.toLowerCase() && u.name.toLowerCase() !== name.toLowerCase())) {
      throw new Error(`User "${updates.newName}" already exists`)
    }
    users[idx].name = updates.newName
  }
  if (updates.password) users[idx].password = updates.password
  if (updates.role) users[idx].role = updates.role

  saveUsers(users)
  return users[idx]
}

export function deleteUser(name: string): void {
  const users = loadUsers()
  const filtered = users.filter((u) => u.name.toLowerCase() !== name.toLowerCase())
  if (filtered.length === users.length) throw new Error(`User "${name}" not found`)
  saveUsers(filtered)
}
