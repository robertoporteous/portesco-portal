import { describe, it, expect } from 'vitest';
import { redactPII, unredactPII, type RedactContext } from '@/lib/ai/redact';

const ctx = (kids: RedactContext['kidsEnrolled']): RedactContext => ({
  kidsEnrolled: kids,
});

const kid = (i: number, fullName: string, aliases?: string[]) => ({
  id: `k${i}`,
  fullName,
  ...(aliases ? { aliases } : {}),
});

describe('redactPII — student names', () => {
  it('1. redacts a single full name to [STUDENT_1]', () => {
    const { redactedText, mappings } = redactPII(
      'Carlos García marcó un gol.',
      ctx([kid(1, 'Carlos García')])
    );
    expect(redactedText).toBe('[STUDENT_1] marcó un gol.');
    expect(mappings['[STUDENT_1]']).toBe('Carlos García');
  });

  it('2. assigns different placeholders to different kids', () => {
    const { redactedText, mappings } = redactPII(
      'Carlos García pasó a Sebastián Pérez.',
      ctx([kid(1, 'Carlos García'), kid(2, 'Sebastián Pérez')])
    );
    expect(redactedText).toBe('[STUDENT_1] pasó a [STUDENT_2].');
    expect(mappings['[STUDENT_1]']).toBe('Carlos García');
    expect(mappings['[STUDENT_2]']).toBe('Sebastián Pérez');
  });

  it('3. uses the same placeholder for the same kid mentioned N times', () => {
    const { redactedText } = redactPII(
      'Carlos García dominó. Carlos García también anotó. Y otra vez Carlos García.',
      ctx([kid(1, 'Carlos García')])
    );
    expect(redactedText).toBe(
      '[STUDENT_1] dominó. [STUDENT_1] también anotó. Y otra vez [STUDENT_1].'
    );
  });

  it('4. handles compound Spanish names with four tokens', () => {
    const { redactedText, mappings } = redactPII(
      'María José García López trabajó muy bien.',
      ctx([kid(1, 'María José García López')])
    );
    expect(redactedText).toBe('[STUDENT_1] trabajó muy bien.');
    expect(mappings['[STUDENT_1]']).toBe('María José García López');
  });

  it('5. matches across accent variants both directions', () => {
    // Kid stored with accents, text without accents.
    const a = redactPII(
      'Andres Nunez marcó dos goles.',
      ctx([kid(1, 'Andrés Núñez')])
    );
    expect(a.redactedText).toBe('[STUDENT_1] marcó dos goles.');

    // Kid stored without accents, text with accents.
    const b = redactPII(
      'Andrés Núñez marcó dos goles.',
      ctx([kid(1, 'Andres Nunez')])
    );
    expect(b.redactedText).toBe('[STUDENT_1] marcó dos goles.');
  });

  it('6. matches case-insensitively', () => {
    const { redactedText } = redactPII(
      'MARÍA destacó, maría escuchó, María corrió.',
      ctx([kid(1, 'María Vélez')])
    );
    // Only the first token "María" is the kid's first name + last name "Vélez"
    // is not in the text; we provided a fullName "María Vélez" so the match
    // requires both tokens. Replace test: use a fullName that is one word.
    expect(redactedText).toBe('MARÍA destacó, maría escuchó, María corrió.');

    // Now the actual case-insensitive check with single token.
    const single = redactPII(
      'MARÍA destacó, maría escuchó, María corrió.',
      ctx([kid(1, 'María')])
    );
    expect(single.redactedText).toBe(
      '[STUDENT_1] destacó, [STUDENT_1] escuchó, [STUDENT_1] corrió.'
    );
  });

  it('7. matches alias to the same placeholder as the kid', () => {
    const { redactedText, mappings } = redactPII(
      'J.J. está en buena forma.',
      ctx([kid(1, 'Juan José Hernández', ['J.J.'])])
    );
    expect(redactedText).toBe('[STUDENT_1] está en buena forma.');
    expect(mappings['[STUDENT_1]']).toBe('Juan José Hernández');
  });

  it('8. fullName and alias in same text collapse to one placeholder', () => {
    const { redactedText, mappings } = redactPII(
      'Juan José Hernández abrió el partido. Después J.J. cerró.',
      ctx([kid(1, 'Juan José Hernández', ['J.J.'])])
    );
    expect(redactedText).toBe(
      '[STUDENT_1] abrió el partido. Después [STUDENT_1] cerró.'
    );
    expect(Object.keys(mappings).filter((k) => k.startsWith('[STUDENT_'))).toEqual([
      '[STUDENT_1]',
    ]);
  });

  it('9. alias of one kid does not shadow another kid\'s fullName', () => {
    // Kid 1 alias is "Juan" (a substring of kid 2's fullName "Juan Pérez").
    const { redactedText } = redactPII(
      'Juan Pérez metió un gol. Luego Juan pidió cambio.',
      ctx([
        kid(1, 'Juan Hernández', ['Juan']),
        kid(2, 'Juan Pérez'),
      ])
    );
    // "Juan Pérez" → [STUDENT_2] (longest match first).
    // Standalone "Juan" → [STUDENT_1].
    expect(redactedText).toBe(
      '[STUDENT_2] metió un gol. Luego [STUDENT_1] pidió cambio.'
    );
  });
});

