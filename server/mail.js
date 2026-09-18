// Sending mail, without a dependency.
//
// The server side of this project has exactly one runtime dependency (pg), and adding one
// more before a deadline means every teammate needs a successful `npm install` before the
// app runs at all. SMTP submission is a small, stable protocol, so this speaks it directly
// over an implicit-TLS socket.
//
// It degrades the same way the Gemini key does: with nothing configured, `sendMail` reports
// that it did not send and the caller carries on. Nothing in this app may break because mail
// is unavailable — an admission plan is not worth less because a message did not go out.
//
// Configure in .env (never in git):
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=465
//   SMTP_USER=path2uni.edu@gmail.com
//   SMTP_PASS=<a Google App Password, not the account password>
//   MAIL_FROM="Path2Uni <path2uni.edu@gmail.com>"
//
// Gmail has required an App Password since 2022, and it only exists once 2-Step
// Verification is on for that Google account.

import { connect } from 'node:tls'
import './env.js'

const config = () => ({
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
})

export const mailReady = () => {
  const { host, user, pass } = config()
  return Boolean(host && user && pass)
}

/** Subjects and names are not ASCII in two of our three languages. */
const encodeHeader = value => /^[\x20-\x7E]*$/.test(value)
  ? value
  : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`

const base64Body = text => {
  const encoded = Buffer.from(text, 'utf8').toString('base64')
  // RFC 2045: no line longer than 76 characters.
  return (encoded.match(/.{1,76}/g) ?? []).join('\r\n')
}

/**
 * One conversation with the server. Written as a queue of expected reply codes rather than a
 * state machine, because SMTP is strictly turn-based and a queue is the honest shape of it.
 */
function converse(socket, steps, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let index = 0
    let settled = false

    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeAllListeners('data')
      error ? reject(error) : resolve(value)
    }
    const timer = setTimeout(() => finish(new Error('SMTP timeout')), timeoutMs)

    const next = () => {
      if (index >= steps.length) return finish(null, true)
      const step = steps[index]
      if (step.send !== undefined) socket.write(step.send + '\r\n')
    }

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8')
      // A reply ends with "<code><space>" on its own line; "<code>-" means more to come.
      let match
      while ((match = /^(\d{3})([ -])(.*)\r?\n/m.exec(buffer))) {
        const [line, code, separator] = match
        buffer = buffer.slice(match.index + line.length)
        if (separator === '-') continue
        const step = steps[index]
        if (!step) return finish(null, true)
        if (!step.expect.includes(Number(code))) {
          return finish(new Error(`SMTP ${code} at step ${index}: ${match[3].slice(0, 120)}`))
        }
        index += 1
        next()
      }
    })

    socket.on('error', error => finish(error))
    socket.on('close', () => finish(settled ? null : new Error('SMTP closed early')))
  })
}

/**
 * @returns {{sent: boolean, reason?: string}} — never throws, so a failed send cannot take a
 * request down with it.
 */
export async function sendMail({ to, subject, text, timeoutMs = 15_000 }) {
  const { host, port, user, pass, from } = config()
  if (!host || !user || !pass) return { sent: false, reason: 'not_configured' }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { sent: false, reason: 'bad_address' }

  const headers = [
    `From: ${from.includes('<') ? from.replace(/^[^<]*/, name => encodeHeader(name.trim()) + ' ') : from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    `Date: ${new Date().toUTCString()}`,
  ].join('\r\n')

  const envelope = user.replace(/^.*<|>.*$/g, '')
  const socket = connect({ host, port, servername: host })
  try {
    await new Promise((resolve, reject) => {
      socket.once('secureConnect', resolve)
      socket.once('error', reject)
      setTimeout(() => reject(new Error('SMTP connect timeout')), timeoutMs).unref?.()
    })
    await converse(socket, [
      { expect: [220] },
      { send: `EHLO path2uni`, expect: [250] },
      { send: 'AUTH LOGIN', expect: [334] },
      { send: Buffer.from(envelope, 'utf8').toString('base64'), expect: [334] },
      { send: Buffer.from(pass, 'utf8').toString('base64'), expect: [235] },
      { send: `MAIL FROM:<${envelope}>`, expect: [250] },
      { send: `RCPT TO:<${to}>`, expect: [250, 251] },
      { send: 'DATA', expect: [354] },
      // A lone dot ends the message, so any line that is just a dot must be escaped.
      { send: `${headers}\r\n\r\n${base64Body(text)}\r\n.`, expect: [250] },
      { send: 'QUIT', expect: [221] },
    ], timeoutMs)
    return { sent: true }
  } catch (error) {
    return { sent: false, reason: String(error.message).slice(0, 160) }
  } finally {
    socket.destroy()
  }
}
