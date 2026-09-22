import {
	type Connection,
	Server,
	type WSMessage,
	routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

const HOST_TOKEN = "KKHOST-7pQ4xN9mR2vL6sT8";
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

function cleanName(value: string) {
	return value.replace(/\s+/g, " ").trim().slice(0, 24);
}

function cleanContent(value: string) {
	return value.trim().slice(0, 500);
}

export class Chat extends Server<Env> {
	static options = { hibernate: true };

	messages = [] as ChatMessage[];

	broadcastMessage(message: Message, exclude?: string[]) {
		this.broadcast(JSON.stringify(message), exclude);
	}

	onStart() {
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT)`,
		);

		this.messages = this.ctx.storage.sql
			.exec(`SELECT * FROM messages`)
			.toArray() as ChatMessage[];
	}

	onConnect(connection: Connection) {
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
			`INSERT INTO messages (id, user, role, content) VALUES (?, ?, ?, ?)
			 ON CONFLICT (id) DO UPDATE SET user = ?, role = ?, content = ?`,
			message.id,
			message.user,
			message.role,
			message.content,
			message.user,
			message.role,
			message.content,
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

	onMessage(_connection: Connection, raw: WSMessage) {
		let parsed: Message;

		try {
			parsed = JSON.parse(raw as string) as Message;
		} catch {
			return;
		}

		const isHost = "authToken" in parsed && parsed.authToken === HOST_TOKEN;

		if (parsed.type === "add" || parsed.type === "update") {
			const content = cleanContent(parsed.content);
			if (!content) return;

			const role = isHost ? "host" : "user";
			const user = role === "host" ? "Kristy Kruze" : cleanName(parsed.user);
			if (!user || user.length < 3) return;
			if (role !== "host" && RESERVED_NAMES.has(user.toLowerCase())) return;

			const message: ChatMessage = {
				id: parsed.id,
				content,
				user,
				role,
			};

			this.saveMessage(message);
			this.broadcastMessage({
				type: parsed.type,
				...message,
			});
			return;
		}

		if (parsed.type === "delete") {
			if (!isHost) return;
			this.deleteMessage(parsed.id);
			this.broadcastMessage({ type: "delete", id: parsed.id });
			return;
		}

		if (parsed.type === "clear") {
			if (!isHost) return;
			this.clearMessages();
			this.broadcastMessage({ type: "clear" });
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
