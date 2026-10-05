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
	type ObsRemoteCommand,
	type ObsRemoteState,
	type PollChoice,
	type PollState,
	type RundownItem,
	type RundownState,
} from "../shared";

const CHAT_NAME_KEY = "kkChatName";
const VIEWER_ID_KEY = "kkViewerId";
const CONTROL_ROOM_ID = "w2oNVkPpamyb3yEEayvlS";

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

type GamePreset = {
	gameType: Exclude<GameType, "custom">;
	label: string;
	prompt: string;
	optionA: string;
	optionB: string;
};

const GAME_PRESETS: GamePreset[] = [
	{
		gameType: "red-flag",
		label: "Phone Face Down",
		prompt: "They always keep their phone face down around you. Red flag or no big deal?",
		optionA: "RED FLAG",
		optionB: "NO BIG DEAL",
	},
	{
		gameType: "red-flag",
		label: "Still Texting the Ex",
		prompt: "They still text their ex every week but say they are just friends. Red flag or acceptable?",
		optionA: "RED FLAG",
		optionB: "ACCEPTABLE",
	},
	{
		gameType: "red-flag",
		label: "Never Posts You",
		prompt: "You have been dating for months and they never acknowledge you online. Red flag or private relationship?",
		optionA: "RED FLAG",
		optionB: "JUST PRIVATE",
	},
	{
		gameType: "red-flag",
		label: "Flirty Friend",
		prompt: "Their closest friend openly flirts with them and they laugh it off. Red flag or harmless?",
		optionA: "RED FLAG",
		optionB: "HARMLESS",
	},
	{
		gameType: "would-you-rather",
		label: "Date Night",
		prompt: "Would you rather have a private date night together or a big VIP night out?",
		optionA: "PRIVATE DATE",
		optionB: "VIP NIGHT OUT",
	},
	{
		gameType: "would-you-rather",
		label: "Chemistry vs Stability",
		prompt: "Would you rather choose intense chemistry or rock-solid stability?",
		optionA: "CHEMISTRY",
		optionB: "STABILITY",
	},
	{
		gameType: "would-you-rather",
		label: "First Move",
		prompt: "Would you rather make the first move or have them make it?",
		optionA: "MAKE THE MOVE",
		optionB: "LET THEM LEAD",
	},
	{
		gameType: "would-you-rather",
		label: "Mystery vs Honesty",
		prompt: "Would you rather date someone mysterious or someone who tells you everything?",
		optionA: "MYSTERIOUS",
		optionB: "OPEN BOOK",
	},
	{
		gameType: "truth-or-temptation",
		label: "First Impression",
		prompt: "Your crush asks what first caught your attention. Do you tell the truth or keep it mysterious?",
		optionA: "TELL THE TRUTH",
		optionB: "KEEP IT MYSTERIOUS",
	},
	{
		gameType: "truth-or-temptation",
		label: "Secret Crush",
		prompt: "Someone asks if you have ever had a crush on a friend. Answer honestly or dodge the question?",
		optionA: "ANSWER",
		optionB: "DODGE IT",
	},
	{
		gameType: "truth-or-temptation",
		label: "Bold Compliment",
		prompt: "Do you give the person you like a bold compliment or make them guess how you feel?",
		optionA: "SAY IT",
		optionB: "MAKE THEM GUESS",
	},
	{
		gameType: "truth-or-temptation",
		label: "Text Them Now",
		prompt: "You are thinking about someone right now. Send the text tonight or leave it alone?",
		optionA: "SEND IT",
		optionB: "LEAVE IT ALONE",
	},
	{
		gameType: "kruze-court",
		label: "Thirst Trap Likes",
		prompt: "They constantly like attractive people's thirst-trap posts but call it harmless. Guilty or not guilty?",
		optionA: "GUILTY",
		optionB: "NOT GUILTY",
	},
	{
		gameType: "kruze-court",
		label: "Late-Night Reply",
		prompt: "They reply to an ex after midnight and do not mention it. Guilty or not guilty?",
		optionA: "GUILTY",
		optionB: "NOT GUILTY",
	},
	{
		gameType: "kruze-court",
		label: "Location Off",
		prompt: "They suddenly turn off location sharing during a night out. Guilty or not guilty?",
		optionA: "GUILTY",
		optionB: "NOT GUILTY",
	},
	{
		gameType: "kruze-court",
		label: "Deleted Messages",
		prompt: "They delete a conversation because they know you would not like it. Guilty or not guilty?",
		optionA: "GUILTY",
		optionB: "NOT GUILTY",
	},
];

