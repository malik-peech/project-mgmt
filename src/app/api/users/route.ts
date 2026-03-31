import { NextResponse } from 'next/server'
import { getUsers, createUser, updateUser, deleteUser } from '@/lib/users'
import type { UserRole } from '@/lib/users'

export async function GET() {
  try {
    const users = getUsers().map(({ name, role }) => ({ name, role }))
    return NextResponse.json(users)
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, password, role } = body as { name?: string; password?: string; role?: UserRole }

    if (!name?.trim() || !password?.trim() || !role) {
      return NextResponse.json({ error: 'name, password, and role are required' }, { status: 400 })
    }
    if (!['PM', 'DA', 'Admin'].includes(role)) {
      return NextResponse.json({ error: 'role must be PM, DA, or Admin' }, { status: 400 })
    }

    const user = createUser({ name: name.trim(), password, role })
    return NextResponse.json({ name: user.name, role: user.role }, { status: 201 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create user'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { name, newName, password, role } = body as {
      name?: string
      newName?: string
      password?: string
      role?: UserRole
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (role && !['PM', 'DA', 'Admin'].includes(role)) {
      return NextResponse.json({ error: 'role must be PM, DA, or Admin' }, { status: 400 })
    }

    const user = updateUser(name, { newName: newName?.trim(), password, role })
    return NextResponse.json({ name: user.name, role: user.role })
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

    deleteUser(name)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to delete user'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
