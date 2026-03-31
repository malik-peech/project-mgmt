import { NextResponse } from 'next/server'
import { getStore } from '@/lib/store'

export async function GET() {
  const store = getStore()

  return NextResponse.json({
    status: 'ok',
    time: new Date().toISOString(),
    store: store
      ? {
          initialized: true,
          projets: store.projets.records.length,
          tasks: store.tasks.records.length,
          cogs: store.cogs.records.length,
          ressources: store.ressources.records.length,
          clients: store.clients.records.length,
          lastSync: {
            projets: store.projets.lastSync ? new Date(store.projets.lastSync).toISOString() : null,
            tasks: store.tasks.lastSync ? new Date(store.tasks.lastSync).toISOString() : null,
          },
        }
      : { initialized: false },
    env: {
      hasAirtableKey: !!process.env.AIRTABLE_API_KEY,
      hasAirtableBase: !!process.env.AIRTABLE_BASE_ID,
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
      hasAppPassword: !!process.env.APP_PASSWORD,
      nodeEnv: process.env.NODE_ENV,
    },
  })
}
