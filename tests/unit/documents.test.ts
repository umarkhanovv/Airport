import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_TYPES,
  STORED_NAME_RE,
  displayFilename,
  extensionOf,
  titleFromFilename,
} from '@/lib/documents/types';

/**
 * Document naming (Stage 10 follow-up, spec §5).
 *
 * These files arrive from a WordPress uploads folder, so their names carry
 * everything the legacy site accumulated: Cyrillic, spaces, quotes, numbers
 * and the occasional path separator. None of it may ever reach a filesystem
 * path — the stored name is generated, and the uploaded one is kept only to
 * show and to send back as the download filename.
 */

describe('displayFilename', () => {
  it('keeps only the last segment, so a path cannot survive', () => {
    expect(displayFilename('../../etc/passwd')).toBe('passwd');
    expect(displayFilename('C:\\Users\\admin\\приказ.docx')).toBe('приказ.docx');
    expect(displayFilename('/var/www/Тариф.pdf')).toBe('Тариф.pdf');
  });

  it('keeps Cyrillic, which is what these files are actually called', () => {
    expect(displayFilename('Протокол-вскрытия-ВВЛ-1495кв.pdf')).toBe(
      'Протокол-вскрытия-ВВЛ-1495кв.pdf'
    );
  });

  it('strips what would break a Content-Disposition header', () => {
    expect(displayFilename('приказ"КД.docx')).toBe('приказКД.docx');
    expect(displayFilename('order\u0000\u001f.pdf')).toBe('order.pdf');
  });

  it('never returns nothing', () => {
    expect(displayFilename('')).toBe('document');
    expect(displayFilename('///')).toBe('document');
  });

  it('caps the length, so a row cannot be bloated by a filename', () => {
    expect(displayFilename(`${'а'.repeat(400)}.pdf`).length).toBe(160);
  });
});

describe('titleFromFilename', () => {
  it('reads as a title rather than as a filename', () => {
    expect(titleFromFilename('Тариф-с-индекс-СН-2026г.pdf')).toBe('Тариф с индекс СН 2026г');
    expect(titleFromFilename('приказ_КД_10.docx')).toBe('приказ КД 10');
  });

  it('survives a name that is nothing but an extension', () => {
    expect(titleFromFilename('.pdf')).toBe('.pdf');
  });
});

describe('extensionOf', () => {
  it('is lowercased, so .PDF and .pdf are the same format', () => {
    expect(extensionOf('ORDER.PDF')).toBe('.pdf');
    expect(extensionOf('order.pdf')).toBe('.pdf');
  });

  it('is empty when there is no extension, rather than guessing', () => {
    expect(extensionOf('order')).toBe('');
  });

  it('takes the last dot, not the first', () => {
    expect(extensionOf('тариф.2026.xlsx')).toBe('.xlsx');
  });
});

describe('the served formats', () => {
  it('are the ones the airport actually publishes', () => {
    for (const extension of ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip']) {
      expect(DOCUMENT_TYPES[extension], extension).toBeDefined();
    }
  });

  it('do not include anything a browser would execute', () => {
    for (const extension of ['.html', '.htm', '.svg', '.js', '.xml', '.exe', '.sh']) {
      expect(DOCUMENT_TYPES[extension], extension).toBeUndefined();
    }
  });
});

describe('STORED_NAME_RE', () => {
  it('accepts a generated name and nothing else', () => {
    expect(STORED_NAME_RE.test('0f8fad5b-d9cb-469f-a165-70867728950e.pdf')).toBe(true);

    // The point of the check: a name from the database becomes a path, so
    // anything that is not one this application generated is refused rather
    // than sanitised.
    for (const name of [
      '../../../etc/passwd',
      '0f8fad5b-d9cb-469f-a165-70867728950e.pdf/../x',
      'приказ.pdf',
      '0f8fad5b-d9cb-469f-a165-70867728950e.html',
      '0f8fad5b-d9cb-469f-a165-70867728950e',
    ]) {
      expect(STORED_NAME_RE.test(name), name).toBe(false);
    }
  });
});
