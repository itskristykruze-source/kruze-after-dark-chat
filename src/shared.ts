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
			authToken?: string;
	  }
	| {
			type: "update";
			id: string;
			content: string;
			user: string;
			role: ChatRole;
			authToken?: string;
	  }
	| {
			type: "delete";
			id: string;
			authToken?: string;
	  }
	| {
			type: "clear";
			authToken?: string;
	  }
	| {
			type: "all";
			messages: ChatMessage[];
	  };
