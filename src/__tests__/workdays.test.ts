import { describe, expect, it } from 'vitest';
import { toDayNumber } from '../lib/date';
import { dayFromWorkIndex, endAfterWorkdays, germanHolidays, holidayName, isNonWorking, isWeekend, nextWorkday, previousWorkday, workDays, workIndexForward } from '../lib/workdays';

describe('Arbeitstage', () => {
  it('erkennt Wochenenden', () => {
    expect(isWeekend(toDayNumber('2026-11-21'))).toBe(true); // Sa
    expect(isWeekend(toDayNumber('2026-11-22'))).toBe(true); // So
    expect(isWeekend(toDayNumber('2026-11-23'))).toBe(false); // Mo
    expect(isWeekend(toDayNumber('1969-12-27'))).toBe(true); // Sa vor 1970
  });
  it('Index und Rückweg sind für alle Arbeitstage eindeutig und fortlaufend', () => {
    let prev: number | null = null;
    for (let d = toDayNumber('1969-12-01'); d < toDayNumber('2027-03-01'); d++) {
      if (isNonWorking(d)) continue;
      const i = workIndexForward(d);
      expect(dayFromWorkIndex(i)).toBe(d);
      if (prev !== null) expect(i).toBe(prev + 1);
      prev = i;
    }
  });
  it('zählt Arbeitstage ohne Wochenende', () => {
    expect(workDays('2026-11-16', '2026-11-20')).toBe(5); // Mo–Fr
    expect(workDays('2026-11-16', '2026-11-23')).toBe(6); // Mo–Mo
    expect(workDays('2026-11-20', '2026-11-23')).toBe(2); // Fr–Mo
    expect(workDays('2026-11-21', '2026-11-22')).toBe(1); // nur Wochenende → mind. 1
  });
  it('schiebt Daten auf Arbeitstage', () => {
    expect(nextWorkday('2026-11-21')).toBe('2026-11-23');
    expect(previousWorkday('2026-11-22')).toBe('2026-11-20');
    expect(nextWorkday('2026-11-18')).toBe('2026-11-18');
  });
  it('rechnet Enddaten über Wochenenden', () => {
    expect(endAfterWorkdays('2026-11-19', 3)).toBe('2026-11-23'); // Do, Fr, Mo
    expect(endAfterWorkdays('2026-11-23', 10)).toBe('2026-12-04');
  });
});

describe('Feiertage (bundesweit)', () => {
  it('berechnet bewegliche Feiertage 2026 richtig', () => {
    const names = [...germanHolidays(2026)].map(([d, n]) => [d, n] as const);
    const byName = Object.fromEntries(names.map(([d, n]) => [n, d]));
    expect(byName['Karfreitag']).toBe(toDayNumber('2026-04-03'));
    expect(byName['Ostermontag']).toBe(toDayNumber('2026-04-06'));
    expect(byName['Christi Himmelfahrt']).toBe(toDayNumber('2026-05-14'));
    expect(byName['Pfingstmontag']).toBe(toDayNumber('2026-05-25'));
    expect(germanHolidays(2026).size).toBe(9);
  });
  it('kennt Ostern 2027 (28.03.)', () => {
    expect(holidayName(toDayNumber('2027-03-29'))).toBe('Ostermontag');
  });
  it('Feiertage zählen nicht als Arbeitstag', () => {
    expect(workDays('2026-12-21', '2026-12-31')).toBe(8); // 9 Werktage, 25.12. (Fr) frei; 26.12. ist Samstag
    expect(workDays('2026-09-28', '2026-10-09')).toBe(10); // 03.10.2026 ist Samstag
    expect(workDays('2026-05-11', '2026-05-15')).toBe(4); // Christi Himmelfahrt Do 14.05.
  });
  it('Reformationstag nur 2017', () => {
    expect(holidayName(toDayNumber('2017-10-31'))).toBe('Reformationstag');
    expect(holidayName(toDayNumber('2026-10-31'))).toBeNull();
  });
  it('Start auf Feiertag rutscht auf den nächsten Arbeitstag', () => {
    expect(nextWorkday('2026-12-25')).toBe('2026-12-28'); // Fr Feiertag → Mo
    expect(previousWorkday('2026-04-06')).toBe('2026-04-02'); // Ostermontag → Gründonnerstag
    expect(endAfterWorkdays('2026-04-02', 2)).toBe('2026-04-07'); // Do, (Fr frei, WE, Mo frei), Di
  });
});
