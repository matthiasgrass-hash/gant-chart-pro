import { describe, expect, it } from 'vitest';
import { addDays, diffDays, durationDays, isValidIso, isoWeek, startOfWeek, toDayNumber, fromDayNumber } from '../lib/date';

describe('date', () => {
  it('rechnet über Monats-, Jahres- und Sommerzeitgrenzen', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('berechnet Differenzen und Dauer inklusive', () => {
    expect(diffDays('2026-11-01', '2026-11-15')).toBe(14);
    expect(durationDays('2026-11-15', '2026-11-15')).toBe(1);
  });
  it('validiert ISO-Daten', () => {
    expect(isValidIso('2026-02-29')).toBe(false);
    expect(isValidIso('2028-02-29')).toBe(true);
    expect(isValidIso('2026-1-01')).toBe(false);
    expect(isValidIso(42)).toBe(false);
  });
  it('liefert ISO-Kalenderwochen', () => {
    expect(isoWeek(toDayNumber('2026-01-01'))).toBe(1);
    expect(isoWeek(toDayNumber('2027-01-01'))).toBe(53);
    expect(isoWeek(toDayNumber('2026-11-16'))).toBe(47);
  });
  it('findet den Montag einer Woche', () => {
    expect(fromDayNumber(startOfWeek(toDayNumber('2026-11-15')))).toBe('2026-11-09');
    expect(fromDayNumber(startOfWeek(toDayNumber('2026-11-16')))).toBe('2026-11-16');
  });
});
