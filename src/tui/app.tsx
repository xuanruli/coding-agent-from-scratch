import { Box, render, Static, Text, useApp } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderMarkdown } from "../markdown.js";

// ── Glyphs (clean Unicode, not emoji) ──────────────────────
const GLYPH = {
  agent: "◆",
  user: "❯",
  tool: "▸",
  panel: "◇",
  prompt: "❯",
} as const;

// ── Structured command output ──────────────────────────────
export interface PanelRow {
  /** Stable unique key for rendering. */
  id: string;
  icon?: string;
  iconColor?: string;
  label: string;
  labelColor?: string;
  value?: string;
}

export interface CommandPanel {
  title: string;
  accent: string;
  rows: PanelRow[];
  empty?: string;
}

export type CommandOutput = string | CommandPanel;

function isPanel(out: CommandOutput): out is CommandPanel {
  return typeof out === "object" && out !== null && "rows" in out;
}

export interface SlashCommand {
  name: string;
  description: string;
  execute: () => CommandOutput | undefined;
}

export interface TurnResult {
  text: string;
  toolCalls: { name: string }[];
}

export interface InkAppOptions {
  agentName: string;
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
  | { id: number; kind: "panel"; panel: CommandPanel }
  | { id: number; kind: "note"; text: string; tone: "info" | "error" };

// Distributes Omit across the union so each variant keeps its own fields.
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

// ── Presentational pieces ──────────────────────────────────
function Badge({
  label,
  color,
  icon,
}: {
  label: string;
  color: string;
  icon?: string;
}) {
  return (
    <Text backgroundColor={color} color="black" bold>
      {" "}
      {icon ? `${icon} ` : ""}
      {label}{" "}
    </Text>
  );
}

function Panel({ panel }: { panel: CommandPanel }) {
  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="round"
      borderColor={panel.accent}
      paddingX={1}
    >
      <Text color={panel.accent} bold>
        {GLYPH.panel} {panel.title}
      </Text>
      {panel.rows.length === 0 ? (
        <Text dimColor>{panel.empty ?? "(empty)"}</Text>
      ) : (
        panel.rows.map((row) => (
          <Box key={row.id}>
            {row.icon && (
              <Text color={row.iconColor ?? panel.accent}>{row.icon} </Text>
            )}
            <Text color={row.labelColor} bold={!!row.value}>
              {row.label}
            </Text>
            {row.value && <Text dimColor> {row.value}</Text>}
          </Box>
        ))
      )}
    </Box>
  );
}

function Banner({ opts }: { opts: InkAppOptions }) {
  let cwd = opts.cwd;
  if (cwd.length > 44) cwd = `…${cwd.slice(-43)}`;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Gradient name="pastel">
        <BigText text={opts.agentName} font="tiny" />
      </Gradient>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
      >
        <Text>
          <Text color="cyan" bold>
            {GLYPH.agent}{" "}
          </Text>
          <Text dimColor>model </Text>
          <Text color="magenta">{opts.model}</Text>
          <Text dimColor> · dir </Text>
          <Text color="magenta">{cwd}</Text>
        </Text>
        <Text dimColor>
          {"  "}
          <Text color="cyan">/help</Text> commands ·{" "}
          <Text color="cyan">/clear</Text> reset view ·{" "}
          <Text color="cyan">/exit</Text> quit
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
          <Badge label="you" color="cyan" icon={GLYPH.user} />
          <Text> {item.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Badge label={opts.agentName} color="magenta" icon={GLYPH.agent} />
          </Box>
          {item.tools.length > 0 && (
            <Box marginTop={1} marginLeft={1}>
              <Text color="yellow">
                {item.tools.map((t) => `${GLYPH.tool} ${t}`).join("\n")}
              </Text>
            </Box>
          )}
          <Box
            borderStyle="single"
            borderColor="magenta"
            borderTop={false}
            borderRight={false}
            borderBottom={false}
            paddingLeft={1}
            marginTop={1}
          >
            <Text>{renderMarkdown(item.text)}</Text>
          </Box>
        </Box>
      );
    case "panel":
      return <Panel panel={item.panel} />;
    case "note":
      return (
        <Box
          marginBottom={1}
          borderStyle="round"
          borderColor={item.tone === "error" ? "red" : "gray"}
          paddingX={1}
        >
          <Text color={item.tone === "error" ? "red" : undefined}>
            {item.text}
          </Text>
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
  const [elapsed, setElapsed] = useState(0);
  const nextId = useRef(1);

  // Tick a seconds counter while a turn is running (live spinner feedback).
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

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
        if (out !== undefined) {
          if (isPanel(out)) {
            push({ kind: "panel", panel: out });
          } else {
            push({ kind: "note", text: out, tone: "info" });
          }
        }
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
        push({
          kind: "note",
          text: `Error: ${(err as Error).message}`,
          tone: "error",
        });
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
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text bold> {activity}</Text>
          <Text dimColor> · {elapsed}s</Text>
        </Box>
      ) : (
        <Box borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text color="cyanBright" bold>
            {GLYPH.prompt}{" "}
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
