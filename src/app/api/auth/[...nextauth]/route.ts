import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

// PM list from Airtable singleSelect options
const PM_NAMES = [
  'Coline Spyckerelle',
  'Juliette Tostain',
  'Mazarine Alessandra',
  'Rosemarie Voisine',
  'Julie Barbaud',
  'Mathis Lavigne',
  'Alice Czernik',
  'Mathilde Quero',
  'Tiphaine Mounier',
  'Laetitia Prioux',
  'Loann Laforet',
  'Mathilde Carvalho',
  'Laetitia Pilinski',
  'Maud Paolantonacci',
  'Charlène Pelle',
  'Esther Machard',
  'Zelie Oesch',
  'Chloé Sevestre',
  'Marie Adrait',
  'Elisa Grandjean',
  'Aurélie Chomet',
  'Elsa Lopez',
]

// Admin users who get the Admin role
const ADMIN_NAMES = ['Malik Goulamhoussen', 'Vanessa Goulamhoussen']

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        name: { label: 'Nom', type: 'text' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.name || !credentials?.password) return null

        const appPassword = process.env.APP_PASSWORD || 'peech2024'
        if (credentials.password !== appPassword) return null

        const name = credentials.name.trim()
        const allNames = [...PM_NAMES, ...ADMIN_NAMES]
        const matched = allNames.find(
          (n) => n.toLowerCase() === name.toLowerCase()
        )
        if (!matched) return null

        const role = ADMIN_NAMES.some(
          (n) => n.toLowerCase() === name.toLowerCase()
        )
          ? 'Admin'
          : 'PM'

        return { id: matched, name: matched, email: `${matched.toLowerCase().replace(/\s+/g, '.')}@peech.studio`, role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role
        token.userName = user.name
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string
        session.user.name = token.userName as string
      }
      return session
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
})

export { handler as GET, handler as POST }
