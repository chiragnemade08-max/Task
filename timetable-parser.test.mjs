import assert from "node:assert/strict";
import parserModule from "../lib/timetable-parser.ts";

const { parseTimetableText } = parserModule;

const parse = (text) => parseTimetableText(text, () => "other");

const morning = parse("6 to 7 Physics").blocks[0];
assert.equal(morning.startTime, "06:00");
assert.equal(morning.endTime, "07:00");
assert.equal(morning.confidence, "high");

const ambiguous = parse("4 - 5 maths rev.").blocks[0];
assert.equal(ambiguous.startTime, "16:00");
assert.equal(ambiguous.endTime, "17:00");
assert.equal(ambiguous.confidence, "review");
assert.deepEqual(ambiguous.timeAlternatives, [
  { startTime: "04:00", endTime: "05:00" },
  { startTime: "16:00", endTime: "17:00" },
]);
assert.equal(ambiguous.title, "Mathematics Revision");

const explicitSingleTime = parse("4 PM maths").blocks[0];
assert.equal(explicitSingleTime.startTime, "16:00");
assert.equal(explicitSingleTime.endTime, "17:00");
assert.equal(explicitSingleTime.title, "Mathematics");
assert.equal(explicitSingleTime.confidence, "high");

const twentyFourHour = parse("18:00 - 19:00 Physics").blocks[0];
assert.equal(twentyFourHour.startTime, "18:00");
assert.equal(twentyFourHour.endTime, "19:00");

const ordinaryMonday = parse("Monday 6:00 AM - 7:00 AM Physics");
assert.equal(ordinaryMonday.repeatMode, "today");

const daily = parse("Every day\n6:00 AM - 7:00 AM Physics");
assert.equal(daily.repeatMode, "every_day");

const weekly = parse("Weekly every Friday\n6:00 PM - 7:00 PM Physics");
assert.equal(weekly.repeatMode, "custom_days");
assert.deepEqual(weekly.customDays, [5]);

console.log("Timetable parser checks passed.");
