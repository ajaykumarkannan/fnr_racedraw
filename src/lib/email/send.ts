import { resend, FROM_EMAIL } from './client'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://racedraw.app'

// ─── Shared helpers ────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Check for missing API key — return true if we should skip sending */
function checkApiKey(): boolean {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY is not set — skipping email send in local dev')
    return true
  }
  return false
}

// ─── Shared layout ─────────────────────────────────────────────────────────────

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:24px 32px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">FNR RaceDraw</p>
              <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Friday Night Race Draw Manager</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                FNR RaceDraw &mdash; <a href="${APP_URL}" style="color:#64748b;text-decoration:none;">${APP_URL}</a>
              </p>
              <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px;text-align:center;">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">${label}</a>`
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:700;line-height:1.3;">${text}</h1>`
}

function h2(text: string): string {
  return `<h2 style="margin:24px 0 8px;color:#1e293b;font-size:18px;font-weight:600;">${text}</h2>`
}

function para(text: string): string {
  return `<p style="margin:12px 0;color:#475569;font-size:15px;line-height:1.6;">${text}</p>`
}

function badge(text: string, color = '#1e40af'): string {
  return `<span style="display:inline-block;padding:2px 10px;background:${color}18;color:${color};border-radius:99px;font-size:13px;font-weight:600;">${text}</span>`
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />`
}

// ─── sendWelcomeEmail ──────────────────────────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  name: string,
  verificationUrl: string,
): Promise<{ error?: string }> {
  if (checkApiKey()) return {}

  const subject = 'Welcome to FNR RaceDraw — verify your email'

  const body = `
    ${h1(`Welcome aboard, ${name}!`)}
    ${para('Thanks for signing up for <strong>FNR RaceDraw</strong> — the automated helm-crew pairing system for Friday night sailing races.')}
    ${para('Please verify your email address to activate your account:')}
    ${ctaButton(verificationUrl, 'Verify my email')}
    ${divider()}
    ${h2('What is FNR RaceDraw?')}
    ${para('FNR RaceDraw makes it easy to sign up for Friday night race series at your sailing club. Register as a <strong>helm</strong> or <strong>crew</strong>, and we’ll automatically pair you with a partner before race night. No more last-minute scrambling on the dock.')}
    <ul style="color:#475569;font-size:15px;line-height:1.8;padding-left:20px;margin:8px 0 16px;">
      <li>Register before Wednesday 7&nbsp;pm</li>
      <li>Get automatically paired with a compatible helm or crew</li>
      <li>Receive your draw results by email</li>
      <li>Overflow sailors get priority next week</li>
    </ul>
    ${para('If you didn’t create this account, you can safely ignore this email.')}
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: layout(subject, body),
    })
    if (error) {
      console.error('[email] sendWelcomeEmail error:', error)
      return { error: error.message }
    }
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] sendWelcomeEmail exception:', msg)
    return { error: msg }
  }
}

// ─── sendRegistrationConfirmation ─────────────────────────────────────────────

