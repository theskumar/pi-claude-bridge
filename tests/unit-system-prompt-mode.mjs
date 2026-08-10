// systemPromptMode resolution and the SDK systemPrompt value each mode produces.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSystemPromptMode } from "../src/config.js";
import { buildSystemPrompt } from "../src/system-prompt.js";

describe("resolveSystemPromptMode", () => {
	it("defaults to append", () => {
		assert.equal(resolveSystemPromptMode(undefined), "append");
		assert.equal(resolveSystemPromptMode({}), "append");
	});

	it("passes through the supported modes", () => {
		assert.equal(resolveSystemPromptMode({ systemPromptMode: "append" }), "append");
		assert.equal(resolveSystemPromptMode({ systemPromptMode: "replace" }), "replace");
		assert.equal(resolveSystemPromptMode({ systemPromptMode: false }), false);
	});

	it("falls back to append on an unknown value rather than failing the session", () => {
		const errors = [];
		const original = console.error;
		console.error = (...args) => errors.push(args.join(" "));
		try {
			assert.equal(resolveSystemPromptMode({ systemPromptMode: "REPLACE" }), "append");
			assert.equal(resolveSystemPromptMode({ systemPromptMode: true }), "append");
		} finally {
			console.error = original;
		}
		assert.equal(errors.length, 2);
		assert.match(errors[0], /unknown provider\.systemPromptMode/);
	});
});

describe("buildSystemPrompt", () => {
	it("append keeps Claude Code's preset and appends Pi's content", () => {
		assert.deepEqual(buildSystemPrompt("append", "pi content"), {
			type: "preset", preset: "claude_code", append: "pi content",
		});
	});

	it("append omits the append key when Pi loaded nothing", () => {
		const result = buildSystemPrompt("append", undefined);
		assert.deepEqual(result, { type: "preset", preset: "claude_code" });
		assert.ok(!("append" in result), "an explicit append: undefined would still serialize");
	});

	it("replace sends Pi's content as the whole prompt, so no preset reaches the server", () => {
		assert.equal(buildSystemPrompt("replace", "pi content"), "pi content");
	});

	it("replace with nothing projected sends an empty prompt rather than the preset", () => {
		assert.equal(buildSystemPrompt("replace", undefined), "");
	});

	it("false keeps the preset alone and never forwards Pi content", () => {
		assert.deepEqual(buildSystemPrompt(false, "pi content"), { type: "preset", preset: "claude_code" });
	});
});
