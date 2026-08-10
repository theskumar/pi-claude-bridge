// Turns a resolved systemPromptMode plus Pi's projected prompt content into the
// value handed to the Agent SDK's `systemPrompt` option.
//
// Pi's own SYSTEM.md already reaches the bridge as systemPromptOptions.customPrompt
// (pi assembles it from resource-loader.getSystemPrompt()), so it arrives inside the
// projected content along with context files, skills and append instructions. Nothing
// here reads the filesystem: replace mode sends what Pi loaded, not a second copy the
// bridge discovered on its own.

import type { SystemPromptMode } from "./config.js";

export type SdkSystemPrompt = string | { type: "preset"; preset: "claude_code"; append?: string };

/** `projected` is projectPromptCapture()'s output: Pi's portable content for this query,
 *  or undefined when Pi loaded nothing to forward (`--no-context-files --no-skills`).
 *
 *  Replace mode returns a string, which the SDK treats as a custom prompt — Claude Code's
 *  preset is then never sent. With nothing projected that string is empty, meaning the turn
 *  runs with no system prompt at all; that is the honest reading of "replace" and is left
 *  visible rather than silently falling back to the preset. */
export function buildSystemPrompt(mode: SystemPromptMode, projected: string | undefined): SdkSystemPrompt {
	if (mode === "replace") return projected ?? "";
	return {
		type: "preset",
		preset: "claude_code",
		...(mode === "append" && projected ? { append: projected } : {}),
	};
}
