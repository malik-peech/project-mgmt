/**
 * Minimal transactional email sender backed by Resend (https://resend.com).
 * Uses the REST API directly (no SDK dependency).
 *
 * Env:
 *   RESEND_API_KEY   — required to actually send; if absent, sendEmail no-ops
 *                      (logs a warning) so the calling flow never breaks.
 *   RESEND_FROM      — sender, e.g. "Peech Studio <no-reply@peechstudio.com>"
 *                      (the domain must be verified in Resend).
 */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  replyTo?: string
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM || 'Peech Studio <no-reply@peechstudio.com>'

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — email not sent to', opts.to)
    return { sent: false, error: 'RESEND_API_KEY not set' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error('[email] Resend error:', res.status, txt)
      return { sent: false, error: txt }
    }
    return { sent: true }
  } catch (err) {
    console.error('[email] send failed:', err)
    return { sent: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}