export async function sendRegistrationConfirmation(
  to: string,
  name: string,
  clubName: string,
  raceDate: Date,
  primaryRole: string,
  acceptOtherRole: boolean,
): Promise<{ error?: string }> {
  if (checkApiKey()) return {}

  const dateStr = formatShortDate(raceDate)
  const subject = `Race registration confirmed — ${clubName} ${dateStr}`
  const roleLabel = primaryRole.charAt(0).toUpperCase() + primaryRole.slice(1)
  const otherRole = primaryRole === 'helm' ? 'crew' : 'helm'

  const roleNote = acceptOtherRole
    ? `You’ve indicated you’ll accept either role — if needed we may pair you as <strong>${otherRole}</strong>.`
    : `You’ve indicated you prefer <strong>${roleLabel} only</strong> and won’t be placed in the other role.`

  const body = `
    ${h1('Registration confirmed')}
    <p style="margin:4px 0 20px;color:#64748b;font-size:14px;">${clubName} &mdash; Friday ${formatDate(raceDate)}</p>
    ${para(`Hi ${name},`)}
    ${para(`You’re registered for the <strong>Friday night race on ${dateStr}</strong> at <strong>${clubName}</strong> as a ${badge(roleLabel)}.`)}
    ${para(roleNote)}
    ${divider()}
    ${para('You can update or cancel your registration any time before the draw closes:')}
    ${ctaButton(`${APP_URL}/dashboard`, 'Go to dashboard')}
    ${para('<span style="color:#94a3b8;font-size:13px;">The draw closes on Wednesday at 7&nbsp;pm. You’ll receive an email with your pairing once the draw is complete.</span>')}
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: layout(subject, body),
    })
    if (error) {
      console.error('[email] sendRegistrationConfirmation error:', error)
      return { error: error.message }
    }
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] sendRegistrationConfirmation exception:', msg)
    return { error: msg }
  }
}

// ─── sendDrawReminder ─────────────────────────────────────────────────────────

export async function sendDrawReminder(
  to: string,
  name: string,
  clubName: string,
  raceDate: Date,
  drawTime: Date,
  isRegistered: boolean,
): Promise<{ error?: string }> {
  if (checkApiKey()) return {}

  const dateStr = formatShortDate(raceDate)
  const subject = `Draw closes tomorrow at 7pm — ${clubName} ${dateStr}`

  const statusBlock = isRegistered
    ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0;color:#166534;font-size:15px;font-weight:600;">&#10003; You are registered for this race</p>
        <p style="margin:6px 0 0;color:#15803d;font-size:14px;">Need to make changes? Update your registration before the draw closes.</p>
      </div>
      ${ctaButton(`${APP_URL}/dashboard`, 'Update registration')}`
    : `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0;color:#854d0e;font-size:15px;font-weight:600;">&#9888; You are not registered for this race</p>
        <p style="margin:6px 0 0;color:#92400e;font-size:14px;">Register now to join the Friday night draw.</p>
      </div>
      ${ctaButton(`${APP_URL}/dashboard`, 'Register now')}`

  const body = `
    ${h1('Draw closes tomorrow')}
    <p style="margin:4px 0 20px;color:#64748b;font-size:14px;">${clubName} &mdash; Friday ${formatDate(raceDate)}</p>
    ${para(`Hi ${name},`)}
    ${para(`The draw for the <strong>Friday night race on ${dateStr}</strong> at <strong>${clubName}</strong> closes tomorrow at <strong>${formatTime(drawTime)}</strong>.`)}
    ${statusBlock}
    ${para('<span style="color:#94a3b8;font-size:13px;">Draw results will be emailed to all registered sailors once the draw is complete.</span>')}
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: layout(subject, body),
    })
    if (error) {
      console.error('[email] sendDrawReminder error:', error)
      return { error: error.message }
    }
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] sendDrawReminder exception:', msg)
    return { error: msg }
  }
}

// ─── sendDrawResults ──────────────────────────────────────────────────────────

export async function sendDrawResults(
  recipients: Array<{ email: string; name: string }>,
  clubName: string,
  raceDate: Date,
  pairs: Array<{
    helmName: string
    crewName: string
    boatNumber: number
    helmNonPrimary?: boolean
    crewNonPrimary?: boolean
  }>,
  overflow: Array<{ name: string; primaryRole: string }>,
  boatLimitApplied: boolean,
  effectiveBoatLimit: number | null,
): Promise<{ error?: string }> {
  if (checkApiKey()) return {}

  const dateStr = formatShortDate(raceDate)
  const subject = `Draw results — ${clubName} Friday ${dateStr}`

  // Build pairs table rows
  const tableRows = pairs
    .map((pair, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc'
      const helmLabel = pair.helmNonPrimary
        ? `${pair.helmName} <span style="color:#9333ea;font-size:12px;">(filled crew role)</span>`
        : pair.helmName
      const crewLabel = pair.crewNonPrimary
        ? `${pair.crewName} <span style="color:#9333ea;font-size:12px;">(filled helm role)</span>`
        : pair.crewName
      return `<tr style="background:${bg};">
        <td style="padding:10px 14px;color:#475569;font-size:14px;font-weight:600;white-space:nowrap;">${pair.boatNumber}</td>
        <td style="padding:10px 14px;color:#1e293b;font-size:14px;">${helmLabel}</td>
        <td style="padding:10px 14px;color:#1e293b;font-size:14px;">${crewLabel}</td>
      </tr>`
    })
    .join('')

  const pairsTable = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin:16px 0;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:10px 14px;text-align:left;color:#64748b;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;">Boat #</th>
          <th style="padding:10px 14px;text-align:left;color:#64748b;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;">Helm</th>
          <th style="padding:10px 14px;text-align:left;color:#64748b;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;">Crew</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `

  const overflowBlock =
    overflow.length > 0
      ? `${divider()}
        ${h2('Overflow sailors')}
        ${para('The following sailors were not paired this week. They will have <strong>priority in next week’s draw</strong> if they register again.')}
        <ul style="color:#475569;font-size:14px;line-height:1.9;padding-left:20px;margin:8px 0;">
          ${overflow.map((s) => `<li>${s.name} <span style="color:#94a3b8;">(${s.primaryRole})</span></li>`).join('')}
        </ul>`
      : ''

  const boatLimitNote =
    boatLimitApplied && effectiveBoatLimit !== null
      ? `<p style="margin:12px 0 0;color:#9333ea;font-size:13px;">&#9432; A boat limit of <strong>${effectiveBoatLimit}</strong> was applied to this draw.</p>`
      : ''

  const body = `
    ${h1('Draw results')}
    <p style="margin:4px 0 20px;color:#64748b;font-size:14px;">${clubName} &mdash; Friday ${formatDate(raceDate)}</p>
    ${para(`The draw is complete! Here are the pairings for <strong>${dateStr}</strong>:`)}
    ${pairsTable}
    ${boatLimitNote}
    ${overflowBlock}
    ${divider()}
    ${ctaButton(`${APP_URL}/dashboard`, 'View on dashboard')}
    ${para('<span style="color:#94a3b8;font-size:13px;">See you on the water!</span>')}
  `

  // Send to all recipients (fan-out individually so each gets a personalised To:)
  const errors: string[] = []
  for (const recipient of recipients) {
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: recipient.email,
        subject,
        html: layout(subject, body),
      })
      if (error) {
        console.error(`[email] sendDrawResults error for ${recipient.email}:`, error)
        errors.push(`${recipient.email}: ${error.message}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[email] sendDrawResults exception for ${recipient.email}:`, msg)
      errors.push(`${recipient.email}: ${msg}`)
    }
  }

  return errors.length > 0 ? { error: errors.join('; ') } : {}
}

