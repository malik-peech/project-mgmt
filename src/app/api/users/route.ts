import { NextResponse } from 'next/server'
import { getUsers, getUserByName, createUser, updateUser, deleteUser } from '@/lib/users'
import type { UserRole } from '@/lib/users'

export async function GET() {
  try {
    const users = await getUsers()
    return NextResponse.json(users.map(({ id, name, role, login, matching }) => ({ id, name, role, login, matching })))
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, password, role, login, matching } = body as {
      name?: string
      password?: string
      role?: UserRole
      login?: string
      matching?: string
    }

    if (!name?.trim() || !password?.trim() || !role) {
      return NextResponse.json({ error: 'name, password, and role are required' }, { status: 400 })
    }
    if (!['PM', 'DA', 'Admin', 'Sales'].includes(role)) {
      return NextResponse.json({ error: 'role must be PM, DA, Admin or Sales' }, { status: 400 })
    }

    const user = await createUser({
      name: name.trim(),
      login: (login || name).trim(),
      password,
      role,
      matching: (matching || name).trim(),
    })
    return NextResponse.json({ id: user.id, name: user.name, role: user.role }, { status: 201 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create user'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { name, newName, password, role, login, matching } = body as {
      name?: string
      newName?: string
      password?: string
      role?: UserRole
      login?: string
      matching?: string
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (role && !['PM', 'DA', 'Admin', 'Sales'].includes(role)) {
      return NextResponse.json({ error: 'role must be PM, DA, Admin or Sales' }, { status: 400 })
    }

    // Find user by name to get record ID
    const existing = await getUserByName(name.trim())
    if (!existing) {
      return NextResponse.json({ error: `User "${name}" not found` }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}
    if (newName?.trim()) updates.name = newName.trim()
    if (password) updates.password = password
    if (role) updates.role = role
    if (login) updates.login = login.trim()
    if (matching) updates.matching = matching.trim()

    const user = await updateUser(existing.id, updates as { name?: string; login?: string; password?: string; role?: UserRole; matching?: string })
    return NextResponse.json({ id: user.id, name: user.name, role: user.role })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to update user'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name query param is required' }, { status: 400 })
    }

    const existing = await getUserByName(name.trim())
    if (!existing) {
      return NextResponse.json({ error: `User "${name}" not found` }, { status: 404 })
    }

    await deleteUser(existing.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to delete user'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
