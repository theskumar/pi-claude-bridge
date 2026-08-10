// rate_limit_event.resetsAt arrives as unix seconds; the warning used to read it
// as milliseconds and date a Sep 1 reset to Jan 21 1970.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatResetsAt } from "../src/index.js";

const NOW = new Date("2026-08-10T18:50:00Z");

describe("formatResetsAt", () => {
	it("reads a seconds epoch, not milliseconds", () => {
		// 1788220800 = 2026-09-01T00:00:00Z, the bucket that produced "resets Sep 1".
		const formatted = formatResetsAt(1788220800, NOW);
		assert.match(formatted, /2026/);
		assert.ok(!formatted.startsWith("at "), `a later reset must carry its date: ${formatted}`);
		assert.equal(formatted, `${new Date(1788220800000).toLocaleDateString()} at ${new Date(1788220800000).toLocaleTimeString()}`);
	});

	it("still accepts a milliseconds epoch", () => {
		const ms = Date.parse("2026-09-01T00:00:00Z");
		assert.equal(formatResetsAt(ms, NOW), formatResetsAt(ms / 1000, NOW));
	});

	it("prints only a time when the reset is today", () => {
		const laterToday = Date.parse("2026-08-10T22:30:00Z") / 1000;
		const formatted = formatResetsAt(laterToday, NOW);
		assert.ok(formatted.startsWith("at "), `same-day reset should be time-only: ${formatted}`);
	});

	it("degrades to a phrase rather than Invalid Date", () => {
		for (const bad of [undefined, null, 0, -1, "soon", Number.NaN, Number.POSITIVE_INFINITY]) {
			assert.equal(formatResetsAt(bad, NOW), "at an unknown time");
		}
	});
});
