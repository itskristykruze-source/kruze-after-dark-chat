import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	BrowserRouter,
	Routes,
	Route,
	Navigate,
	useParams,
} from "react-router";
import { nanoid } from "nanoid";

import {
	type BanEntry,
	type ChatMessage,
	type ChatRole,
	type Message,
} from "../shared";

const CHAT_NAME_KEY = "kkChatName";
const VIEWER_ID_KEY = "kkViewerId";

const RESERVED_NAMES = [
	"kristy",
	"kristy kruze",
	"@itskristykruze",
	"host",
	"admin",
	"administrator",
	"mod",
	"moderator",
];

function normalizeName(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

function getViewerId() {
	try {
		const saved = localStorage.getItem(VIEWER_ID_KEY);
		if (saved) return saved;

		const created = `viewer-${nanoid(18)}`;
		localStorage.setItem(VIEWER_ID_KEY, created);
		return created;
	} catch {
		return `viewer-${nanoid(18)}`;
	}
}

function App() {
	const { room } = useParams();
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [bans, setBans] = useState<BanEntry[]>([]);
	const [showBans, setShowBans] = useState(false);
	const [nameError, setNameError] = useState("");
	const [accessRole, setAccessRole] = useState<ChatRole>("user");
	const [moderationState, setModerationState] = useState<
		"kicked" | "banned" | null
	>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const access = useMemo(() => {
		const params = new URLSearchParams(window.location.search);
		return {
			hostToken: params.get("host") || "",
			modToken: params.get("mod") || "",
		};
	}, []);

	const requestedHost = Boolean(access.hostToken);
	const requestedMod = !requestedHost && Boolean(access.modToken);
	const hasPrivateAccessLink = requestedHost || requestedMod;

	const viewerId = useMemo(() => getViewerId(), []);

	const connectionQuery = useMemo(() => {
		const query: Record<string, string> = { viewer: viewerId };
		if (access.hostToken) query.host = access.hostToken;
		if (access.modToken) query.mod = access.modToken;
		return query;
	}, [access.hostToken, access.modToken, viewerId]);

	const [name, setName] = useState(() => {
		if (requestedHost) return "Kristy Kruze";
		if (requestedMod) return "Moderator";
		return normalizeName(localStorage.getItem(CHAT_NAME_KEY) || "");
	});
	const [nameDraft, setNameDraft] = useState(name);

	const socket = usePartySocket({
		party: "chat",
		room,
		query: connectionQuery,
		onMessage: (evt) => {
			const message = JSON.parse(evt.data as string) as Message;

			if (message.type === "auth") {
				setAccessRole(message.role);
				if (message.bans) setBans(message.bans);

				const invalidPrivateLink =
					(requestedHost && message.role !== "host") ||
					(requestedMod && message.role !== "mod");

				if (invalidPrivateLink) {
					setName("");
					setNameDraft("");
					setNameError("That private access link is invalid.");
				}
				return;
			}

			if (message.type === "bans") {
				setBans(message.bans);
				return;
			}

			if (message.type === "moderation") {
				setModerationState(message.action);
				socket.close(4000, "Moderated");
				return;
			}

			if (message.type === "all") {
				setMessages(message.messages);
				return;
			}

			if (message.type === "delete") {
				setMessages((current) =>
					current.filter((item) => item.id !== message.id),
				);
				return;
			}

			if (message.type === "clear") {
				setMessages([]);
				return;
			}

			if (message.type === "add") {
				setMessages((current) => {
					const foundIndex = current.findIndex((m) => m.id === message.id);
					const nextMessage: ChatMessage = {
						id: message.id,
						content: message.content,
						user: message.user,
						role: message.role,
						viewerId:
							"viewerId" in message ? message.viewerId : undefined,
					};

					if (foundIndex === -1) return [...current, nextMessage];

					return current
						.slice(0, foundIndex)
						.concat(nextMessage)
						.concat(current.slice(foundIndex + 1));
				});
				return;
			}

			if (message.type === "update") {
				setMessages((current) =>
					current.map((m) =>
						m.id === message.id
							? {
									id: message.id,
									content: message.content,
									user: message.user,
									role: message.role,
									viewerId:
										"viewerId" in message ? message.viewerId : m.viewerId,
								}
							: m,
					),
				);
			}
		},
		onClose: (evt) => {
			if (evt.code === 4003) {
				setModerationState("kicked");
				setTimeout(() => socket.close(), 0);
			}
			if (evt.code === 4004) {
				setModerationState("banned");
				setTimeout(() => socket.close(), 0);
			}
		},
	});

	const canModerate = accessRole === "host" || accessRole === "mod";

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [messages]);

	function saveViewerName(e: React.FormEvent) {
		e.preventDefault();
		const nextName = normalizeName(nameDraft);

		if (nextName.length < 3) {
			setNameError("Use at least 3 characters.");
			return;
		}
		if (nextName.length > 24) {
			setNameError("Keep your name to 24 characters or less.");
			return;
		}
		if (RESERVED_NAMES.includes(nextName.toLowerCase())) {
			setNameError("That name is reserved. Choose another one.");
			return;
		}

		localStorage.setItem(CHAT_NAME_KEY, nextName);
		setName(nextName);
		setNameDraft(nextName);
		setNameError("");
	}

	function changeName() {
		if (canModerate) return;
		setNameDraft(name);
		setName("");
		setNameError("");
	}

	function sendModeration(type: "kick" | "ban" | "unban", targetViewerId: string) {
		socket.send(
			JSON.stringify({
				type,
				viewerId: targetViewerId,
			} satisfies Message),
		);
	}

	return (
		<div className="chat-app">
			{moderationState && (
				<div
					className="name-gate moderation-gate"
					role="dialog"
					aria-modal="true"
				>
					<div className="name-card">
						<div className="name-kicker">Kruze After Dark</div>
						<h2>
							{moderationState === "banned"
								? "Chat access blocked"
								: "Removed from chat"}
						</h2>
						<p>
							{moderationState === "banned"
								? "This browser has been banned from participating in this live chat."
								: "A moderator removed you from this chat session. Refresh the page to try joining again."}
						</p>
					</div>
				</div>
			)}

			{!name && (!hasPrivateAccessLink || accessRole === "user") && !moderationState && (
				<div
					className="name-gate"
					role="dialog"
					aria-modal="true"
					aria-label="Choose a chat name"
				>
					<form className="name-card" onSubmit={saveViewerName}>
						<div className="name-kicker">Kruze After Dark</div>
						<h2>Choose your chat name</h2>
						<p>Pick the name you want everyone in the room to see.</p>
						<input
							autoFocus
							type="text"
							value={nameDraft}
							onChange={(e) => {
								setNameDraft(e.target.value);
								setNameError("");
							}}
							placeholder="Your name"
							maxLength={24}
							autoComplete="nickname"
						/>
						{nameError && <div className="name-error">{nameError}</div>}
						<button type="submit" className="name-join-button">
							Join Live Chat
						</button>
						<div className="name-note">
							Your chat name is remembered on this device.
						</div>
					</form>
				</div>
			)}

			<div className="chat container">
				<div className="message-list" ref={scrollRef}>
					{messages.length === 0 && (
						<div className="empty-chat">
							<span>Live room is open.</span>
							Be the first to say something.
						</div>
					)}

					{messages.map((message) => (
						<div
							key={message.id}
							className={`row message ${message.role === "host" ? "host-message" : ""} ${message.role === "mod" ? "mod-message" : ""}`}
						>
							<div className="two columns user">
								<span>{message.user}</span>
								{message.role === "host" && (
									<b className="host-badge">HOST</b>
								)}
								{message.role === "mod" && (
									<b className="mod-badge">MOD</b>
								)}
							</div>

							<div className="ten columns message-body">
								<span>{message.content}</span>

								{canModerate && (
									<div className="moderation-buttons">
										<button
											type="button"
											className="mod-action delete-action"
											title="Delete message"
											onClick={() =>
												socket.send(
													JSON.stringify({
														type: "delete",
														id: message.id,
													} satisfies Message),
												)
											}
										>
											Delete
										</button>

										{message.role === "user" && message.viewerId && (
											<>
												<button
													type="button"
													className="mod-action"
													title="Remove viewer from this chat session"
													onClick={() => {
														if (
															window.confirm(
																`Kick ${message.user} from this chat session?`,
															)
														) {
															sendModeration("kick", message.viewerId!);
														}
													}}
												>
													Kick
												</button>

												<button
													type="button"
													className="mod-action ban-action"
													title="Ban viewer from chat"
													onClick={() => {
														if (
															window.confirm(
																`Ban ${message.user} from live chat?`,
															)
														) {
															sendModeration("ban", message.viewerId!);
														}
													}}
												>
													Ban
												</button>
											</>
										)}
									</div>
								)}
							</div>
						</div>
					))}
				</div>

				{canModerate && showBans && (
					<div className="ban-panel">
						<div className="ban-panel-title">
							<span>Banned viewers</span>
							<button type="button" onClick={() => setShowBans(false)}>
								Close
							</button>
						</div>
						{bans.length === 0 ? (
							<div className="ban-empty">No viewers are currently banned.</div>
						) : (
							bans.map((entry) => (
								<div className="ban-row" key={entry.viewerId}>
									<span>{entry.user}</span>
									<button
										type="button"
										onClick={() => sendModeration("unban", entry.viewerId)}
									>
										Unban
									</button>
								</div>
							))
						)}
					</div>
				)}

				<form
					className="row"
					onSubmit={(e) => {
						e.preventDefault();
						if (!name || moderationState) return;

						const content = e.currentTarget.elements.namedItem(
							"content",
						) as HTMLInputElement;
						const trimmedContent = content.value.trim();
						if (!trimmedContent) return;

						const chatMessage: ChatMessage = {
							id: nanoid(8),
							content: trimmedContent,
							user: name,
							role: accessRole,
						};

						setMessages((current) => [...current, chatMessage]);

						socket.send(
							JSON.stringify({
								type: "add",
								id: chatMessage.id,
								content: chatMessage.content,
								user: chatMessage.user,
								role: chatMessage.role,
							} satisfies Message),
						);

						content.value = "";
					}}
				>
					<div className="identity-strip">
						<span>
							Chatting as <strong>{name || "Guest"}</strong>
							{accessRole === "host" && (
								<b className="host-badge identity-host">HOST</b>
							)}
							{accessRole === "mod" && (
								<b className="mod-badge identity-host">MOD</b>
							)}
						</span>

						<div className="identity-actions">
							{canModerate && (
								<button
									type="button"
									className="bans-button"
									onClick={() => setShowBans((current) => !current)}
								>
									Bans {bans.length > 0 ? `(${bans.length})` : ""}
								</button>
							)}

							{accessRole === "host" ? (
								<button
									type="button"
									className="clear-chat"
									onClick={() => {
										if (
											!window.confirm(
												"Clear every message from this live chat?",
											)
										)
											return;
										socket.send(
											JSON.stringify({
												type: "clear",
											} satisfies Message),
										);
									}}
								>
									Clear chat
								</button>
							) : (
								!canModerate &&
								name && (
									<button
										type="button"
										className="change-name"
										onClick={changeName}
									>
										Change
									</button>
								)
							)}
						</div>
					</div>

					<div className="composer-row">
						<input
							type="text"
							name="content"
							className="ten columns my-input-text"
							placeholder={
								name ? `Message as ${name}...` : "Choose a name to chat"
							}
							autoComplete="off"
							maxLength={500}
							disabled={!name || Boolean(moderationState)}
						/>
						<button
							type="submit"
							className="send-message two columns"
							disabled={!name || Boolean(moderationState)}
						>
							Send
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
	<BrowserRouter>
		<Routes>
			<Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
			<Route path="/:room" element={<App />} />
			<Route path="*" element={<Navigate to="/" />} />
		</Routes>
	</BrowserRouter>,
);
