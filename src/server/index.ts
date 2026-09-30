import {
	type Connection,
	type ConnectionContext,
	Server,
	type WSMessage,
	routePartykitRequest,
} from "partyserver";

import type {
	BanEntry,
	ChatMessage,
	ChatRole,
	GameType,
	Message,
	PollChoice,
	PollState,
} from "../shared";

const HOST_TOKEN_HASH =
	"da5dea35683c0df169f94452804ae1a86cd1a256cb181f60958eeee020535b9b";
const MOD_TOKEN_HASH =
	"defb7a2dbdae5272d7982c443e13a2e1b1d78c9d96727773a635fa5ba893d0eb";

const RESERVED_NAMES = new Set([
	"kristy",
	"kristy kruze",
	"@itskristykruze",
	"host",
	"admin",
	"administrator",
	"mod",
	"moderator",
]);

type ChatConnectionState = {
	role: ChatRole;
	viewerId: string;
};

function cleanName(value: string) {
	return value.replace(/\s+/g, " ").trim().slice(0, 24);
}

function cleanContent(value: string) {
	return value.trim().slice(0, 500);
}

function cleanViewerId(value: string) {
	return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

async function sha256(value: string) {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function matchesToken(value: string | null, expectedHash: string) {
	if (!value) return false;
	return (await sha256(value)) === expectedHash;
}

export class Chat extends Server<Env> {
	static options = { hibernate: true };

	messages = [] as ChatMessage[];
	bans = [] as BanEntry[];
	poll = null as PollState | null;

	broadcastMessage(message: Message, exclude?: string[]) {
		this.broadcast(JSON.stringify(message), exclude);
	}

	onStart() {
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				user TEXT,
				role TEXT,
				content TEXT
			)`,
		);

		const messageColumns = this.ctx.storage.sql
			.exec(`PRAGMA table_info(messages)`)
			.toArray() as Array<{ name: string }>;

		if (!messageColumns.some((column) => column.name === "viewer_id")) {
			this.ctx.storage.sql.exec(
				`ALTER TABLE messages ADD COLUMN viewer_id TEXT`,
			);
		}

		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS bans (
				viewer_id TEXT PRIMARY KEY,
				user TEXT,
				created_at INTEGER
			)`,
		);

		this.messages = this.ctx.storage.sql
			.exec(
				`SELECT id, user, role, content, viewer_id AS viewerId
				 FROM messages`,
			)
			.toArray() as ChatMessage[];

		this.bans = this.ctx.storage.sql
			.exec(
				`SELECT viewer_id AS viewerId, user
				 FROM bans
				 ORDER BY created_at DESC`,
			)
			.toArray() as BanEntry[];

		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS poll_state (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				poll_id TEXT,
				game_type TEXT,
				prompt TEXT,
				option_a TEXT,
				option_b TEXT,
				status TEXT,
				ends_at INTEGER
			)`,
		);

		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS poll_votes (
				poll_id TEXT,
				viewer_id TEXT,
				choice TEXT,
				PRIMARY KEY (poll_id, viewer_id)
			)`,
		);

		const pollRows = this.ctx.storage.sql
			.exec(
				`SELECT poll_id AS id, game_type AS gameType, prompt,
					option_a AS optionA, option_b AS optionB, status, ends_at AS endsAt
				 FROM poll_state WHERE id = 1`,
			)
			.toArray() as Array<{
				id: string;
				gameType: GameType;
				prompt: string;
				optionA: string;
				optionB: string;
				status: "open" | "closed";
				endsAt: number;
			}>;

		if (pollRows[0]) {
			const counts = this.getPollCounts(pollRows[0].id);
			this.poll = { ...pollRows[0], ...counts };
		}
	}

	async onConnect(connection: Connection, ctx: ConnectionContext) {
		const url = new URL(ctx.request.url);
		const viewerId = cleanViewerId(url.searchParams.get("viewer") || connection.id);

		let role: ChatRole = "user";
		if (await matchesToken(url.searchParams.get("host"), HOST_TOKEN_HASH)) {
			role = "host";
		} else if (await matchesToken(url.searchParams.get("mod"), MOD_TOKEN_HASH)) {
			role = "mod";
		}

		connection.setState<ChatConnectionState>({ role, viewerId });

		if (
			role === "user" &&
			this.bans.some((entry) => entry.viewerId === viewerId)
		) {
			connection.send(
				JSON.stringify({
					type: "moderation",
					action: "banned",
				} satisfies Message),
			);
			connection.close(4004, "Banned from chat");
			return;
		}

		connection.send(
			JSON.stringify({
				type: "auth",
				role,
				bans: role === "host" || role === "mod" ? this.bans : undefined,
				poll: this.getPollForViewer(viewerId),
			} satisfies Message),
		);

		connection.send(
			JSON.stringify({
				type: "all",
				messages: this.messages,
			} satisfies Message),
		);
	}

	saveMessage(message: ChatMessage) {
		const existingMessage = this.messages.find((m) => m.id === message.id);
		if (existingMessage) {
			this.messages = this.messages.map((m) =>
				m.id === message.id ? message : m,
			);
		} else {
			this.messages.push(message);
		}

		this.ctx.storage.sql.exec(
			`INSERT INTO messages (id, user, role, content, viewer_id)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (id) DO UPDATE SET
				user = ?,
				role = ?,
				content = ?,
				viewer_id = ?`,
			message.id,
			message.user,
			message.role,
			message.content,
			message.viewerId || null,
			message.user,
			message.role,
			message.content,
			message.viewerId || null,
		);
	}

	deleteMessage(id: string) {
		this.messages = this.messages.filter((message) => message.id !== id);
		this.ctx.storage.sql.exec(`DELETE FROM messages WHERE id = ?`, id);
	}

	clearMessages() {
		this.messages = [];
		this.ctx.storage.sql.exec(`DELETE FROM messages`);
	}

	sendBansToModerators() {
		const payload = JSON.stringify({
			type: "bans",
			bans: this.bans,
		} satisfies Message);

		for (const connection of this.getConnections()) {
			const state = connection.state as ChatConnectionState | null;
			if (state?.role === "host" || state?.role === "mod") {
				connection.send(payload);
			}
		}
	}

	getPollCounts(pollId: string) {
		const rows = this.ctx.storage.sql
			.exec(
				`SELECT
					SUM(CASE WHEN choice = 'a' THEN 1 ELSE 0 END) AS votesA,
					SUM(CASE WHEN choice = 'b' THEN 1 ELSE 0 END) AS votesB
				 FROM poll_votes WHERE poll_id = ?`,
				pollId,
			)
			.toArray() as Array<{ votesA: number | null; votesB: number | null }>;

		return {
			votesA: Number(rows[0]?.votesA || 0),
			votesB: Number(rows[0]?.votesB || 0),
		};
	}

	getPollForViewer(viewerId?: string): PollState | null {
		if (!this.poll) return null;

		let myVote: PollChoice | undefined;
		if (viewerId) {
			const rows = this.ctx.storage.sql
				.exec(
					`SELECT choice FROM poll_votes WHERE poll_id = ? AND viewer_id = ?`,
					this.poll.id,
					viewerId,
				)
				.toArray() as Array<{ choice: PollChoice }>;
			myVote = rows[0]?.choice;
		}

		return { ...this.poll, myVote };
	}

	broadcastPollState() {
		for (const connection of this.getConnections()) {
			const state = connection.state as ChatConnectionState | null;
			connection.send(
				JSON.stringify({
					type: "poll_state",
					poll: this.getPollForViewer(state?.viewerId),
				} satisfies Message),
			);
		}
	}

	startPoll(poll: Omit<PollState, "votesA" | "votesB" | "myVote">) {
		this.ctx.storage.sql.exec(
			`INSERT INTO poll_state
				(id, poll_id, game_type, prompt, option_a, option_b, status, ends_at)
			 VALUES (1, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (id) DO UPDATE SET
				poll_id = ?, game_type = ?, prompt = ?, option_a = ?,
				option_b = ?, status = ?, ends_at = ?`,
			poll.id,
			poll.gameType,
			poll.prompt,
			poll.optionA,
			poll.optionB,
			poll.status,
			poll.endsAt,
			poll.id,
			poll.gameType,
			poll.prompt,
			poll.optionA,
			poll.optionB,
			poll.status,
			poll.endsAt,
		);
		this.ctx.storage.sql.exec(`DELETE FROM poll_votes WHERE poll_id != ?`, poll.id);
		this.poll = { ...poll, votesA: 0, votesB: 0 };
		this.broadcastPollState();
	}

	endPoll() {
		if (!this.poll) return;
		this.poll = { ...this.poll, status: "closed" };
		this.ctx.storage.sql.exec(
			`UPDATE poll_state SET status = 'closed' WHERE id = 1`,
		);
		this.broadcastPollState();
	}

	clearPoll() {
		this.poll = null;
		this.ctx.storage.sql.exec(`DELETE FROM poll_state WHERE id = 1`);
		this.ctx.storage.sql.exec(`DELETE FROM poll_votes`);
		this.broadcastPollState();
	}

	removeViewer(viewerId: string, action: "kicked" | "banned") {
		const payload = JSON.stringify({
			type: "moderation",
			action,
		} satisfies Message);

		for (const connection of this.getConnections()) {
			const state = connection.state as ChatConnectionState | null;
			if (state?.role === "user" && state.viewerId === viewerId) {
				connection.send(payload);
				connection.close(
					action === "banned" ? 4004 : 4003,
					action === "banned" ? "Banned from chat" : "Removed from chat",
				);
			}
		}
	}

	onMessage(connection: Connection, raw: WSMessage) {
		let parsed: Message;

		try {
			parsed = JSON.parse(raw as string) as Message;
		} catch {
			return;
		}

		const state = connection.state as ChatConnectionState | null;
		const role = state?.role || "user";
		const viewerId = state?.viewerId || connection.id;
		const canModerate = role === "host" || role === "mod";

		if (role === "user" && this.bans.some((entry) => entry.viewerId === viewerId)) {
			connection.send(
				JSON.stringify({
					type: "moderation",
					action: "banned",
				} satisfies Message),
			);
			connection.close(4004, "Banned from chat");
			return;
		}

		if (parsed.type === "add" || parsed.type === "update") {
			const content = cleanContent(parsed.content);
			if (!content) return;

			const user =
				role === "host"
					? "Kristy Kruze"
					: role === "mod"
						? "Moderator"
						: cleanName(parsed.user);

			if (!user || user.length < 3) return;
			if (role === "user" && RESERVED_NAMES.has(user.toLowerCase())) return;

			const message: ChatMessage = {
				id: parsed.id,
				content,
				user,
				role,
				viewerId: role === "user" ? viewerId : undefined,
			};

			this.saveMessage(message);
			this.broadcastMessage({
				type: parsed.type,
				id: message.id,
				content: message.content,
				user: message.user,
				role: message.role,
			});

			// Send the moderation-aware version to host/mod connections.
			const modPayload = JSON.stringify({
				type: parsed.type,
				...message,
			} satisfies Message);

			for (const target of this.getConnections()) {
				const targetState = target.state as ChatConnectionState | null;
				if (targetState?.role === "host" || targetState?.role === "mod") {
					target.send(modPayload);
				}
			}
			return;
		}

		if (parsed.type === "poll_start") {
			if (role !== "host") return;

			const prompt = cleanContent(parsed.poll.prompt);
			const optionA = cleanContent(parsed.poll.optionA);
			const optionB = cleanContent(parsed.poll.optionB);
			const allowedGames = new Set<GameType>([
				"red-flag",
				"would-you-rather",
				"truth-or-temptation",
				"kruze-court",
				"custom",
			]);

			if (!prompt || !optionA || !optionB) return;
			if (!allowedGames.has(parsed.poll.gameType)) return;

			const endsAt = Math.min(
				Math.max(Number(parsed.poll.endsAt) || Date.now() + 30_000, Date.now() + 10_000),
				Date.now() + 180_000,
			);

			this.startPoll({
				id: cleanViewerId(parsed.poll.id) || crypto.randomUUID(),
				gameType: parsed.poll.gameType,
				prompt,
				optionA,
				optionB,
				status: "open",
				endsAt,
			});
			return;
		}

		if (parsed.type === "poll_vote") {
			if (role !== "user" || !this.poll) return;
			if (this.poll.id !== parsed.pollId || this.poll.status !== "open") return;
			if (Date.now() >= this.poll.endsAt) {
				this.endPoll();
				return;
			}
			if (parsed.choice !== "a" && parsed.choice !== "b") return;

			this.ctx.storage.sql.exec(
				`INSERT INTO poll_votes (poll_id, viewer_id, choice)
				 VALUES (?, ?, ?)
				 ON CONFLICT (poll_id, viewer_id) DO UPDATE SET choice = ?`,
				this.poll.id,
				viewerId,
				parsed.choice,
				parsed.choice,
			);
			this.poll = { ...this.poll, ...this.getPollCounts(this.poll.id) };
			this.broadcastPollState();
			return;
		}

		if (parsed.type === "poll_end") {
			if (role !== "host") return;
			this.endPoll();
			return;
		}

		if (parsed.type === "poll_clear") {
			if (role !== "host") return;
			this.clearPoll();
			return;
		}

		if (parsed.type === "delete") {
			if (!canModerate) return;
			this.deleteMessage(parsed.id);
			this.broadcastMessage({ type: "delete", id: parsed.id });
			return;
		}

		if (parsed.type === "clear") {
			if (role !== "host") return;
			this.clearMessages();
			this.broadcastMessage({ type: "clear" });
			return;
		}

		if (parsed.type === "kick") {
			if (!canModerate) return;
			this.removeViewer(cleanViewerId(parsed.viewerId), "kicked");
			return;
		}

		if (parsed.type === "ban") {
			if (!canModerate) return;

			const targetViewerId = cleanViewerId(parsed.viewerId);
			if (!targetViewerId) return;

			const targetUser =
				[...this.messages]
					.reverse()
					.find((message) => message.viewerId === targetViewerId)?.user ||
				"Viewer";

			this.ctx.storage.sql.exec(
				`INSERT INTO bans (viewer_id, user, created_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT (viewer_id) DO UPDATE SET
					user = ?,
					created_at = ?`,
				targetViewerId,
				targetUser,
				Date.now(),
				targetUser,
				Date.now(),
			);

			this.bans = [
				{ viewerId: targetViewerId, user: targetUser },
				...this.bans.filter((entry) => entry.viewerId !== targetViewerId),
			];

			this.sendBansToModerators();
			this.removeViewer(targetViewerId, "banned");
			return;
		}

		if (parsed.type === "unban") {
			if (!canModerate) return;

			const targetViewerId = cleanViewerId(parsed.viewerId);
			this.ctx.storage.sql.exec(
				`DELETE FROM bans WHERE viewer_id = ?`,
				targetViewerId,
			);
			this.bans = this.bans.filter(
				(entry) => entry.viewerId !== targetViewerId,
			);
			this.sendBansToModerators();
		}
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routePartykitRequest(request, { ...env })) ||
			env.ASSETS.fetch(request)
		);
	},
} satisfies ExportedHandler<Env>;
