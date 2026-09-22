import {
	type Connection,
	type ConnectionContext,
	Server,
	type WSMessage,
	routePartykitRequest,
} from "partyserver";

import type { BanEntry, ChatMessage, ChatRole, Message } from "../shared";

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
