import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
const source = ts.transpileModule(fs.readFileSync('lib/deal-schedule.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const compiled = { exports: {} };
new Function('exports', 'module', source)(compiled.exports, compiled);
const { groupsForScheduleDate, scheduleSlotLabel, recurringDailySlot } = compiled.exports;
const group = { id: 'wood', slug: 'woodworking', schedule_type: 'hourly' };
test('numbering starts November 14 and preserves stored slot keys', () => {
  const [today] = groupsForScheduleDate([group], '2026-11-13');
  const [tomorrow] = groupsForScheduleDate([group], '2026-11-14');
  assert.equal(scheduleSlotLabel(today, 7), '7 AM');
  assert.equal(scheduleSlotLabel(tomorrow, 7), 'Deal #1');
  assert.equal(scheduleSlotLabel(tomorrow, 14), 'Deal #8');
  assert.equal(scheduleSlotLabel(tomorrow, 19), 'Deal #13');
  assert.equal(recurringDailySlot('woodworking', 15, false).commentText, "Here's the list!\n#ad https://amzlink.to/az0PcMReHRer7");
  assert.equal(recurringDailySlot('woodworking', 15, true), null);
  assert.equal(recurringDailySlot('dads', 14, true), null);
  assert.equal(recurringDailySlot('woodworking', 14, true).commentText, "Your Daily Deal Roundup!\nAmazon List - https://amzlink.to/az0PcMReHRer7\nLowes' Daily Deals - https://shoplowes.me/45yEA4t");
});