function makeDefaultRundown(): RundownItem[] {
	return [
		{ id: "scene-starting-soon", label: "STARTING SOON", kind: "scene" },
		{ id: "scene-opening", label: "KRUZE AFTER DARK — OPENING", kind: "scene" },
		{
			id: "game-red-flag",
			label: "RED FLAG — Phone Face Down",
			kind: "game",
			gameType: "red-flag",
			presetLabel: "Phone Face Down",
		},
		{
			id: "game-wyr",
			label: "WOULD YOU RATHER — Date Night",
			kind: "game",
			gameType: "would-you-rather",
			presetLabel: "Date Night",
		},
		{ id: "break-chat", label: "CHAT BREAK", kind: "break" },
		{
			id: "game-court",
			label: "KRUZE COURT — Thirst Trap Likes",
			kind: "game",
			gameType: "kruze-court",
			presetLabel: "Thirst Trap Likes",
		},
		{
			id: "game-truth",
			label: "TRUTH OR TEMPTATION — First Impression",
			kind: "game",
			gameType: "truth-or-temptation",
			presetLabel: "First Impression",
		},
		{ id: "scene-closing", label: "THANKS FOR WATCHING", kind: "scene" },
	];
}

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

function ControlLogin() {
	const [passcode, setPasscode] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let active = true;
		fetch(`/parties/chat/${CONTROL_ROOM_ID}/control-session`, {
			credentials: "same-origin",
		})
			.then((response) => response.json() as Promise<{ ok?: boolean }>)
			.then((data) => {
				if (active && data.ok) window.location.replace("/control/dashboard");
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!passcode.trim() || busy) return;
		setBusy(true);
		setError("");

		try {
			const response = await fetch(
				`/parties/chat/${CONTROL_ROOM_ID}/control-login`,
				{
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ passcode }),
				},
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error || "Could not unlock the control room.");
				return;
			}
			window.location.assign("/control/dashboard");
		} catch {
			setError("Could not reach the control room. Try again.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="chat-app">
			<div className="name-gate" role="dialog" aria-modal="true">
				<form className="name-card" onSubmit={submit}>
					<div className="name-kicker">Private Host Control Room</div>
					<h2>Kristy Kruze Control</h2>
					<p>Enter the private control passcode to open the producer dashboard.</p>
					<input
						autoFocus
						type="password"
						value={passcode}
						onChange={(e) => {
							setPasscode(e.target.value);
							setError("");
						}}
						placeholder="Control passcode"
						autoComplete="current-password"
					/>
					{error && <div className="name-error">{error}</div>}
					<button type="submit" className="name-join-button" disabled={busy}>
						{busy ? "Unlocking..." : "Open Control Room"}
					</button>
					<div className="name-note">
						This device stays signed in for 7 days.
					</div>
				</form>
			</div>
		</div>
	);
}

