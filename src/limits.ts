// Read-only quota controls stay with the bridge's SDK and authentication context.
import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerLimits(
	pi: ExtensionAPI,
	options: () => NonNullable<Parameters<typeof query>[0]["options"]>,
	active: () => unknown,
	create = query,
) {
	let pending: Promise<unknown> | undefined;
	let idle: Query | undefined;
	let finish: (() => void) | undefined;
	let stopped = false;
	async function read() {
		let sdk = active() as Query | undefined;
		if (!sdk) {
			const wait = new Promise<void>((resolve) => {
				finish = resolve;
			});
			sdk = idle = create({
				prompt: (async function* () {
					await wait;
				})(),
				options: {
					...options(),
					tools: [],
					persistSession: false,
					extraArgs: { "strict-mcp-config": null },
				},
			});
		}
		const owned = sdk === idle;
		let timer: ReturnType<typeof setTimeout>;
		try {
			return await Promise.race([
				(async () => {
					const account = await sdk.accountInfo();
					const usage = await sdk.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET();
					const after = await sdk.accountInfo();
					if (account.email !== after.email || account.organization !== after.organization)
						throw new Error("Account changed");
					return {
						account: {
							email: account.email,
							organization: account.organization,
							subscriptionType: account.subscriptionType,
							apiProvider: account.apiProvider,
						},
						usage: {
							subscription_type: usage.subscription_type,
							rate_limits_available: usage.rate_limits_available,
							rate_limits: usage.rate_limits,
						},
						fetchedAt: Date.now(),
					};
				})(),
				new Promise((_, reject) => {
					timer = setTimeout(() => reject(new Error("Timeout")), 12000);
				}),
			]);
		} finally {
			clearTimeout(timer!);
			if (owned) {
				finish?.();
				sdk.close();
				idle = undefined;
				finish = undefined;
			}
		}
	}
	// Test hosts may omit the event bus; real pi always provides it.
	if (!pi.events) return;
	const unsubscribe = pi.events.on("subscription-limits:claude:read", (event: unknown) => {
		const id = (event as { id?: string })?.id;
		if (stopped || typeof id !== "string") return;
		if (!pending)
			pending = read().finally(() => {
				pending = undefined;
			});
		void pending.then(
			(snapshot) => {
				if (!stopped) pi.events.emit("subscription-limits:claude:result", { id, snapshot });
			},
			() => {
				if (!stopped)
					pi.events.emit("subscription-limits:claude:result", {
						id,
						error: "Claude quota read failed or timed out",
					});
			},
		);
	});
	// Never let an idle control client overlap the start of model work.
	pi.on("before_agent_start", async () => {
		finish?.();
		idle?.close();
		await pending?.catch(() => {});
	});
	pi.on("session_shutdown", async () => {
		stopped = true;
		unsubscribe();
		finish?.();
		idle?.close();
	});
}
