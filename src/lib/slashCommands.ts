/** @doc Slash command registry for the chat composer. */
import type { NavigateFunction } from "react-router-dom";

export interface SlashCommand {
  /** Command word without the leading slash. */
  name: string;
  /** Short human description shown in help / hint. */
  description: string;
  /** Execute the command. Return true if handled (message should NOT be sent). */
  run: (ctx: SlashRunContext) => boolean | void;
}

export interface SlashRunContext {
  navigate: NavigateFunction;
  clearInput: () => void;
  raw: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "clear",
    description: "Clear the current draft input",
    run: ({ clearInput }) => {
      clearInput();
      return true;
    },
  },
  {
    name: "new",
    description: "Start a new chat",
    run: ({ navigate, clearInput }) => {
      clearInput();
      navigate("/chat");
      return true;
    },
  },
  {
    name: "docs",
    description: "Open the documentation page",
    run: ({ navigate }) => {
      navigate("/docs");
      return true;
    },
  },
  {
    name: "settings",
    description: "Open settings",
    run: ({ navigate }) => {
      navigate("/settings");
      return true;
    },
  },
  {
    name: "memory",
    description: "Manage saved memory",
    run: ({ navigate }) => {
      navigate("/settings/memory");
      return true;
    },
  },
  {
    name: "help",
    description: "Show help & shortcuts",
    run: ({ navigate }) => {
      navigate("/docs");
      return true;
    },
  },
];

/** Parse a composer draft and return a matching command if the text is a bare `/word`. */
export const parseSlashCommand = (text: string): SlashCommand | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const first = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase();
  if (!first) return null;
  return SLASH_COMMANDS.find((c) => c.name === first) ?? null;
};

/** Filter commands for autocomplete based on a `/query` prefix. */
export const searchSlashCommands = (query: string): SlashCommand[] => {
  const q = query.replace(/^\//, "").toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
};
