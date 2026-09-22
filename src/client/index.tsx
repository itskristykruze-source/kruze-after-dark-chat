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

import { type ChatMessage, type Message } from "../shared";

const CHAT_NAME_KEY = "kkChatName";
const HOST_TOKEN = "KKHOST-7pQ4xN9mR2vL6sT8";
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

function App() {
	const { room } = useParams();
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [nameError, setNameError] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);

	const isHost = useMemo(() => {
		const params = new URLSearchParams(window.location.search);
		return params.get("host") === HOST_TOKEN;
	}, []);

	const [name, setName] = useState(() => {
		if (isHost) return "Kristy Kruze";
		return normalizeName(localStorage.getItem(CHAT_NAME_KEY) || "");
	});
	const [nameDraft, setNameDraft] = useState(name);

	const socket = usePartySocket({
		party: "chat",
		room,
		onMessage: (evt) => {
			const message = JSON.parse(evt.data as string) as Message;

			if (message.type === "all") {
				setMessages(message.messages);
				return;
			}

			if (message.type === "delete") {
				setMessages((current) => current.filter((m) => m.id !== message.id));
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
					};

					if (foundIndex === -1) return [...current, nextMessage];

					return current
						.slice(0, foundIndex)
						.concat(nextMessage)
						.concat(current.slice(foundIndex + 1));
				});
				return;
			}

			setMessages((current) =>
				current.map((m) =>
					m.id === message.id
						? {
								id: message.id,
								content: message.content,
								user: message.user,
								role: message.role,
							}
						: m,
				),
			);
		},
	});

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
		if (isHost) return;
		setNameDraft(name);
		setName("");
		setNameError("");
	}

	return (
		<div className="chat-app">
			{!name && !isHost && (
				<div className="name-gate" role="dialog" aria-modal="true" aria-label="Choose a chat name">
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
						<button type="submit" className="name-join-button">Join Live Chat</button>
						<div className="name-note">Your chat name is remembered on this device.</div>
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
							className={`row message ${message.role === "host" ? "host-message" : ""}`}
						>
							<div className="two columns user">
								<span>{message.user}</span>
								{message.role === "host" && <b className="host-badge">HOST</b>}
							</div>
							<div className="ten columns message-body">
								<span>{message.content}</span>
								{isHost && (
									<button
										type="button"
										className="delete-message"
										aria-label="Delete message"
										title="Delete message"
										onClick={() => {
											socket.send(
												JSON.stringify({
													type: "delete",
													id: message.id,
													authToken: HOST_TOKEN,
												} satisfies Message),
											);
										}}
									>
										×
									</button>
								)}
							</div>
						</div>
					))}
				</div>

				<form
					className="row"
					onSubmit={(e) => {
						e.preventDefault();
						if (!name) return;

						const content = e.currentTarget.elements.namedItem(
							"content",
						) as HTMLInputElement;
						const trimmedContent = content.value.trim();
						if (!trimmedContent) return;

						const chatMessage: ChatMessage = {
							id: nanoid(8),
							content: trimmedContent,
							user: name,
							role: isHost ? "host" : "user",
						};

						setMessages((current) => [...current, chatMessage]);
						socket.send(
							JSON.stringify({
								type: "add",
								...chatMessage,
								authToken: isHost ? HOST_TOKEN : undefined,
							} satisfies Message),
						);

						content.value = "";
					}}
				>
					<div className="identity-strip">
						<span>
							Chatting as <strong>{name || "Guest"}</strong>
							{isHost && <b className="host-badge identity-host">HOST</b>}
						</span>
						{isHost ? (
							<button
								type="button"
								className="clear-chat"
								onClick={() => {
									if (!window.confirm("Clear every message from this live chat?")) return;
									socket.send(
										JSON.stringify({
											type: "clear",
											authToken: HOST_TOKEN,
										} satisfies Message),
									);
								}}
							>
								Clear chat
							</button>
						) : (
							name && (
								<button type="button" className="change-name" onClick={changeName}>
									Change
								</button>
							)
						)}
					</div>

					<div className="composer-row">
						<input
							type="text"
							name="content"
							className="ten columns my-input-text"
							placeholder={name ? `Message as ${name}...` : "Choose a name to chat"}
							autoComplete="off"
							maxLength={500}
							disabled={!name}
						/>
						<button
							type="submit"
							className="send-message two columns"
							disabled={!name}
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
