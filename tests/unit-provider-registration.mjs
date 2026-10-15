#!/usr/bin/env node

/**
 * Provider registration across module instances.
 *
 * Every bridge instance registers the claude-bridge provider at activation.
 * Hosts can load the module many times in one process: subagent sessions load
 * it fresh, and pi-web loads it into a brand-new registry on every
 * /api/models request without ever starting a session. A later instance must
 * therefore register at load (session_start may never fire) and must register
 * the serving (first) instance's stream fn, so writing into a registry shared
 * with the parent leaves the parent's pinned stream fn in place.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const PROVIDER_ID = "claude-bridge";

const { default: activate } = await import("../src/index.js");

function activateWithMockPi(activateFn, options = {}) {
	// pi appends handlers (a later bridge instance registers two session_start
	// handlers: clearSession + deferred registration), so the mock does too.
	const handlers = new Map();
	const registered = [];
	(activateFn ?? activate)({
		on: (event, handler) => {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerProvider: (name, config) => registered.push({ name, config }),
		registerTool: () => {},
		events: { on: () => () => {}, emit: () => {} },
	});
	const emit = (event, ...args) => {
		for (const handler of handlers.get(event) ?? []) handler(...args);
	};
	return { handlers, registered, emit };
}

const sessionCtx = { cwd: "/tmp", sessionManager: { getSessionId: () => "test-session" } };

function registryWith(provider) {
	return { getProvider: (id) => (id === provider ? { name: provider } : undefined) };
}

describe("provider registration across module instances", () => {
	it("first instance registers its own stream fn at activation", () => {
		const { registered } = activateWithMockPi();
		assert.equal(registered.length, 1, "exactly one activation-time registration");
		assert.equal(registered[0].name, PROVIDER_ID);
		assert.equal(typeof registered[0].config.streamSimple, "function");
	});

	it("later instance registers at activation, with no session_start (pi-web /api/models)", async () => {
		const first = activateWithMockPi();
		const { default: activateFresh } = await import("../src/index.js?sessionless-host");
		const { registered } = activateWithMockPi(activateFresh);
		assert.equal(registered.length, 1, "registered without waiting for session_start");
		assert.equal(registered[0].name, PROVIDER_ID);
		assert.ok(registered[0].config.models.length > 0, "the registration carries models");
		assert.equal(
			registered[0].config.streamSimple,
			first.registered[0].config.streamSimple,
			"a later instance hands out the serving instance's stream fn",
		);
	});

	it("repeated sessionless loads all register (one per throwaway registry)", async () => {
		for (const tag of ["a", "b", "c"]) {
			const { default: activateFresh } = await import(`../src/index.js?throwaway-${tag}`);
			const { registered } = activateWithMockPi(activateFresh);
			assert.equal(registered.length, 1, `load ${tag} registered`);
		}
	});

	it("later instance never replaces the stream fn in a registry shared with the parent", async () => {
		const parent = activateWithMockPi();
		const parentFn = parent.registered[0].config.streamSimple;
		const { default: activateFresh } = await import("../src/index.js?shared-registry-child");
		const child = activateWithMockPi(activateFresh);
		assert.equal(child.registered[0].config.streamSimple, parentFn, "re-registration writes back the same fn");

		// session_start no longer registers a second time.
		child.emit("session_start", {}, { ...sessionCtx, modelRegistry: { getProvider: () => ({ name: PROVIDER_ID }) }, ui: undefined, mode: "print" });
		assert.equal(child.registered.length, 1, "no session_start registration");
	});
});