describe('redactPII — emails', () => {
  it('10. redacts a .com email', () => {
    const { redactedText, mappings } = redactPII(
      'Contacto: padre@gmail.com',
      ctx([])
    );
    expect(redactedText).toBe('Contacto: [EMAIL_1]');
    expect(mappings['[EMAIL_1]']).toBe('padre@gmail.com');
  });

  it('11. redacts a .pa email', () => {
    const { redactedText, mappings } = redactPII(
      'Email: madre@cidmi.edu.pa',
      ctx([])
    );
    expect(redactedText).toBe('Email: [EMAIL_1]');
    expect(mappings['[EMAIL_1]']).toBe('madre@cidmi.edu.pa');
  });

  it('12. assigns different placeholders to different emails', () => {
    const { redactedText, mappings } = redactPII(
      'padre1@gmail.com y padre2@yahoo.com.',
      ctx([])
    );
    expect(redactedText).toBe('[EMAIL_1] y [EMAIL_2].');
    expect(mappings['[EMAIL_1]']).toBe('padre1@gmail.com');
    expect(mappings['[EMAIL_2]']).toBe('padre2@yahoo.com');
  });

  it('13. same email appearing twice uses the same placeholder', () => {
    const { redactedText, mappings } = redactPII(
      'mandamos a padre@gmail.com. Confirmar a padre@gmail.com.',
      ctx([])
    );
    expect(redactedText).toBe('mandamos a [EMAIL_1]. Confirmar a [EMAIL_1].');
    expect(Object.keys(mappings)).toEqual(['[EMAIL_1]']);
  });
});

describe('redactPII — phones', () => {
  it('14. redacts the XXXX-XXXX format', () => {
    const { redactedText, mappings } = redactPII(
      'Llamar al 6123-4567.',
      ctx([])
    );
    expect(redactedText).toBe('Llamar al [PHONE_1].');
    expect(mappings['[PHONE_1]']).toBe('6123-4567');
  });

  it('15. redacts the bare 8-digit format', () => {
    const { redactedText, mappings } = redactPII(
      'Whatsapp 61234567 para coordinar.',
      ctx([])
    );
    expect(redactedText).toBe('Whatsapp [PHONE_1] para coordinar.');
    expect(mappings['[PHONE_1]']).toBe('61234567');
  });

  it('16. handles both phone formats in the same text', () => {
    const { redactedText, mappings } = redactPII(
      'Mamá 6123-4567, papá 68889999.',
      ctx([])
    );
    expect(redactedText).toBe('Mamá [PHONE_1], papá [PHONE_2].');
    expect(mappings['[PHONE_1]']).toBe('6123-4567');
    expect(mappings['[PHONE_2]']).toBe('68889999');
  });
});

describe('redactPII — mixed + round-trips', () => {
  it('17. redacts name + email + phone together', () => {
    const { redactedText, mappings } = redactPII(
      'Carlos García: contacto padre@gmail.com / 6123-4567.',
      ctx([kid(1, 'Carlos García')])
    );
    expect(redactedText).toBe(
      '[STUDENT_1]: contacto [EMAIL_1] / [PHONE_1].'
    );
    expect(mappings['[STUDENT_1]']).toBe('Carlos García');
    expect(mappings['[EMAIL_1]']).toBe('padre@gmail.com');
    expect(mappings['[PHONE_1]']).toBe('6123-4567');
  });

  it('18. unredactPII reverses a full redaction', () => {
    const original =
      'Carlos García y Sebastián Pérez. Email: padre@gmail.com. Tel 6123-4567.';
    const { redactedText, mappings } = redactPII(
      original,
      ctx([kid(1, 'Carlos García'), kid(2, 'Sebastián Pérez')])
    );
    expect(unredactPII(redactedText, mappings)).toBe(original);
  });

  it('19. round-trip is idempotent (redact(unredact(redact(x))) ≡ redact(x))', () => {
    const original =
      'Carlos García anotó. Padres: madre@cidmi.edu.pa y 6123-4567.';
    const kids = ctx([kid(1, 'Carlos García')]);

    const first = redactPII(original, kids);
    const restored = unredactPII(first.redactedText, first.mappings);
    const second = redactPII(restored, kids);

    expect(restored).toBe(original);
    expect(second.redactedText).toBe(first.redactedText);
    expect(second.mappings).toEqual(first.mappings);
  });

  it('20. with empty kidsEnrolled, names pass through but emails + phones still redact', () => {
    const { redactedText, mappings } = redactPII(
      'Carlos García: padre@gmail.com / 6123-4567.',
      ctx([])
    );
    expect(redactedText).toBe('Carlos García: [EMAIL_1] / [PHONE_1].');
    expect(mappings['[EMAIL_1]']).toBe('padre@gmail.com');
    expect(mappings['[PHONE_1]']).toBe('6123-4567');
    // No [STUDENT_*] entries because no kids were provided.
    expect(
      Object.keys(mappings).some((k) => k.startsWith('[STUDENT_'))
    ).toBe(false);
  });
});