// ─── sendOverflowNotification ─────────────────────────────────────────────────

export async function sendOverflowNotification(
  to: string,
  name: string,
  clubName: string,
  raceDate: Date,
  priorityLevel: number,
): Promise<{ error?: string }> {
  if (checkApiKey()) return {}

  const dateStr = formatShortDate(raceDate)
  const subject = `You were not paired this week — ${clubName}`

  const ordinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  const body = `
    ${h1('You were not paired this week')}
    <p style="margin:4px 0 20px;color:#64748b;font-size:14px;">${clubName} &mdash; Friday ${formatDate(raceDate)}</p>
    ${para(`Hi ${name},`)}
    ${para(`Unfortunately you were not paired for the race on <strong>${dateStr}</strong> at <strong>${clubName}</strong>. This can happen when there aren’t enough sailors in the complementary role, or when the boat limit is reached.`)}
    <div style="background:#faf5ff;border:1px solid #d8b4fe;border-radius:6px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;color:#6b21a8;font-size:15px;font-weight:600;">&#9733; You have overflow priority ${ordinal(priorityLevel)} for next week</p>
      <p style="margin:6px 0 0;color:#7c3aed;font-size:14px;">If you register for next week’s race, you will receive priority placement in the draw. The lower your priority number, the higher your priority.</p>
    </div>
    ${para('Register early to make sure you’re included:')}
    ${ctaButton(`${APP_URL}/dashboard`, 'Register for next race')}
    ${para('<span style="color:#94a3b8;font-size:13px;">We hope to see you on the water next week!</span>')}
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: layout(subject, body),
    })
    if (error) {
      console.error('[email] sendOverflowNotification error:', error)
      return { error: error.message }
    }
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] sendOverflowNotification exception:', msg)
    return { error: msg }
  }
}

// ─── sendRaceCancellationNotification ─────────────────────────────────────────

export async function sendRaceCancellationNotification(
  recipients: Array<{ email: string; name: string }>,
  clubName: string,
  raceDate: Date,
  reason?: string,
): Promise<{ error?: string }> {
  if (checkApiKey()) return {}

  const dateStr = formatShortDate(raceDate)
  const subject = `Race cancelled — ${clubName} Friday ${dateStr}`

  const reasonBlock = reason
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:14px 18px;margin:16px 0;">
        <p style="margin:0;color:#9a3412;font-size:14px;font-weight:600;">Reason</p>
        <p style="margin:6px 0 0;color:#c2410c;font-size:14px;">${reason}</p>
      </div>`
    : ''

  const body = `
    ${h1('Race cancelled')}
    <p style="margin:4px 0 20px;color:#64748b;font-size:14px;">${clubName} &mdash; Friday ${formatDate(raceDate)}</p>
    ${para(`The race scheduled for <strong>${dateStr}</strong> at <strong>${clubName}</strong> has been cancelled.`)}
    ${reasonBlock}
    ${para('Any pairings from the draw for this race are now cancelled. If you had overflow priority, please note that priority carries over at the discretion of your race chair.')}
    ${divider()}
    ${ctaButton(`${APP_URL}/dashboard`, 'View upcoming races')}
    ${para('<span style="color:#94a3b8;font-size:13px;">We hope to see you on the water soon.</span>')}
  `

  const errors: string[] = []
  for (const recipient of recipients) {
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: recipient.email,
        subject,
        html: layout(subject, body),
      })
      if (error) {
        console.error(`[email] sendRaceCancellationNotification error for ${recipient.email}:`, error)
        errors.push(`${recipient.email}: ${error.message}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[email] sendRaceCancellationNotification exception for ${recipient.email}:`, msg)
      errors.push(`${recipient.email}: ${msg}`)
    }
  }

  return errors.length > 0 ? { error: errors.join('; ') } : {}
}