function App({
	roomOverride,
	requireHost = false,
}: {
	roomOverride?: string;
	requireHost?: boolean;
}) {
	const { room: routeRoom } = useParams();
	const room = roomOverride || routeRoom || CONTROL_ROOM_ID;
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
	const [lastPresetLabel, setLastPresetLabel] = useState("");
	const [obsState, setObsState] = useState<ObsRemoteState | null>(null);
	const [obsNow, setObsNow] = useState(() => Date.now());
	const [rundown, setRundown] = useState<RundownState>({
		items: [],
		activeIndex: -1,
	});
	const [newSegmentLabel, setNewSegmentLabel] = useState("");
	const lastAppliedRundownId = useRef("");
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
				if (message.role === "host") {
					setName("Kristy Kruze");
					setNameDraft("Kristy Kruze");
				} else if (message.role === "mod") {
					setName("Moderator");
					setNameDraft("Moderator");
				}
				if (requireHost && message.role !== "host") {
					window.location.replace("/control");
					return;
				}
				if (message.bans) setBans(message.bans);
				if (message.poll !== undefined) setPoll(message.poll);
				if (message.rundown) {
					setRundown(message.rundown);
					applyRundownSelection(message.rundown);
				}

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

			if (message.type === "rundown_state") {
				setRundown(message.rundown);
				applyRundownSelection(message.rundown);
				return;
			}

			if (message.type === "obs_state") {
				setObsState(message.state);
				setObsNow(Date.now());
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

	useEffect(() => {
		if (!isHostDashboard) return;
		const refresh = () => {
			setObsNow(Date.now());
			socket.send(JSON.stringify({ type: "obs_ping" } satisfies Message));
		};
		refresh();
		const timer = window.setInterval(refresh, 10000);
		return () => window.clearInterval(timer);
	}, [isHostDashboard, socket]);

	const obsBridgeOnline = Boolean(
		obsState?.connected && obsNow - obsState.updatedAt < 25000,
	);

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

	const matchingPresets = GAME_PRESETS.filter(
		(preset) => preset.gameType === gameType,
	);

	function loadPreset(preset: GamePreset) {
		setGameType(preset.gameType);
		setGamePrompt(preset.prompt);
		setGameOptionA(preset.optionA);
		setGameOptionB(preset.optionB);
		setLastPresetLabel(preset.label);
	}

	function loadRandomPreset() {
		const pool = gameType === "custom" ? GAME_PRESETS : matchingPresets;
		if (!pool.length) return;
		const choices = pool.filter(
			(preset) => pool.length === 1 || preset.label !== lastPresetLabel,
		);
		loadPreset(choices[Math.floor(Math.random() * choices.length)]);
	}

	function loadNextPreset() {
		const pool = gameType === "custom" ? GAME_PRESETS : matchingPresets;
		if (!pool.length) return;

		const currentIndex = pool.findIndex(
			(preset) => preset.label === lastPresetLabel,
		);
		const nextPreset =
			currentIndex >= 0 ? pool[(currentIndex + 1) % pool.length] : pool[0];
		loadPreset(nextPreset);
	}

	function prepareNextRound() {
		socket.send(JSON.stringify({ type: "poll_clear" } satisfies Message));
		loadNextPreset();
	}

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

	const hasLoadedRound = Boolean(
		gamePrompt.trim() && gameOptionA.trim() && gameOptionB.trim(),
	);
	const runnerStage = poll
		? pollIsOpen
			? "voting"
			: "results"
		: hasLoadedRound
			? "ready"
			: "empty";

	const runnerActionLabel =
		runnerStage === "empty"
			? "Load Round"
			: runnerStage === "ready"
				? "Start Voting"
				: runnerStage === "voting"
					? "Reveal Results"
					: "Next Round";

	const runnerStatusLabel =
		runnerStage === "empty"
			? "Waiting for a round"
			: runnerStage === "ready"
				? "Round loaded"
				: runnerStage === "voting"
					? `Voting live · ${remainingSeconds}s`
					: "Results revealed";

	function advanceShowRunner() {
		if (runnerStage === "empty") {
			loadNextPreset();
			return;
		}
		if (runnerStage === "ready") {
			startGamePoll();
			return;
		}
		if (runnerStage === "voting") {
			socket.send(JSON.stringify({ type: "poll_end" } satisfies Message));
			return;
		}
		prepareNextRound();
	}

	function sendObsCommand(command: ObsRemoteCommand) {
		if (!obsBridgeOnline) return;
		socket.send(
			JSON.stringify({
				type: "obs_command",
				command,
			} satisfies Message),
		);
	}

	function sceneForRundownItem(item?: RundownItem) {
		if (!item || item.kind !== "scene") return "";
		const label = item.label.toUpperCase();
		if (label.includes("STARTING SOON")) return "STARTING SOON";
		if (label.includes("THANKS FOR WATCHING")) return "THANKS FOR WATCHING";
		if (label.includes("KRUZE AFTER DARK")) return "KRUZE AFTER DARK";
		if (label.includes("BE RIGHT BACK")) return "BE RIGHT BACK";
		return item.label;
	}

	function applyRundownSelection(next: RundownState) {
		const item = next.items[next.activeIndex];
		if (!item || lastAppliedRundownId.current === item.id) return;
		lastAppliedRundownId.current = item.id;

		if (item.kind === "game" && item.gameType) {
			const preset =
				GAME_PRESETS.find(
					(candidate) =>
						candidate.gameType === item.gameType &&
						(!item.presetLabel || candidate.label === item.presetLabel),
				) ||
				GAME_PRESETS.find((candidate) => candidate.gameType === item.gameType);
			if (preset) loadPreset(preset);
		}

		const scene = sceneForRundownItem(item);
		if (scene && obsBridgeOnline) {
			sendObsCommand({ action: "set_scene", scene });
		}
	}

	function sendRundownState(next: RundownState) {
		socket.send(
			JSON.stringify({
				type: "rundown_set",
				rundown: next,
			} satisfies Message),
		);
	}

	function loadShowTemplate() {
		lastAppliedRundownId.current = "";
		sendRundownState({ items: makeDefaultRundown(), activeIndex: -1 });
	}

	function goToRundownIndex(index: number) {
		lastAppliedRundownId.current = "";
		socket.send(
			JSON.stringify({
				type: "rundown_jump",
				index,
			} satisfies Message),
		);
	}

	function advanceRundown() {
		lastAppliedRundownId.current = "";
		socket.send(JSON.stringify({ type: "rundown_advance" } satisfies Message));
	}

	function moveRundownItem(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= rundown.items.length) return;

		const activeId = rundown.items[rundown.activeIndex]?.id;
		const items = [...rundown.items];
		[items[index], items[target]] = [items[target], items[index]];
		const activeIndex = activeId
			? items.findIndex((item) => item.id === activeId)
			: -1;
		sendRundownState({ items, activeIndex });
	}

	function removeRundownItem(index: number) {
		const removed = rundown.items[index];
		const activeId = rundown.items[rundown.activeIndex]?.id;
		const items = rundown.items.filter((_, itemIndex) => itemIndex !== index);
		const activeIndex =
			activeId && activeId !== removed?.id
				? items.findIndex((item) => item.id === activeId)
				: -1;
		sendRundownState({ items, activeIndex });
	}

	function addCustomSegment() {
		const label = newSegmentLabel.trim();
		if (!label) return;
		const items = [
			...rundown.items,
			{
				id: `custom-${nanoid(8)}`,
				label: label.slice(0, 80),
				kind: "custom" as const,
			},
		];
		sendRundownState({ items, activeIndex: rundown.activeIndex });
		setNewSegmentLabel("");
	}

	const activeRundownItem = rundown.items[rundown.activeIndex];
	const upNextRundownItem =
		rundown.activeIndex >= -1
			? rundown.items[rundown.activeIndex + 1]
			: undefined;

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
								<strong>
									{pollIsOpen
										? poll.myVote === "a"
											? "✓"
											: "VOTE"
										: `${percentA}%`}
								</strong>
								<i style={{ width: pollIsOpen ? "0%" : `${percentA}%` }} />
							</button>
							<button
								type="button"
								className={`poll-option ${poll.myVote === "b" ? "selected" : ""}`}
								onClick={() => vote("b")}
								disabled={!pollIsOpen || accessRole !== "user"}
							>
								<span>{poll.optionB}</span>
								<strong>
									{pollIsOpen
										? poll.myVote === "b"
											? "✓"
											: "VOTE"
										: `${percentB}%`}
								</strong>
								<i style={{ width: pollIsOpen ? "0%" : `${percentB}%` }} />
							</button>
						</div>
						<div className="live-poll-footer">
							<span>
								{pollIsOpen
									? "Voting is live"
									: `${totalVotes} ${totalVotes === 1 ? "vote" : "votes"}`}
							</span>
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

						<section className="host-control-card remote-producer-card">
							<div className="host-control-label">Remote Producer</div>
							<div className="remote-producer-head">
								<div>
									<h2>Producer Control</h2>
									<p>Control the room computer's OBS from this private dashboard.</p>
								</div>
								<span className={`remote-producer-pill ${obsBridgeOnline ? "is-online" : "is-offline"}`}>
									{obsBridgeOnline ? "OBS ONLINE" : "OBS OFFLINE"}
								</span>
							</div>

							<div className="obs-remote-status">
								<span>Current scene</span>
								<strong>{obsBridgeOnline ? obsState?.currentScene || "Connected" : "Bridge not connected"}</strong>
							</div>
							<div className="obs-remote-status">
								<span>Stream</span>
								<strong>{obsBridgeOnline ? (obsState?.streaming ? "LIVE" : "OFF AIR") : "—"}</strong>
							</div>

							<div className="obs-scene-grid">
								{["STARTING SOON", "KRUZE AFTER DARK", "BE RIGHT BACK", "THANKS FOR WATCHING"].map((scene) => (
									<button
										type="button"
										key={scene}
										disabled={!obsBridgeOnline}
										className={obsState?.currentScene === scene ? "is-active" : ""}
										onClick={() => sendObsCommand({ action: "set_scene", scene })}
									>
										{scene}
									</button>
								))}
							</div>

							<div className="obs-stream-actions">
								<button
									type="button"
									disabled={!obsBridgeOnline || Boolean(obsState?.streaming)}
									onClick={() => sendObsCommand({ action: "start_stream" })}
								>
									START STREAM
								</button>
								<button
									type="button"
									className="danger"
									disabled={!obsBridgeOnline || !obsState?.streaming}
									onClick={() => {
										if (window.confirm("Stop the OBS stream now?")) {
											sendObsCommand({ action: "stop_stream" });
										}
									}}
								>
									STOP STREAM
								</button>
							</div>
							<button
								type="button"
								className="host-dashboard-button"
								onClick={() => socket.send(JSON.stringify({ type: "obs_ping" } satisfies Message))}
							>
								Refresh OBS Status
							</button>

							{!obsBridgeOnline && (
								<p className="host-control-muted">Run the OBS Bridge on the room computer to activate these controls.</p>
							)}
						</section>

						<section className="host-control-card rundown-card">
							<div className="host-control-label">Show Rundown / Queue</div>
							<div className="rundown-now-grid">
								<div>
									<span>LIVE NOW</span>
									<strong>{activeRundownItem?.label || "Not started"}</strong>
								</div>
								<div>
									<span>UP NEXT</span>
									<strong>{upNextRundownItem?.label || "—"}</strong>
								</div>
							</div>

							<button
								type="button"
								className="rundown-next-button"
								onClick={advanceRundown}
								disabled={!rundown.items.length || rundown.activeIndex >= rundown.items.length - 1}
							>
								{rundown.activeIndex < 0 ? "START SHOW" : "NEXT SEGMENT"}
							</button>

							<div className="rundown-actions">
								<button type="button" onClick={loadShowTemplate}>Load Show Template</button>
								<button
									type="button"
									onClick={() => {
									if (rundown.activeIndex >= 0) goToRundownIndex(rundown.activeIndex);
								}}
									disabled={rundown.activeIndex < 0}
								>
									Repeat Current
								</button>
							</div>

							{rundown.items.length === 0 ? (
								<div className="rundown-empty">
									Load the show template, then rearrange it before going live.
								</div>
							) : (
								<div className="rundown-list">
									{rundown.items.map((item, index) => (
										<div
											className={`rundown-row ${index === rundown.activeIndex ? "is-live" : ""}`}
											key={item.id}
										>
											<div className="rundown-row-index">{index + 1}</div>
											<div className="rundown-row-copy">
												<strong>{item.label}</strong>
												<span>{item.kind}{index === rundown.activeIndex ? " · LIVE" : ""}</span>
											</div>
											<div className="rundown-row-buttons">
												<button type="button" onClick={() => moveRundownItem(index, -1)} disabled={index === 0}>↑</button>
												<button type="button" onClick={() => moveRundownItem(index, 1)} disabled={index === rundown.items.length - 1}>↓</button>
												<button type="button" onClick={() => goToRundownIndex(index)}>Go</button>
												<button type="button" className="remove" onClick={() => removeRundownItem(index)}>×</button>
											</div>
										</div>
									))}
								</div>
							)}

							<div className="rundown-add-row">
								<input
									value={newSegmentLabel}
									onChange={(event) => setNewSegmentLabel(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											addCustomSegment();
										}
									}}
									placeholder="Add custom segment..."
									maxLength={80}
								/>
								<button type="button" onClick={addCustomSegment}>Add</button>
							</div>
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

							<div className={`show-runner show-runner-${runnerStage}`}>
								<div className="show-runner-copy">
									<span>One-Click Show Runner</span>
									<strong>{runnerStatusLabel}</strong>
								</div>
								<button
									type="button"
									className="show-runner-action"
									onClick={advanceShowRunner}
								>
									{runnerActionLabel}
								</button>
							</div>

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

							<div className="preset-library">
								<div className="preset-library-head">
									<span>Preset Round Library</span>
									<button type="button" onClick={loadRandomPreset}>
										Surprise Me
									</button>
								</div>

								{gameType === "custom" ? (
									<div className="preset-library-empty">
										Custom mode uses your own question and choices. Surprise Me can load any preset.
									</div>
								) : (
									<div className="preset-grid">
										{matchingPresets.map((preset) => (
											<button
												type="button"
												className="preset-chip"
												key={preset.label}
												onClick={() => loadPreset(preset)}
											>
												{preset.label}
											</button>
										))}
									</div>
								)}
							</div>

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
											Reveal Results
										</button>
										<button
											type="button"
											className="host-dashboard-button danger"
											onClick={prepareNextRound}
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
			<Route path="/control" element={<ControlLogin />} />
			<Route
				path="/control/dashboard"
				element={<App roomOverride={CONTROL_ROOM_ID} requireHost />}
			/>
			<Route path="/:room" element={<App />} />
			<Route path="*" element={<Navigate to="/" />} />
		</Routes>
	</BrowserRouter>,
);
