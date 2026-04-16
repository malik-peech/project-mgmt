import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import Anthropic from '@anthropic-ai/sdk'
import { ensureReferencesStore, filterReferences, type ReferenceFilters } from '@/lib/references-store'
import { sanitize } from '@/lib/sanitize'
import type { Reference } from '@/types'

/**
 * POST /api/assistant/chat
 *
 * Body: { messages: Array<{ role: 'user' | 'assistant', content: string }> }
 *
 * Runs a Claude Haiku 4.5 conversation with the `search_references` tool.
 * Loops on tool_use until Claude returns a final text response, then replies
 * with that text. The in-memory references store does the actual filtering
 * (0-cost, sub-ms), so Claude never has to ingest all 3466+ refs.
 *
 * Cost optimization:
 * - Prompt caching on system prompt + tool definition (cache TTL 5 min)
 * - Haiku 4.5 ($1/MTok in, $5/MTok out — see pricing)
 * - Typical query: ~2k input + ~500 output ≈ $0.005
 */

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOOL_TURNS = 4 // guard against infinite loops

// ── System prompt (cacheable) ──

const SYSTEM_PROMPT = `Tu es l'assistant de référence vidéo de Peech Studio, une agence de production vidéo à Paris. Ton rôle : aider l'équipe Sales à trouver rapidement les meilleures références vidéo à envoyer à un prospect.

Tu as accès à une base de 3466+ livrables vidéo (Belle Base) via l'outil search_references. Certaines refs sont enrichies :
- \`pitch\` + \`testimonial\` + \`canva_page_url\` : extraits des Canvas "Références - Newic" et "RÉFÉRENCES PEECH" (contenu curated, prêt à envoyer)
- \`sent_via_front_count\` + \`last_sent_at\` + \`recipient_domains\` : signal d'usage réel — combien de fois cette ref a été envoyée par l'équipe Sales via Front, à qui, quand.

RÈGLES :
- Réponds toujours en français (équipe francophone).
- Utilise search_references pour trouver des refs. Formule les filtres intelligemment — exemple : "refs pharma" → industry="santé" ou "pharma" ; "3D" → typeProjet="3D" ; "motion" → typeProjet="2D" ou style="Motion Design".
- Par défaut, filtre sur diffusableOnly=true et hasVimeo=true.
- Priorise fortement :
  1. les refs avec un \`pitch\` (narrative commerciale prête à envoyer)
  2. les refs avec un \`sent_via_front_count\` élevé dans le secteur visé (l'équipe Sales les a validées en les envoyant plusieurs fois)
- Après la recherche, présente 3 à 5 refs MAX. Format pour chaque ref :
  - **Nom du client** — Titre
  - Lien Vimeo (toujours cliquable, format markdown [Voir la vidéo](url))
  - Si la ref a un \`pitch\` → reprends-le (1-2 phrases max, paraphrase si trop long). Sinon, 1 ligne maison sur pourquoi elle matche.
  - Si la ref a un \`testimonial\` → cite-le entre guillemets, très utile comme preuve sociale.
  - Si \`sent_via_front_count\` ≥ 3 → mentionne "📤 envoyée N fois par l'équipe (dernière : MM/YYYY)" ou "envoyée récemment dans [domain]" — c'est un argument fort pour le sales.
  - Si la ref a un \`canva_page_url\` → termine avec "📎 [Page Canva à envoyer au prospect](url)" — c'est la page prête à partager.
  - Année, format, durée uniquement si pertinent pour la demande.
- Si la recherche ne renvoie rien, élargis les filtres et re-essaie (ex. retire minRating, change industry). Ne dis pas juste "rien trouvé".
- Si la demande est vague, demande une précision courte — pas plus d'une question à la fois.
- Zéro filler. Pas de "voici quelques références pour toi". Va droit au but.`

// ── Tool definition ──

const TOOL_SEARCH_REFERENCES: Anthropic.Tool = {
  name: 'search_references',
  description:
    'Recherche dans la Belle Base (3466+ livrables vidéo) selon une combinaison de filtres. Retourne jusqu\'à 20 refs les plus pertinentes avec leur lien Vimeo, classées par score (diffusable + rating + récent).',
  input_schema: {
    type: 'object',
    properties: {
      q: {
        type: 'string',
        description: 'Texte libre (matche titre, client, mood, industries, use cases). Utilise ceci pour les recherches sémantiques.',
      },
      industry: {
        type: 'string',
        description: 'Secteur (case-insensitive contains). Ex: "santé", "pharma", "banque", "industrie".',
      },
      style: {
        type: 'string',
        description: 'Style de réalisation. Ex: "Motion Design", "Tournage", "Animation 2D", "3D", "Banque d\'images".',
      },
      format: {
        type: 'string',
        description: 'Format. Ex: "Horizontal (16:9)", "Vertical (9:16)", "Carré (1:1)".',
      },
      useCase: {
        type: 'string',
        description: 'Cas d\'usage. Ex: "Branding / Notoriété", "Produit / Explicatif", "Marque employeur", "Réseaux sociaux".',
      },
      client: {
        type: 'string',
        description: 'Nom du client (contains). Ex: "BPCE", "Cegid", "Suez".',
      },
      typeProjet: {
        type: 'string',
        description: 'Type de projet. Ex: "3D", "Live", "2D", "Film", "Motion", "Stock", "Film scénarisé (acting)".',
      },
      bu: {
        type: 'string',
        description: 'Business Unit. Ex: "Film", "Animation", "3D".',
      },
      minRating: {
        type: 'number',
        description: 'Note minimale (1-5). Utilise 4 ou 5 pour les meilleures refs.',
      },
      minCreativeQuality: {
        type: 'number',
        description: 'Qualité créative minimale (1-5).',
      },
      diffusableOnly: {
        type: 'boolean',
        description: 'Ne garder que les refs diffusables (OK pour diffusion). Défaut: true.',
      },
      yearFrom: { type: 'number', description: 'Année minimale (ex: 2023).' },
      yearTo: { type: 'number', description: 'Année maximale.' },
      hasVimeo: {
        type: 'boolean',
        description: 'Ne garder que les refs avec lien Vimeo. Défaut: true.',
      },
      limit: {
        type: 'number',
        description: 'Nombre max de résultats à retourner (défaut 20, max 50).',
      },
    },
  },
}