// ─── sendPasswordResetEmail ────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<{ error?: string }> {
  if (checkApiKey()) return {}

  const subject = 'Reset your FNR RaceDraw password'

  const body = `
    ${h1('Reset your password')}
    ${para('We received a request to reset the password for your FNR RaceDraw account. Click the button below to set a new password:')}
    ${ctaButton(resetUrl, 'Reset password')}
    ${divider()}
    ${para('<strong>This link expires in 1 hour.</strong> If you didn’t request a password reset, you can safely ignore this email — your password will not be changed.')}
    ${para('<span style="color:#94a3b8;font-size:13px;">For security, this link can only be used once.</span>')}
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: layout(subject, body),
    })
    if (error) {
      console.error('[email] sendPasswordResetEmail error:', error)
      return { error: error.message }
    }
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] sendPasswordResetEmail exception:', msg)
    return { error: msg }
  }
}

// ─── sendAccountDeletionConfirmation ──────────────────────────────────────────

export async function sendAccountDeletionConfirmation(
  to: string,
  name: string,
): Promise<{ error?: string }> {
  if (checkApiKey()) return {}

  const subject = 'Your FNR RaceDraw account has been deleted'

  const body = `
    ${h1('Account deleted')}
    ${para(`Hi ${name},`)}
    ${para('Your FNR RaceDraw account has been permanently deleted as requested. You will no longer receive emails from us.')}
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 18px;margin:16px 0;">
      <p style="margin:0;color:#64748b;font-size:14px;font-weight:600;">What happens to your data?</p>
      <p style="margin:6px 0 0;color:#94a3b8;font-size:14px;">Your draw history is retained anonymously to preserve the integrity of historical race records. Your personal information (name, email, phone) has been removed.</p>
    </div>
    ${para('If this was a mistake or you’d like to get back on the water, please contact your race chair or reach out to us at <a href="mailto:support@racedraw.app" style="color:#0f172a;">support@racedraw.app</a>.')}
    ${para('<span style="color:#94a3b8;font-size:13px;">Thanks for sailing with us.</span>')}
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: layout(subject, body),
    })
    if (error) {
      console.error('[email] sendAccountDeletionConfirmation error:', error)
      return { error: error.message }
    }
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] sendAccountDeletionConfirmation exception:', msg)
    return { error: msg }
  }
}

// ─── sendNoDrawEmail ──────────────────────────────────────────────────────────

export async function sendNoDrawEmail(
  recipients: Array<{ email: string; name: string }>,
  clubName: string,
  raceDate: Date,
  reason: 'no_registrations' | 'insufficient_roles',
): Promise<{ error?: string }> {
  if (checkApiKey()) return {}

  const dateStr = formatShortDate(raceDate)
  const subject = `Draw cancelled — insufficient registrations — ${clubName}`

  const reasonText =
    reason === 'no_registrations'
      ? 'there were no registrations for this race.'
      : 'there were not enough helms or crews — the draw requires at least one of each role.'

  const body = `
    ${h1('Draw cancelled')}
    <p style="margin:4px 0 20px;color:#64748b;font-size:14px;">${clubName} &mdash; Friday ${formatDate(raceDate)}</p>
    ${para(`The draw for the race on <strong>${dateStr}</strong> at <strong>${clubName}</strong> was cancelled because ${reasonText}`)}
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:14px 18px;margin:16px 0;">
      <p style="margin:0;color:#991b1b;font-size:14px;">No pairings were made for this race. There is nothing you need to do.</p>
    </div>
    ${para('Keep an eye out for next week’s draw. The more sailors who register, the better the chance everyone gets paired!')}
    ${divider()}
    ${ctaButton(`${APP_URL}/dashboard`, 'View upcoming races')}
  `

  const errors: string[] = []
  for (const recipient of recipients) {
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: recipient.email,
        subject,
        html: layout(subject, body),
      })
      if (error) {
        console.error(`[email] sendNoDrawEmail error for ${recipient.email}:`, error)
        errors.push(`${recipient.email}: ${error.message}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[email] sendNoDrawEmail exception for ${recipient.email}:`, msg)
      errors.push(`${recipient.email}: ${msg}`)
    }
  }

  return errors.length > 0 ? { error: errors.join('; ') } : {}
}
