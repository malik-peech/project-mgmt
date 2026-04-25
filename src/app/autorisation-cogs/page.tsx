'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import AdminCogsToApprove from '@/components/AdminCogsToApprove'

export default function AutorisationCogsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const userRole = (session?.user as { role?: string })?.role

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    else if (status === 'authenticated' && userRole !== 'Admin') router.push('/')
  }, [status, userRole, router])

  if (status === 'loading' || userRole !== 'Admin') {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      <AdminCogsToApprove />
    </div>
  )
}
