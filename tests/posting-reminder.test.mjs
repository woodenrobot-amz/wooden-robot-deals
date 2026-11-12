import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
const source = ts.transpileModule(fs.readFileSync('lib/posting-reminder.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const compiled = { exports: {} };
new Function('exports', 'module', source)(compiled.exports, compiled);
const { DEFAULT_REMINDER_TIMES, normalizeReminderTimes, nextReminderLabel } = compiled.exports;
test('all 13 requested times are present', () => {
  assert.deepEqual(DEFAULT_REMINDER_TIMES, ['07:30','08:30','09:30','10:30','11:30','12:45','14:15','15:45','17:15','19:20','20:00','20:40','21:30']);
});
test('schedule validates, sorts, deduplicates and permits an empty schedule', () => {
  assert.deepEqual(normalizeReminderTimes(['21:30', '07:30', '07:30']), ['07:30', '21:30']);
  assert.deepEqual(normalizeReminderTimes([]), []);
  for (const invalid of [null, ['24:00'], ['7:30'], ['12:60'], [null], Array(49).fill('07:30')]) {
    assert.equal(normalizeReminderTimes(invalid), null);
  }
});
test('next reminder follows Eastern time in winter, summer and after midnight UTC', () => {
  for (const date of ['2026-11-12T12:00:00Z', '2026-07-12T11:00:00Z']) {
    assert.equal(nextReminderLabel(DEFAULT_REMINDER_TIMES, Date.parse(date)), 'Next reminder today at 7:30 AM ET');
  }
  assert.equal(nextReminderLabel(DEFAULT_REMINDER_TIMES, Date.parse('2026-11-13T02:00:00Z')), 'Next reminder today at 9:30 PM ET');
  assert.equal(nextReminderLabel(DEFAULT_REMINDER_TIMES, Date.parse('2026-11-13T03:00:00Z')), 'Next reminder tomorrow at 7:30 AM ET');
  assert.equal(nextReminderLabel([], Date.now()), 'No reminders scheduled');
});
