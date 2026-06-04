// PII redaction for PORTESCO AI pipeline (AGENTS.md §3.4).
//
// Pure functions, no external dependencies. Used to redact full names of
// minors, parent emails, and parent phones from any text that goes to an
// external LLM (Claude / Whisper). Mappings are returned alongside the
// redacted text so the caller can unredact the model output.
//
// Placeholders:
//   - Student names           → [STUDENT_<n>]  (one <n> per kid object)
//   - Email addresses         → [EMAIL_<n>]    (one <n> per unique email)
//   - Phone numbers (PA fmts) → [PHONE_<n>]    (one <n> per unique phone)
//
// Matching rules:
//   - Names + aliases are matched case-insensitive and accent-insensitive
//     (so "Andres" matches kid "Andrés", and "MARÍA" matches "María").
//   - Names that overlap (e.g. alias "Juan" inside another kid's full name
//     "Juan Pérez") are resolved by always replacing the longest candidate
//     first across all kids, so partial matches can't shadow full ones.
//   - Emails: standard RFC-ish pattern. Same email twice → same placeholder.
//   - Phones: two Panama formats — XXXX-XXXX with hyphen, and XXXXXXXX as
//     a bare 8-digit block.

export type Kid = {
  id: string;
  fullName: string;
  aliases?: string[];
};

export type RedactContext = {
  kidsEnrolled: Kid[];
};

export type RedactionMappings = Record<string, string>;

export type RedactionResult = {
  redactedText: string;
  mappings: RedactionMappings;
};

const ACCENT_GROUPS: Record<string, string> = {
  a: 'aáàäâãÁÀÄÂÃA',
  e: 'eéèëêÉÈËÊE',
  i: 'iíìïîÍÌÏÎI',
  o: 'oóòöôõÓÒÖÔÕO',
  u: 'uúùüûÚÙÜÛU',
  n: 'nñÑN',
  c: 'cçÇC',
};

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function escapeRegex(s: string): string {
  return s.replace(REGEX_SPECIALS, '\\$&');
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Builds a case-insensitive, accent-insensitive regex that matches the given
// literal candidate string. E.g. "Andrés" matches "ANDRÉS", "Andres",
// "andrés", etc.
function buildNamePattern(candidate: string): RegExp {
  const stripped = stripAccents(candidate);
  let pattern = '';
  for (const char of stripped) {
    const lower = char.toLowerCase();
    const group = ACCENT_GROUPS[lower];
    if (group) {
      pattern += `[${group}]`;
    } else if (/[a-zA-Z]/.test(char)) {
      // Plain ASCII letter without accent group → just rely on /i flag.
      pattern += escapeRegex(char);
    } else {
      pattern += escapeRegex(char);
    }
  }
  return new RegExp(pattern, 'gi');
}

export function redactPII(
  text: string,
  context: RedactContext
): RedactionResult {
  const mappings: RedactionMappings = {};
  let result = text;

  // 1) Names + aliases per kid. Process longest candidate first across all
  //    kids so e.g. "Juan García" wins over alias "Juan" inside another kid.
  type NameCandidate = {
    candidate: string;
    placeholder: string;
    canonical: string;
  };

  const candidates: NameCandidate[] = [];
  context.kidsEnrolled.forEach((kid, i) => {
    const placeholder = `[STUDENT_${i + 1}]`;
    candidates.push({
      candidate: kid.fullName,
      placeholder,
      canonical: kid.fullName,
    });
    for (const alias of kid.aliases ?? []) {
      candidates.push({
        candidate: alias,
        placeholder,
        canonical: kid.fullName,
      });
    }
  });
  candidates.sort((a, b) => b.candidate.length - a.candidate.length);

  for (const { candidate, placeholder, canonical } of candidates) {
    const regex = buildNamePattern(candidate);
    if (regex.test(result)) {
      regex.lastIndex = 0;
      result = result.replace(regex, placeholder);
      // Only record the mapping the first time we see this placeholder.
      if (!(placeholder in mappings)) {
        mappings[placeholder] = canonical;
      }
    }
  }

  // 2) Emails. Order is order of first appearance in the (already
  //    name-redacted) text — stable so redact(unredact(x)) === x.
  const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const emailOrder: string[] = [];
  for (const match of result.matchAll(emailRegex)) {
    const email = match[0];
    if (!emailOrder.includes(email)) {
      emailOrder.push(email);
    }
  }
  emailOrder.forEach((email, i) => {
    const placeholder = `[EMAIL_${i + 1}]`;
    result = result.split(email).join(placeholder);
    mappings[placeholder] = email;
  });

  // 3) Phones. Two Panama formats. XXXX-XXXX has a hyphen so it can't be
  //    accidentally consumed by the 8-digit bare regex. Process hyphenated
  //    first, then bare. Same number twice (in either format) gets one
  //    placeholder per unique literal string.
  const phoneFormats: RegExp[] = [/\b\d{4}-\d{4}\b/g, /\b\d{8}\b/g];
  let phoneCounter = 1;
  const phonePlaceholders = new Map<string, string>();
  for (const fmt of phoneFormats) {
    const matches: string[] = [];
    for (const m of result.matchAll(fmt)) {
      if (!matches.includes(m[0])) matches.push(m[0]);
    }
    for (const phone of matches) {
      let placeholder = phonePlaceholders.get(phone);
      if (!placeholder) {
        placeholder = `[PHONE_${phoneCounter++}]`;
        phonePlaceholders.set(phone, placeholder);
        mappings[placeholder] = phone;
      }
      result = result.split(phone).join(placeholder);
    }
  }

  return { redactedText: result, mappings };
}

export function unredactPII(
  text: string,
  mappings: RedactionMappings
): string {
  let result = text;
  // Replace longest placeholders first so [STUDENT_10] doesn't get partially
  // matched by [STUDENT_1]. Sort keys by descending length.
  const placeholders = Object.keys(mappings).sort(
    (a, b) => b.length - a.length
  );
  for (const placeholder of placeholders) {
    result = result.split(placeholder).join(mappings[placeholder]);
  }
  return result;
}
