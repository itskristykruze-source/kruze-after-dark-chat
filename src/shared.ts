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

export type Message =
	| {
			type: "add";
			id: string;
			content: string;
			user: string;
			role: ChatRole;
	  }
	| {
			type: "update";
			id: string;
			content: string;
			user: string;
			role: ChatRole;
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
	  };
