import { Box, render, Static, Text, useApp } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useCallback, useRef, useState } from "react";
import { renderMarkdown } from "../markdown.js";

export interface SlashCommand {
  name: string;
  description: string;
  execute: () => string | undefined;
}

export interface TurnResult {
  text: string;
  toolCalls: { name: string }[];
}

export interface InkAppOptions {
  agentName: string;
  agentIcon: string;
  model: string;
  cwd: string;
  exitKeywords: string[];
  commands: SlashCommand[];
  /** Run one agent turn. `onActivity` updates the live spinner label. */
  submit: (
    input: string,
    hooks: { onActivity: (msg: string) => void }
  ) => Promise<TurnResult>;
}

type HistoryItem =
  | { id: number; kind: "banner" }
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string; tools: string[] }
  | { id: number; kind: "system"; text: string };

// Distributes Omit across the union so each variant keeps its own fields.
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

function Banner({ opts }: { opts: InkAppOptions }) {
  let cwd = opts.cwd;
  if (cwd.length > 48) cwd = `…${cwd.slice(-47)}`;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Gradient name="pastel">
        <BigText text={opts.agentName} font="tiny" />
      </Gradient>
      <Box flexDirection="column" marginLeft={1}>
        <Text>
          <Text dimColor>model </Text>
          <Text color="magenta">{opts.model}</Text>
          <Text dimColor> · dir </Text>
          <Text color="magenta">{cwd}</Text>
        </Text>
        <Text dimColor>
          Type <Text color="cyan">/help</Text> for commands ·{" "}
          <Text color="cyan">/exit</Text> to quit
        </Text>
      </Box>
    </Box>
  );
}

function HistoryRow({
  item,
  opts,
}: {
  item: HistoryItem;
  opts: InkAppOptions;
}) {
  switch (item.kind) {
    case "banner":
      return <Banner opts={opts} />;
    case "user":
      return (
        <Box marginBottom={1}>
          <Text color="cyanBright" bold>
            ›{" "}
          </Text>
          <Text>{item.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magentaBright" bold>
            {opts.agentIcon} {opts.agentName}
          </Text>
          {item.tools.length > 0 && (
            <Text dimColor>{item.tools.map((t) => `🔧 ${t}`).join("  ")}</Text>
          )}
          <Text>{renderMarkdown(item.text)}</Text>
        </Box>
      );
    case "system":
      return (
        <Box
          marginBottom={1}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          <Text>{item.text}</Text>
        </Box>
      );
  }
}

export function App({ opts }: { opts: InkAppOptions }) {
  const { exit } = useApp();
  const [history, setHistory] = useState<HistoryItem[]>([
    { id: 0, kind: "banner" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState("Thinking…");
  const nextId = useRef(1);

  const push = useCallback((item: WithoutId<HistoryItem>) => {
    setHistory((h) => [...h, { ...item, id: nextId.current++ } as HistoryItem]);
  }, []);

  const handleSubmit = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || busy) return;
      setInput("");

      const cmdName = value.split(/\s+/)[0].toLowerCase();

      if (opts.exitKeywords.includes(cmdName)) {
        exit();
        return;
      }

      push({ kind: "user", text: value });

      const cmd = opts.commands.find((c) => c.name === cmdName);
      if (cmd) {
        if (cmd.name === "/clear") {
          setHistory([{ id: nextId.current++, kind: "banner" }]);
          return;
        }
        const out = cmd.execute();
        if (out) push({ kind: "system", text: out });
        return;
      }

      setBusy(true);
      setActivity("Thinking…");
      try {
        const result = await opts.submit(value, {
          onActivity: (msg) => setActivity(msg),
        });
        push({
          kind: "assistant",
          text: result.text,
          tools: result.toolCalls.map((t) => t.name),
        });
      } catch (err) {
        push({ kind: "system", text: `Error: ${(err as Error).message}` });
      } finally {
        setBusy(false);
      }
    },
    [busy, exit, opts, push]
  );

  return (
    <Box flexDirection="column">
      <Static items={history}>
        {(item) => <HistoryRow key={item.id} item={item} opts={opts} />}
      </Static>

      {busy ? (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {activity}</Text>
        </Box>
      ) : (
        <Box>
          <Text color="cyanBright" bold>
            {opts.agentIcon} ›{" "}
          </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Ask me to read, edit, or run something…"
          />
        </Box>
      )}
    </Box>
  );
}

/** Render the Ink application and resolve when the user exits. */
export async function runInkApp(opts: InkAppOptions): Promise<void> {
  const { waitUntilExit } = render(<App opts={opts} />);
  await waitUntilExit();
}
