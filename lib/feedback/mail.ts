import 'server-only';

import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';

import { getSmtpConfig } from '../env.ts';

/**
 * Optional SMTP notification for feedback (spec §9).
 *
 * Email here is a courtesy on top of the database, never the delivery
 * mechanism: submissions are stored first, and the admin inbox works with zero
 * SMTP configuration. That is what makes a hand-written SMTP client a
 * reasonable trade rather than a reckless one — every failure path degrades to
 * "the airport reads it in the panel", which is the documented default.
 *
 * Written against node:net and node:tls rather than pulling in a mail library,
 * to keep the dependency list at what the application actually needs. The
 * surface used is small and old: EHLO, STARTTLS, AUTH, MAIL, RCPT, DATA, QUIT.
 */

export interface MailMessage {
  to: string;
  from: string;
  /** Where a reply should go — the visitor. Attacker-controlled, so sanitised. */
  replyTo?: string | null;
  subject: string;
  text: string;
}

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

/** An unreachable or slow mail server must never hold a page request open. */
const TIMEOUT_MS = 10_000;

/**
 * Header values are single-line by definition. A CR or LF in one lets the
 * sender append headers of their own — the classic mail header injection, and
 * the visitor's own address is the field they control.
 */
function sanitiseHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * RFC 2047 encoded-word, chunked.
 *
 * A Kazakh or Russian subject is not ASCII, and an encoded word may not exceed
 * 75 characters — so a long subject has to be split into several. Chunking is
 * done over code points, never bytes, because splitting a multi-byte character
 * in half produces mojibake in the recipient's client.
 */
export function encodeMailHeader(value: string): string {
  const clean = sanitiseHeaderValue(value);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;

  const chunks: string[] = [];
  let current = '';

  for (const character of clean) {
    const candidate = current + character;
    // 45 UTF-8 bytes encodes to 60 base64 characters, leaving room for the
    // `=?UTF-8?B?` prefix and `?=` suffix inside the 75-character limit.
    if (Buffer.byteLength(candidate, 'utf8') > 45) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current !== '') chunks.push(current);

  return chunks
    .map((chunk) => `=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`)
    .join('\r\n ');
}

/**
 * Builds the RFC 5322 message.
 *
 * The body is base64 with a declared UTF-8 charset. That is not decoration: it
 * removes line-length limits and dot-stuffing (a body line beginning with `.`
 * would otherwise terminate the DATA command early) in one move, because the
 * base64 alphabet contains neither long lines nor a leading dot.
 */
