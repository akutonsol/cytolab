import { LocalAuthenticationAdapter } from './local-authentication.adapter';
import { AuthenticationService } from './authentication.service';
import { AuthenticationAdapter } from './authentication-adapter';
import { humanPrincipal, servicePrincipal, isHuman, isService, mayHoldClinicalAuthority } from './canonical-principal';

/**
 * Program 7 · Phase 7A.1 — the canonical principal + provider-isolation seam (pure, no DB). Proves an adapter's only
 * output is a canonical principal, that the AuthenticationService routes by provider key deterministically, and that
 * the human/non-human class distinction is structural.
 */
describe('P7-7A.1 authentication seam (canonical principal + provider isolation)', () => {
  const local = new LocalAuthenticationAdapter();

  it('local adapter maps a verified user to a HUMAN canonical principal (stable id = userId)', async () => {
    const r = await local.authenticate({ userId: 'user-1', labId: 'lab-1' });
    expect(r).not.toBeNull();
    expect(r!.protocol).toBe('LOCAL');
    expect(r!.providerKey).toBe('local');
    expect(r!.principal).toEqual({ kind: 'HUMAN', principalId: 'user-1', labId: 'lab-1' });
  });

  it('local adapter rejects malformed input (fails closed to null)', async () => {
    for (const bad of [null, undefined, {}, { userId: 'u' }, { labId: 'l' }, { userId: '', labId: 'l' }]) {
      expect(await local.authenticate(bad as any)).toBeNull();
    }
  });

  it('AuthenticationService routes by provider key deterministically and isolates providers', async () => {
    const svc = new AuthenticationService([local]);
    expect(svc.registeredProviders()).toEqual(['local']);
    const a = await svc.authenticate('local', { userId: 'u', labId: 'l' });
    const b = await svc.authenticate('local', { userId: 'u', labId: 'l' });
    expect(a).toEqual(b); // deterministic (Principle 12)
    expect(await svc.authenticate('unknown-provider', {})).toBeNull(); // unknown provider fails closed
    // downstream sees ONLY a canonical principal — no provider/token/assertion type leaks through
    expect(Object.keys(a!.principal).sort()).toEqual(['kind', 'labId', 'principalId']);
  });

  it('a second adapter plugs in behind the seam with no change to the principal shape', async () => {
    const fake: AuthenticationAdapter = {
      providerKey: 'oidc-demo',
      protocol: 'OIDC',
      authenticate: async () => ({ principal: humanPrincipal('u2', 'l2'), providerKey: 'oidc-demo', protocol: 'OIDC' }),
    };
    const svc = new AuthenticationService([local, fake]);
    expect(svc.registeredProviders()).toEqual(['local', 'oidc-demo']);
    const r = await svc.authenticate('oidc-demo', {});
    expect(r!.principal.kind).toBe('HUMAN');
  });

  it('human vs non-human principal classes are structural; only humans may hold clinical authority (Principle 11)', () => {
    const h = humanPrincipal('u', 'l');
    const s = servicePrincipal('sp', 'l');
    expect(isHuman(h)).toBe(true);
    expect(isService(s)).toBe(true);
    expect(mayHoldClinicalAuthority(h)).toBe(true);
    expect(mayHoldClinicalAuthority(s)).toBe(false); // ET6 — a service principal never holds clinical/AI authority
  });
});
