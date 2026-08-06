import net from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildMessage, encodeMailHeader, notifyFeedback } from '@/lib/feedback/mail';

/**
 * The hand-written SMTP client (spec §9, Stage 7 exit criteria).
 *
 * Stage 7 must be verified both with SMTP absent and with it present. "Present"
 * is covered here against a real socket rather than a mocked one: the whole
 * risk of not taking a mail dependency sits in the wire conversation, so a test
 * that stubbed the transport would assert nothing worth knowing.
 */

interface CapturedMail {
  from: string;
  to: string;
  data: string;
}

interface FakeServer {
  port: number;
  received: CapturedMail[];
  close(): Promise<void>;
}

/** A deliberately minimal ESMTP server: enough verbs for one message. */
function startFakeSmtp(options: { requireAuth?: boolean } = {}): Promise<FakeServer> {
  const received: CapturedMail[] = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');

    let buffer = '';
    let inData = false;
    let dataLines: string[] = [];
    let current: { from: string; to: string } = { from: '', to: '' };

    socket.write('220 fake.test ESMTP\r\n');

    socket.on('data', (chunk: string) => {
      buffer += chunk;

      for (;;) {
        const end = buffer.indexOf('\r\n');
        if (end === -1) break;

        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            received.push({ ...current, data: dataLines.join('\r\n') });
            dataLines = [];
            socket.write('250 queued\r\n');
          } else {
            dataLines.push(line);
          }
          continue;
        }

        const verb = line.split(' ')[0]?.toUpperCase();

        if (verb === 'EHLO') {
          socket.write(
            options.requireAuth
              ? '250-fake.test\r\n250-SIZE 10240000\r\n250 AUTH PLAIN LOGIN\r\n'
              : '250-fake.test\r\n250 SIZE 10240000\r\n'
          );
        } else if (verb === 'AUTH') {
          socket.write('235 authenticated\r\n');
        } else if (verb === 'MAIL') {
          current = { from: line.slice(line.indexOf('<') + 1, line.lastIndexOf('>')), to: '' };
          socket.write('250 ok\r\n');
        } else if (verb === 'RCPT') {
          current.to = line.slice(line.indexOf('<') + 1, line.lastIndexOf('>'));
          socket.write('250 ok\r\n');
        } else if (verb === 'DATA') {
          inData = true;
          socket.write('354 go ahead\r\n');
        } else if (verb === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        } else {
          socket.write('250 ok\r\n');
        }
      }
    });

    socket.on('error', () => {
      /* the client hangs up after QUIT */
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      resolve({
        port: address.port,
        received,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

const submission = {
  name: 'Айгүл Серікова',
  email: 'aigul@example.kz',
  phone: '+7 701 000 00 00',
  subject: 'Жоғалған зат',
  message: 'Мен сейсенбіде тіркеу орнында көк рюкзак қалдырдым.',
  locale: 'kk',
  createdAt: '2026-01-01T09:00:00.000Z',
};

const SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_TO', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS'];

beforeEach(() => {
  for (const name of SMTP_VARS) delete process.env[name];
});

afterEach(() => {
  for (const name of SMTP_VARS) delete process.env[name];
});

describe('notifyFeedback with SMTP absent', () => {
  it('does nothing and reports that nothing was sent', async () => {
    // The documented default (spec §9): the submission lives in the database
    // and the admin inbox, and no mail is attempted.
    await expect(notifyFeedback(submission)).resolves.toBe(false);
  });
});

describe('notifyFeedback with SMTP present', () => {
  let server: FakeServer;

  afterEach(async () => {
    await server?.close();
  });

  it('delivers the submission over a real SMTP conversation', async () => {
    server = await startFakeSmtp({ requireAuth: true });

    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(server.port);
    process.env.SMTP_TO = 'feedback@hsairport.kz';
    process.env.SMTP_FROM = 'noreply@hsairport.kz';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASS = 'secret';

    await expect(notifyFeedback(submission)).resolves.toBe(true);

    expect(server.received).toHaveLength(1);
    const mail = server.received[0]!;
    expect(mail.from).toBe('noreply@hsairport.kz');
    expect(mail.to).toBe('feedback@hsairport.kz');

    // The body is base64 so that no line length or leading dot can terminate
    // the DATA command early; decoding it proves the round trip.
    const [headers, body] = mail.data.split('\r\n\r\n');
    expect(headers).toContain('To: feedback@hsairport.kz');
    expect(headers).toContain('Reply-To: aigul@example.kz');
    expect(headers).toContain('Content-Transfer-Encoding: base64');

    const decoded = Buffer.from(body!.replace(/\r\n/g, ''), 'base64').toString('utf8');
    expect(decoded).toContain('Мен сейсенбіде тіркеу орнында көк рюкзак қалдырдым.');
    expect(decoded).toContain('aigul@example.kz');
  });

  it('sends without authenticating when no credentials are configured', async () => {
    server = await startFakeSmtp({ requireAuth: false });

    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(server.port);
    process.env.SMTP_TO = 'feedback@hsairport.kz';

    await expect(notifyFeedback(submission)).resolves.toBe(true);
    expect(server.received).toHaveLength(1);
  });

  it('reports failure rather than throwing when the server is unreachable', async () => {
    server = await startFakeSmtp();
    const deadPort = server.port;
    await server.close();

    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(deadPort);
    process.env.SMTP_TO = 'feedback@hsairport.kz';

    // The submission is already stored by the time this runs, so a mail outage
    // must never become an error for the person who filed it.
    await expect(notifyFeedback(submission)).resolves.toBe(false);
  });
});

describe('message construction', () => {
  it('leaves an ASCII subject alone', () => {
    expect(encodeMailHeader('Lost property')).toBe('Lost property');
  });

  it('encodes a Cyrillic subject as RFC 2047 encoded words', () => {
    const encoded = encodeMailHeader('Жоғалған зат');
    expect(encoded).toMatch(/^=\?UTF-8\?B\?/);

    const decoded = encoded
      .split(/\r\n /)
      .map((word) => Buffer.from(word.slice(10, -2), 'base64').toString('utf8'))
      .join('');
    expect(decoded).toBe('Жоғалған зат');
  });

  it('splits a long non-ASCII subject into several encoded words', () => {
    // An encoded word may not exceed 75 characters, so a long Kazakh subject
    // has to be chunked — and chunked on code points, or the split lands
    // mid-character and the recipient sees mojibake.
    const long = 'Ұшу кестесі туралы сұрақ '.repeat(6).trim();
    const encoded = encodeMailHeader(long);

    const words = encoded.split(/\r\n /);
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) expect(word.length).toBeLessThanOrEqual(75);

    const decoded = words
      .map((word) => Buffer.from(word.slice(10, -2), 'base64').toString('utf8'))
      .join('');
    expect(decoded).toBe(long);
  });

  it('strips CR and LF from headers, so a sender cannot inject their own', () => {
    // The visitor controls the address that becomes Reply-To.
    const message = buildMessage({
      to: 'feedback@hsairport.kz',
      from: 'noreply@hsairport.kz',
      replyTo: 'evil@example.com',
      subject: 'Hello\r\nBcc: victim@example.com',
      text: 'body',
    });

    // The injected text survives as inert content inside the Subject value.
    // What must not survive is a header: no line may *begin* with `Bcc:`.
    const headerLines = message.split('\r\n\r\n')[0]!.split('\r\n');
    expect(headerLines.some((line) => /^bcc:/i.test(line))).toBe(false);
    expect(headerLines).toContain('Subject: Hello Bcc: victim@example.com');
  });

  it('refuses a Reply-To that is not a bare address', () => {
    for (const replyTo of ['a@b.com, c@d.com', 'Name <a@b.com>', 'not an address']) {
      const message = buildMessage({
        to: 'feedback@hsairport.kz',
        from: 'noreply@hsairport.kz',
        replyTo,
        subject: 'Subject',
        text: 'body',
      });
      expect(message, replyTo).not.toContain('Reply-To:');
    }
  });
});
