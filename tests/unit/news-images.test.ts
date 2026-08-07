import { describe, expect, it } from 'vitest';

import { detectImageExtension } from '@/lib/news/images';

/**
 * Cover image format detection (Stage 6, plan §9.1).
 *
 * The extension a cover is stored under is decided from its bytes, never from
 * what the uploader called it — `app/api/news/image/[name]` picks the response
 * content type from that extension, so a file that lied about its type would be
 * served as whatever it claimed to be.
 */

/** Just the header. Nothing here needs to be a decodable image. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);

function container(marker: string, brand: string): Buffer {
  return Buffer.concat([
    Buffer.alloc(4), // length field
    Buffer.from(marker, 'latin1'),
    Buffer.from(brand, 'latin1'),
    Buffer.alloc(16),
  ]);
}

const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.alloc(4),
  Buffer.from('WEBP', 'latin1'),
  Buffer.alloc(16),
]);

describe('detectImageExtension', () => {
  it('recognises the four formats the serving route will return', () => {
    expect(detectImageExtension(JPEG)).toBe('.jpg');
    expect(detectImageExtension(PNG)).toBe('.png');
    expect(detectImageExtension(WEBP)).toBe('.webp');
    expect(detectImageExtension(container('ftyp', 'avif'))).toBe('.avif');
  });

  it('recognises an AVIF image sequence, which shares the type', () => {
    expect(detectImageExtension(container('ftyp', 'avis'))).toBe('.avif');
  });

  it('refuses anything else, whatever it is called', () => {
    // The interesting cases: things that arrive with an image extension and a
    // convincing name. An HTML file served as an image is the one that matters.
    expect(detectImageExtension(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectImageExtension(Buffer.from('GIF89a' + 'x'.repeat(20)))).toBeNull();
    expect(detectImageExtension(Buffer.from('%PDF-1.7\n' + 'x'.repeat(20)))).toBeNull();
    expect(
      detectImageExtension(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]))
    ).toBeNull();
  });

  it('refuses a file too short to identify rather than guessing', () => {
    expect(detectImageExtension(Buffer.alloc(0))).toBeNull();
    expect(detectImageExtension(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it('does not mistake a RIFF container that is not WebP', () => {
    // A .wav is RIFF too, and would otherwise be stored and served as an image.
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.alloc(4),
      Buffer.from('WAVE', 'latin1'),
      Buffer.alloc(16),
    ]);

    expect(detectImageExtension(wav)).toBeNull();
  });

  it('does not mistake another ISO base media brand for AVIF', () => {
    // An .mp4 has the same `ftyp` marker with a different brand.
    expect(detectImageExtension(container('ftyp', 'isom'))).toBeNull();
    expect(detectImageExtension(container('ftyp', 'mp42'))).toBeNull();
  });
});
