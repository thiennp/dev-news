import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTimes, localClock, scheduleDaily } from '../src/schedule.js';

test('parses and normalizes times', () => {
  assert.deepEqual(parseTimes('13:00, 7:00,07:00'), ['07:00', '13:00']);
  assert.throws(() => parseTimes('25:00'));
});

test('reads wall-clock time in Berlin across DST', () => {
  assert.deepEqual(localClock(new Date('2026-11-23T06:00:00Z'), 'Europe/Berlin'), { day: '2026-11-23', time: '07:00' });
  assert.deepEqual(localClock(new Date('2026-07-01T05:00:00Z'), 'Europe/Berlin'), { day: '2026-07-01', time: '07:00' });
});

test('fires once per scheduled minute', () => {
  let t = new Date('2026-11-23T05:59:40Z');
  let runs = 0;
  const s = scheduleDaily(['07:00', '13:00'], 'Europe/Berlin', () => runs++, { now: () => t });
  s.tick();
  t = new Date('2026-11-23T06:00:10Z'); s.tick();
  t = new Date('2026-11-23T06:00:40Z'); s.tick();
  t = new Date('2026-11-23T12:00:05Z'); s.tick();
  s.stop();
  assert.equal(runs, 2);
});
