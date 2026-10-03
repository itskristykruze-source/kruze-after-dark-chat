import "dotenv/config";
import OBSWebSocket from "obs-websocket-js";
import WebSocket from "ws";

const HOST_TOKEN = process.env.HOST_TOKEN?.trim();
const CHAT_ROOM = process.env.CHAT_ROOM?.trim() || "w2oNVkPpamyb3yEEayvlS";
const CHAT_HOST =
  process.env.CHAT_HOST?.trim() ||
  "kruze-after-dark-chat.itskristykruze.workers.dev";
const OBS_URL = process.env.OBS_URL?.trim() || "ws://127.0.0.1:4455";
const OBS_PASSWORD = process.env.OBS_PASSWORD || "";

if (!HOST_TOKEN) {
  console.error("Missing HOST_TOKEN in .env");
  process.exit(1);
}

const obs = new OBSWebSocket();
let workerSocket = null;
let obsConnected = false;
let reconnectTimer = null;

function workerUrl() {
  const query = new URLSearchParams({
    host: HOST_TOKEN,
    bridge: "obs",
    viewer: "obs-bridge",
  });
  return `wss://${CHAT_HOST}/parties/chat/${encodeURIComponent(CHAT_ROOM)}?${query.toString()}`;
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectWorker, 3000);
}

async function connectObs() {
  try {
    await obs.connect(OBS_URL, OBS_PASSWORD || undefined);
    obsConnected = true;
    console.log("OBS connected");
    await sendState();
  } catch (error) {
    obsConnected = false;
    console.error("OBS connection failed:", error?.message || error);
  }
}

async function readObsState() {
  if (!obsConnected) {
    return { connected: false, updatedAt: Date.now() };
  }

  try {
    const [scene, stream, sceneList] = await Promise.all([
      obs.call("GetCurrentProgramScene"),
      obs.call("GetStreamStatus"),
      obs.call("GetSceneList"),
    ]);

    return {
      connected: true,
      currentScene: scene.currentProgramSceneName,
      streaming: Boolean(stream.outputActive),
      scenes: (sceneList.scenes || [])
        .map((item) => item.sceneName)
        .filter(Boolean),
      updatedAt: Date.now(),
    };
  } catch (error) {
    obsConnected = false;
    console.error("Could not read OBS state:", error?.message || error);
    return { connected: false, updatedAt: Date.now() };
  }
}

async function sendState() {
  if (!workerSocket || workerSocket.readyState !== WebSocket.OPEN) return;
  workerSocket.send(
    JSON.stringify({
      type: "obs_state",
      state: await readObsState(),
    }),
  );
}

async function runCommand(command) {
  if (!obsConnected) {
    await connectObs();
  }
  if (!obsConnected) {
    await sendState();
    return;
  }

  try {
    if (command.action === "set_scene") {
      await obs.call("SetCurrentProgramScene", {
        sceneName: command.scene,
      });
    } else if (command.action === "start_stream") {
      const status = await obs.call("GetStreamStatus");
      if (!status.outputActive) await obs.call("StartStream");
    } else if (command.action === "stop_stream") {
      const status = await obs.call("GetStreamStatus");
      if (status.outputActive) await obs.call("StopStream");
    }

    await sendState();
  } catch (error) {
    console.error("OBS command failed:", error?.message || error);
    await sendState();
  }
}

function connectWorker() {
  clearTimeout(reconnectTimer);
  console.log("Connecting to Kruze producer relay…");

  workerSocket = new WebSocket(workerUrl());

  workerSocket.on("open", async () => {
    console.log("Producer relay connected");
    if (!obsConnected) await connectObs();
    await sendState();
  });

  workerSocket.on("message", async (raw) => {
    try {
      const message = JSON.parse(String(raw));
      if (message.type === "obs_ping") {
        await sendState();
        return;
      }
      if (message.type === "obs_command") {
        if (message.command?.action === "refresh") {
          await sendState();
          return;
        }
        await runCommand(message.command || {});
      }
    } catch (error) {
      console.error("Relay message error:", error?.message || error);
    }
  });

  workerSocket.on("close", () => {
    console.log("Producer relay disconnected; retrying…");
    scheduleReconnect();
  });

  workerSocket.on("error", (error) => {
    console.error("Producer relay error:", error?.message || error);
  });
}

obs.on("CurrentProgramSceneChanged", () => void sendState());
obs.on("StreamStateChanged", () => void sendState());
obs.on("ConnectionClosed", () => {
  obsConnected = false;
  void sendState();
});

process.on("SIGINT", async () => {
  try {
    workerSocket?.close();
    await obs.disconnect();
  } finally {
    process.exit(0);
  }
});

await connectObs();
connectWorker();
