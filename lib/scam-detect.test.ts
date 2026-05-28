import { describe, it, expect } from 'vitest';
import { detectScam } from './scam-detect';

describe('detectScam', () => {
  it('returns null for a clean job', () => {
    expect(detectScam({
      title: 'Senior Backend Engineer',
      description: 'Build distributed systems with Go and Kubernetes. Competitive salary, fully remote.',
      apply_url: 'https://greenhouse.io/example/jobs/123',
      apply_email: 'careers@example-corp.com',
    })).toBeNull();
  });

  describe('off-platform apply instructions', () => {
    it('flags Telegram contact instructions', () => {
      const r = detectScam({
        title: 'Data Entry',
        description: 'Apply via Telegram: t.me/easymoney99 — earn from home!',
      });
      expect(r?.flagged).toBe(true);
      expect(r?.flagged_reason).toMatch(/^apply_off_platform:/);
    });

    it('flags WhatsApp contact instructions', () => {
      const r = detectScam({
        title: 'Marketing Assistant',
        description: 'Send your CV via WhatsApp +1 (555) 123-4567 for fast response.',
      });
      expect(r?.flagged).toBe(true);
      expect(r?.flagged_reason).toMatch(/^apply_off_platform:/);
    });

    it('flags CashApp / crypto-wallet payment hints', () => {
      const r = detectScam({
        title: 'Mystery Shopper',
        description: 'We will Cash App you $500 upfront for the first assignment.',
      });
      expect(r?.flagged).toBe(true);
      expect(r?.flagged_reason).toMatch(/^apply_off_platform:/);
    });
  });

  describe('MLM markers', () => {
    it('flags "downline" recruitment language', () => {
      const r = detectScam({
        title: 'Team Lead',
        description: 'Build your downline of recruits and earn residual income.',
      });
      expect(r?.flagged).toBe(true);
      expect(r?.flagged_reason).toMatch(/^mlm_marker:/);
    });

    it('flags "passive income" / "get paid daily" combos', () => {
      const r = detectScam({
        title: 'Independent Consultant',
        description: 'Generate passive income from home. Get paid daily.',
      });
      expect(r?.flagged).toBe(true);
      expect(r?.flagged_reason).toMatch(/^mlm_marker:/);
    });
  });

  describe('too-good pay claims', () => {
    it('flags "$X/hour" with no experience required', () => {
      const r = detectScam({
        title: 'Online Surveys',
        description: 'No experience needed — earn $250/hour just by clicking links from home.',
      });
      expect(r?.flagged).toBe(true);
      expect(r?.flagged_reason).toBe('too_good_pay');
    });

    it('flags "earn $5000 per week"', () => {
      const r = detectScam({
        title: 'Remote Assistant',
        description: 'Easy work — earn $5000 per week from home, anyone can do it.',
      });
      expect(r?.flagged).toBe(true);
      expect(r?.flagged_reason).toBe('too_good_pay');
    });
  });

  describe('free-webmail + no apply_url', () => {
    it('flags gmail apply_email with no apply_url', () => {
      const r = detectScam({
        title: 'Personal Assistant',
        description: 'Looking for a virtual assistant — flexible hours.',
        apply_email: 'hr.recruiter.99@gmail.com',
        apply_url: null,
      });
      expect(r?.flagged).toBe(true);
      expect(r?.flagged_reason).toContain('webmail_apply_email');
    });

    it('does NOT flag gmail email alone if apply_url is present and content is clean', () => {
      // Lots of small legit employers use gmail. The signal is only meaningful
      // when paired with no apply_url OR another suspicious signal.
      const r = detectScam({
        title: 'Junior Developer',
        description: 'Backend role, React + Node. Apply via our website.',
        apply_email: 'jobs@my-small-startup.gmail.com',
        apply_url: 'https://example.com/careers/123',
      });
      expect(r).toBeNull();
    });
  });

  it('case-insensitive — flags uppercase TELEGRAM', () => {
    const r = detectScam({
      title: 'Remote',
      description: 'CONTACT US ON TELEGRAM @example FOR MORE INFO',
    });
    expect(r?.flagged).toBe(true);
  });
});
