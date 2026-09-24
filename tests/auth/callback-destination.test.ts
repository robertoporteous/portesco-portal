// Post-login redirect — a dónde cae cada rol después del magic link.
//
// `resolveDestination` es pura (recibe el profile, devuelve un path), así que se
// testea directo sin levantar server ni mintear cookies. El intercambio de PKCE
// y la lectura del profile ya están cubiertos por el flujo real; lo que se fija
// acá es el mapeo rol → destino, que es lo que se rompe en un refactor.
//
// El caso que importa para el piloto CIDMI: coordinator → /coordinator-pad.
// Antes iba a /staff, que es el stub "Panel del Profesor — Próximamente" de
// Sprint 1: Kassandra habría entrado por magic link a una pantalla vacía en vez
// de a sus clases del día.

import { describe, expect, it } from 'vitest';
import { resolveDestination } from '@/app/auth/callback/route';

type Profile = { role: string | null; is_admin: boolean | null };
const p = (role: string | null, is_admin = false): Profile => ({ role, is_admin });

describe('resolveDestination — post-login por rol', () => {
  it('coordinator → /coordinator-pad (no /staff)', () => {
    expect(resolveDestination(p('coordinator'))).toBe('/coordinator-pad');
  });

  it('professor → /staff (sin cambios)', () => {
    expect(resolveDestination(p('professor'))).toBe('/staff');
  });

  it('admin por rol → /admin (sin cambios)', () => {
    expect(resolveDestination(p('admin'))).toBe('/admin');
  });

  it('is_admin=true gana sobre el rol → /admin', () => {
    // Roberto en prod es role='parent' + is_admin=true. Tiene que caer en /admin.
    expect(resolveDestination(p('parent', true))).toBe('/admin');
    expect(resolveDestination(p('coordinator', true))).toBe('/admin');
  });

  it('parent → /', () => {
    expect(resolveDestination(p('parent'))).toBe('/');
  });

  it('sin profile o con rol desconocido → /', () => {
    expect(resolveDestination(null)).toBe('/');
    expect(resolveDestination(p(null))).toBe('/');
    expect(resolveDestination(p('algo_nuevo'))).toBe('/');
  });

  it('ningún rol cae en /staff salvo professor', () => {
    // Guard contra el bug que se está arreglando: si un rol nuevo aterriza en el
    // stub de Sprint 1, es una pantalla vacía post-login.
    const roles = ['coordinator', 'admin', 'parent', null, 'otro'];
    for (const role of roles) {
      expect(resolveDestination(p(role))).not.toBe('/staff');
    }
  });
});
