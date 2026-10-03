export type ChatRole = "user" | "host" | "mod";

export type ChatMessage = {
	id: string;
	content: string;
	user: string;
	role: ChatRole;
	viewerId?: string;
};

export type BanEntry = {
	viewerId: string;
	user: string;
};

export type GameType =
	| "red-flag"
	| "would-you-rather"
	| "truth-or-temptation"
	| "kruze-court"
	| "custom";

export type PollChoice = "a" | "b";
export type PollStatus = "open" | "closed";

export type PollState = {
	id: string;
	gameType: GameType;
	prompt: string;
	optionA: string;
	optionB: string;
	status: PollStatus;
	endsAt: number;
	votesA: number;
	votesB: number;
	myVote?: PollChoice;
};

export type RundownKind = "scene" | "game" | "break" | "custom";

export type RundownItem = {
	id: string;
	label: string;
	kind: RundownKind;
	gameType?: GameType;
	presetLabel?: string;
};

export type RundownState = {
	items: RundownItem[];
	activeIndex: number;
};

export type Message =
	| {
			type: "add";
			id: string;
			content: string;
			user: string;
			role: ChatRole;
			viewerId?: string;
	  }
	| {
			type: "update";
			id: string;
			content: string;
			user: string;
			role: ChatRole;
			viewerId?: string;
	  }
	| {
			type: "delete";
			id: string;
	  }
	| {
			type: "clear";
	  }
	| {
			type: "kick";
			viewerId: string;
	  }
	| {
			type: "ban";
			viewerId: string;
	  }
	| {
			type: "unban";
			viewerId: string;
	  }
	| {
			type: "auth";
			role: ChatRole;
			bans?: BanEntry[];
			poll?: PollState | null;
			rundown?: RundownState;
	  }
	| {
			type: "bans";
			bans: BanEntry[];
	  }
	| {
			type: "moderation";
			action: "kicked" | "banned";
	  }
	| {
			type: "all";
			messages: ChatMessage[];
	  }
	| {
			type: "rundown_set";
			rundown: RundownState;
	  }
	| {
			type: "rundown_advance";
	  }
	| {
			type: "rundown_jump";
			index: number;
	  }
	| {
			type: "rundown_state";
			rundown: RundownState;
	  }
	| {
			type: "poll_start";
			poll: Omit<PollState, "votesA" | "votesB" | "myVote">;
	  }
	| {
			type: "poll_vote";
			pollId: string;
			choice: PollChoice;
	  }
	| {
			type: "poll_end";
	  }
	| {
			type: "poll_clear";
	  }
	| {
			type: "poll_state";
			poll: PollState | null;
	  };
