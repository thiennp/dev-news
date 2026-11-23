// Runs a job at fixed wall-clock times in a given time zone (DST-safe), e.g.
// COLLECT_TIMES=07:00,13:00 COLLECT_TZ=Europe/Berlin.

export function parseTimes(spec) {
  return [...new Set(String(spec).split(',').map((s) => s.trim()).filter(Boolean).map((t) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`invalid time "${t}", use HH:MM`);
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }))].sort();
}

// The wall-clock date and HH:MM of `date` in `timeZone`.
export function localClock(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// Checks every 30 seconds and fires once per matching minute.
export function scheduleDaily(times, timeZone, job, { now = () => new Date() } = {}) {
  let lastKey = null;
  const tick = () => {
    const { day, time } = localClock(now(), timeZone);
    const key = `${day} ${time}`;
    if (times.includes(time) && key !== lastKey) {
      lastKey = key;
      job();
    }
  };
  const timer = setInterval(tick, 30 * 1000);
  timer.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}
