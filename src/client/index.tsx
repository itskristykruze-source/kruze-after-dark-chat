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
	type GameType,
	type Message,
	type PollChoice,
	type PollState,
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
	const [poll, setPoll] = useState<PollState | null>(null);
	const [gameType, setGameType] = useState<GameType>("red-flag");
	const [gamePrompt, setGamePrompt] = useState("");
	const [gameOptionA, setGameOptionA] = useState("");
	const [gameOptionB, setGameOptionB] = useState("");
	const [gameDuration, setGameDuration] = useState(30);
	const [now, setNow] = useState(() => Date.now());
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
				if (message.poll !== undefined) setPoll(message.poll);

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

			if (message.type === "poll_state") {
				setPoll(message.poll);
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
	const isHostDashboard = accessRole === "host";
	const peopleWhoChatted = useMemo(
		() =>
			new Set(
				messages
					.filter((message) => message.role === "user")
					.map((message) => message.viewerId || message.user),
			).size,
		[messages],
	);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [messages]);

	useEffect(() => {
		if (!poll || poll.status !== "open") return;
		const timer = window.setInterval(() => setNow(Date.now()), 500);
		return () => window.clearInterval(timer);
	}, [poll?.id, poll?.status]);

	const remainingSeconds = poll
		? Math.max(0, Math.ceil((poll.endsAt - now) / 1000))
		: 0;
	const pollIsOpen = Boolean(
		poll && poll.status === "open" && remainingSeconds > 0,
	);
	const totalVotes = poll ? poll.votesA + poll.votesB : 0;
	const percentA =
		poll && totalVotes > 0 ? Math.round((poll.votesA / totalVotes) * 100) : 0;
	const percentB =
		poll && totalVotes > 0 ? Math.round((poll.votesB / totalVotes) * 100) : 0;

	const gameLabels: Record<GameType, string> = {
		"red-flag": "Red Flag",
		"would-you-rather": "Would You Rather",
		"truth-or-temptation": "Truth or Temptation",
		"kruze-court": "Kruze Court",
		custom: "Custom Poll",
	};

	function startGamePoll() {
		const prompt = gamePrompt.trim();
		const optionA = gameOptionA.trim();
		const optionB = gameOptionB.trim();
		if (!prompt || !optionA || !optionB) {
			window.alert("Add the scenario/question and both voting options first.");
			return;
		}

		socket.send(
			JSON.stringify({
				type: "poll_start",
				poll: {
					id: nanoid(10),
					gameType,
					prompt,
					optionA,
					optionB,
					status: "open",
					endsAt: Date.now() + gameDuration * 1000,
				},
			} satisfies Message),
		);
		setNow(Date.now());
	}

	function vote(choice: PollChoice) {
		if (!poll || !pollIsOpen || accessRole !== "user") return;
		socket.send(
			JSON.stringify({
				type: "poll_vote",
				pollId: poll.id,
				choice,
			} satisfies Message),
		);
	}

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
		<div className={`chat-app ${isHostDashboard ? "host-dashboard" : ""}`}>
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

			{isHostDashboard && (
				<header className="host-dashboard-header">
					<div>
						<div className="host-dashboard-kicker">Private Host Control Room</div>
						<h1>Kristy Kruze Dashboard</h1>
					</div>
					<div className="host-connection-pill">
						<span className="host-connection-dot" />
						HOST CONNECTED
					</div>
				</header>
			)}

			<div className="chat container">
				{poll && !isHostDashboard && (
					<section className={`live-poll ${pollIsOpen ? "is-open" : "is-closed"}`}>
						<div className="live-poll-topline">
							<span className="live-poll-game">{gameLabels[poll.gameType]}</span>
							<span className="live-poll-timer">
								{pollIsOpen ? `${remainingSeconds}s` : "RESULTS"}
							</span>
						</div>
						<h2>{poll.prompt}</h2>
						<div className="live-poll-options">
							<button
								type="button"
								className={`poll-option ${poll.myVote === "a" ? "selected" : ""}`}
								onClick={() => vote("a")}
								disabled={!pollIsOpen || accessRole !== "user"}
							>
								<span>{poll.optionA}</span>
								<strong>{percentA}%</strong>
								<i style={{ width: `${percentA}%` }} />
							</button>
							<button
								type="button"
								className={`poll-option ${poll.myVote === "b" ? "selected" : ""}`}
								onClick={() => vote("b")}
								disabled={!pollIsOpen || accessRole !== "user"}
							>
								<span>{poll.optionB}</span>
								<strong>{percentB}%</strong>
								<i style={{ width: `${percentB}%` }} />
							</button>
						</div>
						<div className="live-poll-footer">
							<span>{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</span>
							{accessRole !== "user" && <span>Viewing results</span>}
							{accessRole === "user" && poll.myVote && <span>Your vote is locked in</span>}
						</div>
					</section>
				)}

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

				{isHostDashboard && (
					<aside className="host-control-panel">
						<section className="host-control-card">
							<div className="host-control-label">Tonight's Show</div>
							<h2>Kruze After Dark</h2>
							<p>Thursdays · 9:30 PM CT</p>
							<div className="host-control-status">
								<span className="host-control-status-dot" />
								Chat controls online
							</div>
						</section>

						<section className="host-control-card">
							<div className="host-control-label">Chat Snapshot</div>
							<div className="host-stats-grid">
								<div><strong>{messages.length}</strong><span>Messages</span></div>
								<div><strong>{peopleWhoChatted}</strong><span>People chatted</span></div>
								<div><strong>{bans.length}</strong><span>Banned</span></div>
							</div>
						</section>

						<section className="host-control-card">
							<div className="host-control-label">Quick Controls</div>
							<a
								className="host-dashboard-button primary"
								href="https://itskristykruze.com/live"
								target="_blank"
								rel="noreferrer"
							>
								Open Public Live Page
							</a>
							<button
								type="button"
								className="host-dashboard-button"
								onClick={() => setShowBans((current) => !current)}
							>
								{showBans ? "Hide Bans" : `Manage Bans${bans.length ? ` (${bans.length})` : ""}`}
							</button>
							<button
								type="button"
								className="host-dashboard-button danger"
								onClick={() => {
									if (!window.confirm("Clear every message from this live chat?")) return;
									socket.send(JSON.stringify({ type: "clear" } satisfies Message));
								}}
							>
								Clear Entire Chat
							</button>
						</section>

						{showBans && (
							<section className="host-control-card host-bans-card">
								<div className="host-control-label">Banned Viewers</div>
								{bans.length === 0 ? (
									<p className="host-control-muted">Nobody is currently banned.</p>
								) : (
									bans.map((entry) => (
										<div className="host-ban-row" key={entry.viewerId}>
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
							</section>
						)}

						<section className="host-control-card game-control-card">
							<div className="host-control-label">Game Control Center</div>
							<select
								className="game-select"
								value={gameType}
								onChange={(e) => setGameType(e.target.value as GameType)}
							>
								<option value="red-flag">Red Flag</option>
								<option value="would-you-rather">Would You Rather</option>
								<option value="truth-or-temptation">Truth or Temptation</option>
								<option value="kruze-court">Kruze Court</option>
								<option value="custom">Custom Poll</option>
							</select>
							<textarea
								className="game-input game-question"
								value={gamePrompt}
								onChange={(e) => setGamePrompt(e.target.value)}
								placeholder="Scenario or question..."
								maxLength={500}
							/>
							<div className="game-option-grid">
								<input
									className="game-input"
									value={gameOptionA}
									onChange={(e) => setGameOptionA(e.target.value)}
									placeholder="Option A"
									maxLength={120}
								/>
								<input
									className="game-input"
									value={gameOptionB}
									onChange={(e) => setGameOptionB(e.target.value)}
									placeholder="Option B"
									maxLength={120}
								/>
							</div>
							<div className="game-duration-row">
								<label htmlFor="game-duration">Voting time</label>
								<select
									id="game-duration"
									className="game-select compact"
									value={gameDuration}
									onChange={(e) => setGameDuration(Number(e.target.value))}
								>
									<option value={15}>15 sec</option>
									<option value={30}>30 sec</option>
									<option value={45}>45 sec</option>
									<option value={60}>60 sec</option>
									<option value={90}>90 sec</option>
								</select>
							</div>
							<button
								type="button"
								className="host-dashboard-button primary"
								onClick={startGamePoll}
							>
								Start Voting
							</button>

							{poll && (
								<div className="host-poll-results">
									<div className="host-poll-head">
										<strong>{gameLabels[poll.gameType]}</strong>
										<span>{pollIsOpen ? `${remainingSeconds}s` : "Closed"}</span>
									</div>
									<p>{poll.prompt}</p>
									<div className="host-result-row">
										<span>{poll.optionA}</span>
										<strong>{poll.votesA} · {percentA}%</strong>
									</div>
									<div className="host-result-row">
										<span>{poll.optionB}</span>
										<strong>{poll.votesB} · {percentB}%</strong>
									</div>
									<div className="host-poll-actions">
										<button
											type="button"
											className="host-dashboard-button"
											onClick={() => socket.send(JSON.stringify({ type: "poll_end" } satisfies Message))}
											disabled={!pollIsOpen}
										>
											End Voting
										</button>
										<button
											type="button"
											className="host-dashboard-button danger"
											onClick={() => socket.send(JSON.stringify({ type: "poll_clear" } satisfies Message))}
										>
											Next Round
										</button>
									</div>
								</div>
							)}
						</section>

						<section className="host-control-card">
							<div className="host-control-label">Show Flow</div>
							<ol className="host-show-flow">
								<li>STARTING SOON</li>
								<li>KRUZE AFTER DARK</li>
								<li>BE RIGHT BACK if needed</li>
								<li>THANKS FOR WATCHING</li>
							</ol>
						</section>
					</aside>
				)}

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