export function buildMessage(message: MailMessage): string {
  const headers = [
    `From: ${sanitiseHeaderValue(message.from)}`,
    `To: ${sanitiseHeaderValue(message.to)}`,
    `Subject: ${encodeMailHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ];

  const replyTo = message.replyTo ? sanitiseHeaderValue(message.replyTo) : null;
  // Only a plain address is accepted. Anything with a space, a comma or angle
  // brackets is a display name or a list, i.e. an attempt to shape the header.
  if (replyTo && /^[^\s@,<>]+@[^\s@,<>]+$/.test(replyTo)) {
    headers.push(`Reply-To: ${replyTo}`);
  }

  const body =
    Buffer.from(message.text, 'utf8')
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? '';

  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

/** A live SMTP conversation. One per message; not pooled. */
class SmtpSession {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = '';
  private waiter: {
    resolve: (response: string) => void;
    reject: (error: Error) => void;
  } | null = null;
  private failure: Error | null = null;

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.attach();
  }

  private attach(): void {
    this.socket.setEncoding('utf8');
    this.socket.setTimeout(TIMEOUT_MS);

    this.socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.drain();
    });
    this.socket.on('error', (error: Error) => this.fail(error));
    this.socket.on('timeout', () => this.fail(new Error('SMTP timed out')));
    this.socket.on('close', () => this.fail(new Error('SMTP connection closed')));
  }

  /**
   * A reply may span several lines: `250-SIZE`, `250-STARTTLS`, `250 HELP`. It
   * is complete only when a line has a space after the status code rather than
   * a hyphen.
   */
  private drain(): void {
    if (!this.waiter) return;

    const lines = this.buffer.split('\r\n');
    const final = lines.findIndex((line) => /^\d{3} /.test(line));
    if (final === -1) return;

    const response = lines.slice(0, final + 1).join('\r\n');
    this.buffer = lines.slice(final + 1).join('\r\n');

    const waiter = this.waiter;
    this.waiter = null;
    waiter.resolve(response);
  }

  private fail(error: Error): void {
    this.failure = error;
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(error);
  }

  read(): Promise<string> {
    if (this.failure) return Promise.reject(this.failure);

    return new Promise<string>((resolve, reject) => {
      this.waiter = { resolve, reject };
      this.drain();
    });
  }

  /** Sends a command and returns the reply, throwing on an unexpected code. */
  async command(line: string, expected: number): Promise<string> {
    this.socket.write(`${line}\r\n`);
    const response = await this.read();

    const code = Number(response.slice(0, 3));
    if (code !== expected) {
      throw new Error(`SMTP: expected ${expected}, got ${response.split('\r\n')[0]}`);
    }
    return response;
  }

  /** Replaces the plain socket with a TLS one after STARTTLS. */
  upgrade(host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.removeAllListeners();
      const secure = tls.connect({ socket: this.socket as net.Socket, servername: host }, () => {
        this.socket = secure;
        this.buffer = '';
        this.attach();
        resolve();
      });
      secure.once('error', reject);
    });
  }

  close(): void {
    this.socket.removeAllListeners();
    this.socket.destroy();
  }
}

function connect(host: string, port: number): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    // 465 is implicit TLS ("smtps"); everything else starts in the clear and is
    // upgraded with STARTTLS if the server offers it.
    const socket =
      port === 465
        ? tls.connect({ host, port, servername: host }, () => resolve(socket))
        : net.connect({ host, port }, () => resolve(socket));

    socket.setTimeout(TIMEOUT_MS);
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('SMTP connection timed out')));
  });
}

export function createSmtpProvider(
  config: NonNullable<ReturnType<typeof getSmtpConfig>>
): MailProvider {
  return {
    name: 'smtp',

    async send(message: MailMessage): Promise<void> {
      const session = new SmtpSession(await connect(config.host, config.port));

      try {
        await session.read(); // 220 greeting

        const clientName = os.hostname() || 'localhost';
        let capabilities = await session.command(`EHLO ${clientName}`, 250);

        if (config.port !== 465 && /STARTTLS/i.test(capabilities)) {
          await session.command('STARTTLS', 220);
          await session.upgrade(config.host);
          // Capabilities are re-advertised on the secure channel, and only the
          // ones offered after the upgrade may be trusted.
          capabilities = await session.command(`EHLO ${clientName}`, 250);
        }

        if (config.user && config.pass) {
          if (/AUTH[ =-][^\r\n]*PLAIN/i.test(capabilities)) {
            const credentials = Buffer.from(`\0${config.user}\0${config.pass}`, 'utf8').toString(
              'base64'
            );
            await session.command(`AUTH PLAIN ${credentials}`, 235);
          } else {
            await session.command('AUTH LOGIN', 334);
            await session.command(Buffer.from(config.user, 'utf8').toString('base64'), 334);
            await session.command(Buffer.from(config.pass, 'utf8').toString('base64'), 235);
          }
        }

        await session.command(`MAIL FROM:<${sanitiseHeaderValue(message.from)}>`, 250);
        await session.command(`RCPT TO:<${sanitiseHeaderValue(message.to)}>`, 250);
        await session.command('DATA', 354);
        await session.command(`${buildMessage(message)}\r\n.`, 250);
        await session.command('QUIT', 221);
      } finally {
        session.close();
      }
    },
  };
}

/** Renders a submission as the plain-text body of the notification. */
export function formatFeedbackEmail(submission: {
  name: string;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string;
  locale: string;
  createdAt: string;
}): string {
  return [
    `Name:     ${submission.name}`,
    `Email:    ${submission.email ?? '—'}`,
    `Phone:    ${submission.phone ?? '—'}`,
    `Subject:  ${submission.subject ?? '—'}`,
    `Language: ${submission.locale}`,
    `Received: ${submission.createdAt}`,
    '',
    submission.message,
    '',
    '— This message was stored in the admin panel; email is a copy.',
  ].join('\n');
}

/**
 * Sends the notification if SMTP is configured, and otherwise does nothing.
 *
 * Returns whether an email went out, and never throws. The submission is
 * already saved by the time this runs, so a mail failure must not turn a
 * successful report into an error page for the person who filed it.
 */
export async function notifyFeedback(
  submission: Parameters<typeof formatFeedbackEmail>[0],
  provider?: MailProvider
): Promise<boolean> {
  const config = getSmtpConfig();
  if (!config) return false;

  const transport = provider ?? createSmtpProvider(config);

  try {
    await transport.send({
      to: config.to,
      from: config.from,
      replyTo: submission.email,
      subject: `Feedback: ${submission.subject ?? submission.name}`,
      text: formatFeedbackEmail(submission),
    });
    return true;
  } catch (error) {
    // Logged, not surfaced. The airport still has the submission.
    console.error('[feedback] SMTP notification failed:', error);
    return false;
  }
}
