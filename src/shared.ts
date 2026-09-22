export type ChatRole = "user" | "host";

export type ChatMessage = {
	id: string;
	content: string;
	user: string;
	role: ChatRole;
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
			type: "all";
			messages: ChatMessage[];
	  };