// ── Tool execution ──

/**
 * Shrunken Reference view for tool results (minimize tokens).
 * Keep titre + URL + client + categorization fields — drop arrays that aren't
 * useful for the LLM's decision-making.
 */
type SlimRef = {
  id: string
  titre: string
  vimeo?: string
  client?: string
  year?: number
  industry?: string
  style?: string
  format?: string
  duree?: string
  narration?: string
  typeProjet?: string[]
  rating?: number
  diffusable?: string
  pitch?: string           // narrative commercial from Canva
  testimonial?: string     // client testimonial from Canva
  canva_page_url?: string  // direct link to the Canva page to pitch
  canva_design?: string    // "Newic" or "Peech"
  // Front evidence: real-world sales usage signal
  sent_via_front_count?: number
  last_sent_at?: string
  recipient_domains?: string[]
  senders?: string[]
}

function slim(r: Reference): SlimRef {
  return {
    id: r.id,
    titre: r.titre,
    vimeo: r.vimeoUrl,
    client: r.clientName,
    year: r.year,
    industry: r.industry,
    style: r.style || r.mainStyle,
    format: r.format,
    duree: r.duree,
    narration: r.narration,
    typeProjet: r.typeProjet,
    rating: r.rating,
    diffusable: r.diffusable,
    pitch: r.pitch,
    testimonial: r.testimonial,
    canva_page_url: r.canvaPageUrl,
    canva_design: r.canvaDesignTitle?.toLowerCase().includes('newic')
      ? 'Newic'
      : r.canvaDesignTitle?.toLowerCase().includes('peech')
        ? 'Peech'
        : undefined,
    sent_via_front_count: r.frontEvidence?.sentCount,
    last_sent_at: r.frontEvidence?.lastSentAt,
    recipient_domains: r.frontEvidence?.recipientDomains,
    senders: r.frontEvidence?.senders,
  }
}

async function runSearchReferences(input: unknown): Promise<string> {
  const raw = (input as ReferenceFilters) || {}
  // Apply sensible defaults if the model forgot them
  const filters: ReferenceFilters = {
    ...raw,
    diffusableOnly: raw.diffusableOnly !== false, // default true
    hasVimeo: raw.hasVimeo !== false,             // default true
    limit: Math.min(Math.max(raw.limit ?? 20, 1), 50),
  }

  const store = await ensureReferencesStore()
  const refs = filterReferences(store.references, filters)
  const slimRefs = refs.map(slim)

  return JSON.stringify({
    count: slimRefs.length,
    total_in_base: store.references.length,
    filters_applied: filters,
    references: slimRefs,
  })
}

// ── Message format conversion ──

type IncomingMessage = { role: 'user' | 'assistant'; content: string }

function toAnthropicMessages(msgs: IncomingMessage[]): Anthropic.MessageParam[] {
  return msgs.map((m) => ({ role: m.role, content: m.content }))
}

// ── Route handler ──

export async function POST(request: Request) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 },
      )
    }

    const body = await request.json()
    const messages: IncomingMessage[] = Array.isArray(body.messages) ? body.messages : []
    if (messages.length === 0) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey })

    // Conversation state (Anthropic format). Starts from user messages, and we
    // append assistant + tool_result turns as the tool-use loop proceeds.
    const convo: Anthropic.MessageParam[] = toAnthropicMessages(messages)

    let finalText = ''
    let toolTurns = 0

    // Tool-use loop: keep calling Claude until it stops requesting tool_use
    while (toolTurns <= MAX_TOOL_TURNS) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [TOOL_SEARCH_REFERENCES],
        messages: convo,
      })

      // Collect text + tool_use blocks
      const textBlocks: string[] = []
      const toolUses: Anthropic.ToolUseBlock[] = []
      for (const block of response.content) {
        if (block.type === 'text') textBlocks.push(block.text)
        else if (block.type === 'tool_use') toolUses.push(block)
      }

      // If the model is done (no tool calls), collect the text and return
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        finalText = textBlocks.join('\n').trim()
        break
      }

      // Otherwise: record the assistant turn, execute tools, append tool_results
      convo.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        let result: string
        try {
          if (tu.name === 'search_references') {
            result = await runSearchReferences(tu.input)
          } else {
            result = JSON.stringify({ error: `Unknown tool: ${tu.name}` })
          }
        } catch (err) {
          result = JSON.stringify({
            error: err instanceof Error ? err.message : 'Tool execution failed',
          })
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: result,
        })
      }
      convo.push({ role: 'user', content: toolResults })

      toolTurns += 1
    }

    if (!finalText) {
      finalText = "Je n'ai pas pu formuler de réponse. Peux-tu reformuler ta demande ?"
    }

    return NextResponse.json(
      sanitize({ content: finalText }),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[api/assistant/chat] error:', error)
    const msg = error instanceof Error ? error.message : 'Chat error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
