/**
 * 运行: cd backend && npm test
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatReleaseDate, mapMovieForApi } = require('../lib/movieApiFormat');

describe('formatReleaseDate', () => {
  it('returns YYYY-MM-DD for ISO string', () => {
    assert.equal(formatReleaseDate('2026-03-22T16:00:00.000Z'), '2026-03-22');
  });

  it('returns empty for null', () => {
    assert.equal(formatReleaseDate(null), '');
  });

  it('formats Date with local calendar day', () => {
    const d = new Date(2026, 2, 22); // month 2 = March
    assert.equal(formatReleaseDate(d), '2026-03-22');
  });
});

describe('mapMovieForApi', () => {
  it('converts price cents to yuan', () => {
    const row = mapMovieForApi({ price: 3500, rating: 8.3, releaseDate: '2025-01-01' });
    assert.equal(row.price, 35);
    assert.equal(row.rating, 8.3);
    assert.equal(row.releaseDate, '2025-01-01');
  });

  it('returns null for null input', () => {
    assert.equal(mapMovieForApi(null), null);
  });
});
