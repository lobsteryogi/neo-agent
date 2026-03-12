import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Q, QUOTES, getQuote, randomQuote, type QuoteKey } from '../../src/data/matrix-quotes';

describe('Matrix Quotes — Q named constants', () => {
  it('Q is a non-empty object', () => {
    const keys = Object.keys(Q);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('every value in Q is a non-empty string', () => {
    for (const [key, value] of Object.entries(Q)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('contains core iconic quotes', () => {
    expect(Q.matrixHasYou).toBe('The Matrix has you...');
    expect(Q.noSpoon).toBe('There is no spoon.');
    expect(Q.knowKungFu).toBe('I know kung fu.');
    expect(Q.freeYourMind).toBe('Free your mind.');
    expect(Q.inevitability).toBe('It is inevitable.');
    expect(Q.dodgeThis).toBe('Dodge this.');
  });

  it('contains error-related quotes', () => {
    expect(Q.timeRanOut).toBeDefined();
    expect(Q.somethingBroke).toBeDefined();
    expect(Q.memoriesCorrupted).toBeDefined();
  });

  it('contains loading-related quotes', () => {
    expect(Q.enteringMatrix).toBeDefined();
    expect(Q.loadingConstruct).toBeDefined();
    expect(Q.bendingSpoon).toBeDefined();
    expect(Q.decryptingSignal).toBeDefined();
    expect(Q.followingWhiteRabbit).toBeDefined();
  });

  it('contains soul/personality quotes', () => {
    expect(Q.seeTheCode).toBeDefined();
    expect(Q.noSpoonButBug).toBeDefined();
    expect(Q.gotYourBack).toBeDefined();
    expect(Q.knowTypeScript).toBeDefined();
    expect(Q.whatIsRealPR).toBeDefined();
  });

  it('all Q values are unique (no duplicated strings)', () => {
    const values = Object.values(Q);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe('Matrix Quotes — QUOTES categories', () => {
  const EXPECTED_CATEGORIES = ['general', 'exit', 'error', 'loading', 'soul'] as const;

  it('exports all expected categories', () => {
    for (const cat of EXPECTED_CATEGORIES) {
      expect(QUOTES).toHaveProperty(cat);
    }
  });

  for (const cat of EXPECTED_CATEGORIES) {
    it(`"${cat}" is a non-empty array`, () => {
      expect(Array.isArray(QUOTES[cat])).toBe(true);
      expect(QUOTES[cat].length).toBeGreaterThan(0);
    });

    it(`"${cat}" contains only strings`, () => {
      for (const quote of QUOTES[cat]) {
        expect(typeof quote).toBe('string');
        expect(quote.length).toBeGreaterThan(0);
      }
    });

    it(`"${cat}" contains only values found in Q`, () => {
      const allQValues = new Set(Object.values(Q));
      for (const quote of QUOTES[cat]) {
        expect(allQValues.has(quote)).toBe(true);
      }
    });
  }

  it('general is the largest category', () => {
    for (const cat of EXPECTED_CATEGORIES) {
      if (cat === 'general') continue;
      expect(QUOTES.general.length).toBeGreaterThan(QUOTES[cat].length);
    }
  });

  it('exit contains farewell-related quotes', () => {
    expect(QUOTES.exit).toContain(Q.offeringTruth);
    expect(QUOTES.exit).toContain(Q.wakeUpNeo);
  });

  it('error contains all three error quotes', () => {
    expect(QUOTES.error).toContain(Q.timeRanOut);
    expect(QUOTES.error).toContain(Q.somethingBroke);
    expect(QUOTES.error).toContain(Q.memoriesCorrupted);
    expect(QUOTES.error).toHaveLength(3);
  });

  it('loading contains all five loading quotes', () => {
    expect(QUOTES.loading).toContain(Q.enteringMatrix);
    expect(QUOTES.loading).toContain(Q.loadingConstruct);
    expect(QUOTES.loading).toContain(Q.bendingSpoon);
    expect(QUOTES.loading).toContain(Q.decryptingSignal);
    expect(QUOTES.loading).toContain(Q.followingWhiteRabbit);
    expect(QUOTES.loading).toHaveLength(5);
  });

  it('soul contains all five personality quotes', () => {
    expect(QUOTES.soul).toContain(Q.seeTheCode);
    expect(QUOTES.soul).toContain(Q.noSpoonButBug);
    expect(QUOTES.soul).toContain(Q.gotYourBack);
    expect(QUOTES.soul).toContain(Q.knowTypeScript);
    expect(QUOTES.soul).toContain(Q.whatIsRealPR);
    expect(QUOTES.soul).toHaveLength(5);
  });
});

describe('Matrix Quotes — getQuote()', () => {
  it('returns the correct quote for a known key', () => {
    expect(getQuote('noSpoon')).toBe('There is no spoon.');
    expect(getQuote('matrixHasYou')).toBe('The Matrix has you...');
    expect(getQuote('dodgeThis')).toBe('Dodge this.');
  });

  it('returns the same value as direct Q access', () => {
    const keys = Object.keys(Q) as QuoteKey[];
    for (const key of keys) {
      expect(getQuote(key)).toBe(Q[key]);
    }
  });
});

describe('Matrix Quotes — randomQuote()', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a string from the general pool when no category is given', () => {
    const quote = randomQuote();
    expect(typeof quote).toBe('string');
    expect(QUOTES.general).toContain(quote);
  });

  it('returns a string from the specified category', () => {
    const categories = ['exit', 'error', 'loading', 'soul'] as const;
    for (const cat of categories) {
      const quote = randomQuote(cat);
      expect(QUOTES[cat]).toContain(quote);
    }
  });

  it('returns the first element when Math.random returns 0', () => {
    vi.mocked(Math.random).mockReturnValue(0);
    expect(randomQuote('error')).toBe(QUOTES.error[0]);
  });

  it('returns the last element when Math.random returns 0.999', () => {
    vi.mocked(Math.random).mockReturnValue(0.999);
    const pool = QUOTES.loading;
    expect(randomQuote('loading')).toBe(pool[pool.length - 1]);
  });

  it('defaults to general pool when no category is provided', () => {
    vi.mocked(Math.random).mockReturnValue(0);
    expect(randomQuote()).toBe(QUOTES.general[0]);
  });
});
