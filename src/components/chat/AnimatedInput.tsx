import { memo, useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react";
import {
  ArrowUp,
  Square,
  X,
  Sparkles,
  Loader2,
  Pencil,
  Plus,
} from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";

import ModelPickerDropdown from "@/components/model-picker/ModelPickerDropdown";
import type { AgentDef, AgentModel } from "@/lib/agentRegistry";
import { getAgentById } from "@/lib/agentRegistry";
import { TypingAnimation } from "@/components/ui/typing-animation";
import ComposerMicButton from "@/components/chat/ComposerMicButton";
import ComposerIntegrationsButton from "@/components/chat/ComposerIntegrationsButton";
import IntegrationsSheet from "@/components/chat/IntegrationsSheet";
import ComposerVoiceWave from "@/components/chat/ComposerVoiceWave";
import { isSendKey } from "@/lib/composerKey";
import { parseSlashCommand } from "@/lib/slashCommands";
import { useNavigate, useLocation } from "react-router-dom";
import { t as uiT, useUserLang } from "@/lib/authI18n";

interface SmartQuestion {
  title: string;
  options: string[];
  allowText?: boolean;
}

interface AnimatedInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  onPlusClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholders?: string[];
  pendingQuestions?: SmartQuestion[];
  onQuestionAnswer?: (answer: string) => void;
  onQuestionSkip?: () => void;
  activeAgent?: string | null;
  activeAgentDef?: AgentDef | null;
  onAgentSelect?: (agent: AgentDef) => void;
  onAgentRemove?: () => void;
  mentionCategories?: string[];
  selectedModel?: AgentModel | null;
  onModelSelect?: (model: AgentModel) => void;
  onModelRemove?: () => void;
  accentMode?: "learn" | null;
  headerSlot?: React.ReactNode;
  inlineSlot?: React.ReactNode;
  activeServiceSlot?: React.ReactNode;
  isEditing?: boolean;
  onCancelEdit?: () => void;
  /** When true, the composer sits in a chat context and uses a liquid-glass surface. */
  chatContext?: boolean;
  /** Force plain Enter to submit, regardless of viewport/send-mode preference. */
  forceEnterToSend?: boolean;
  /** Notified when the textarea gains or loses focus (used to auto-hide chips on mobile). */
  onFocusChange?: (focused: boolean) => void;
  canSendWithoutText?: boolean;
}

const AnimatedInput = ({
  value,
  onChange,
  onSend,
  onCancel,
  disabled,
  isLoading,
  placeholders,
  activeAgent,
  activeAgentDef,
  onAgentSelect,
  onAgentRemove,
  mentionCategories,
  selectedModel,
  onModelSelect,
  onModelRemove,
  headerSlot,
  inlineSlot,
  activeServiceSlot,
  isEditing,
  onCancelEdit,
  onPlusClick,
  chatContext,
  forceEnterToSend,
  onFocusChange,
  canSendWithoutText,
}: AnimatedInputProps) => {
  const currentLang = useUserLang();
  const deferredValue = useDeferredValue(value);
  const navigate = useNavigate();
  const defaultPlaceholders = useMemo(
    () => [
      uiT("placeholderAsk"),
      uiT("placeholderProject"),
      uiT("placeholderAllInOne"),
      uiT("placeholderType"),
    ],
    [currentLang],
  );

  /**
   * Intercept bare slash commands (e.g. "/clear", "/docs", "/new").
   * Returns true when the input was consumed as a command so callers
   * should NOT trigger onSend.
   */
  const tryRunSlashCommand = useCallback((): boolean => {
    const cmd = parseSlashCommand(value);
    if (!cmd) return false;
    const handled = cmd.run({
      navigate,
      clearInput: () => onChange(""),
      raw: value,
    });
    return handled !== false;
  }, [value, navigate, onChange]);

  const handleSendWithSlash = useCallback(() => {
    if (tryRunSlashCommand()) return;
    onSend();
  }, [tryRunSlashCommand, onSend]);
  const items = useMemo(
    () =>
      placeholders && placeholders.length > 0
        ? placeholders
        : defaultPlaceholders,
    [placeholders, defaultPlaceholders],
  );
  const [placeholderIndex, setPlaceholderIndex] = useState(() =>
    Math.floor(Math.random() * items.length),
  );
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeholderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const valueRef = useRef(value);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [lastSelectedAgent, setLastSelectedAgent] = useState<AgentDef | null>(null);
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const composerLocation = useLocation();
  useEffect(() => {
    if (new URLSearchParams(composerLocation.search).get("integrations") === "1") {
      setIntegrationsOpen(true);
    }
  }, [composerLocation.search]);
  useEffect(() => {
    const open = () => setIntegrationsOpen(true);
    window.addEventListener("megsy:open-integrations", open);
    return () => window.removeEventListener("megsy:open-integrations", open);
  }, []);

  /** An app tool was picked from the connectors sheet — prefill the composer. */
  useEffect(() => {
    const insert = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;
      if (!text) return;
      const current = valueRef.current;
      onChange(current && !current.endsWith(" ") ? `${current} ${text}` : `${current}${text}`);
      window.setTimeout(() => textareaRef.current?.focus(), 60);
    };
    window.addEventListener("megsy:composer-insert", insert);
    return () => window.removeEventListener("megsy:composer-insert", insert);
  }, [onChange]);

  const isActive = focused || !!value;


  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Get models for active agent OR last selected agent
  const activeAgentModels = useMemo(() => {
    if (lastSelectedAgent?.models?.length) return lastSelectedAgent.models;
    if (!activeAgent) return [];
    const agent = getAgentById(activeAgent);
    return agent?.models || [];
  }, [activeAgent, lastSelectedAgent]);

  // Static placeholder that quietly rotates every few seconds (no per-char typing,
  // which previously caused 20fps re-renders and a "reloading" feel while typing/streaming).
  useEffect(() => {
    setDisplayedPlaceholder(items[placeholderIndex] || defaultPlaceholders[0]);
  }, [placeholderIndex, items]);

  useEffect(() => {
    if (value) return; // pause rotation while user is typing
    const id = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => clearInterval(id);
  }, [value, items]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && (mentionOpen || modelPickerOpen)) {
      setMentionOpen(false);
      setModelPickerOpen(false);
      return;
    }
    // Desktop: Enter sends. Mobile: Enter inserts a newline (no preventDefault).
    const shouldForceSend =
      forceEnterToSend &&
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent?.isComposing;
    if (shouldForceSend || isSendKey(e)) {
      e.preventDefault();
      if (mentionOpen || modelPickerOpen) {
        setMentionOpen(false);
        setModelPickerOpen(false);
        return;
      }
      if (value.trim() && !disabled && !isLoading) handleSendWithSlash();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    onChange(newVal);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newVal.slice(0, cursorPos);

    // Check for # model picker (when agent with models is selected)
    if ((activeAgent || lastSelectedAgent) && activeAgentModels.length > 0) {
      const hashMatch = textBeforeCursor.match(/#(\w*)$/);
      if (hashMatch) {
        setModelPickerOpen(true);
        setModelQuery(hashMatch[1]);
        setMentionOpen(false);
        return;
      }
    }

    // @ mention menu removed by design.
    setMentionOpen(false);
    setMentionQuery("");
    if (!textBeforeCursor.match(/#(\w*)$/)) {
      setModelPickerOpen(false);
      setModelQuery("");
    }
  };


  const handleModelSelect = (model: AgentModel) => {
    // Replace #query with #model-label and keep it visible
    const cursorPos = textareaRef.current?.selectionStart || value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const cleanedBefore = textBeforeCursor.replace(/#\w*$/, "");
    const textAfter = value.slice(cursorPos);
    const modelTag = `#${model.label} `;
    onChange(cleanedBefore + modelTag + textAfter);
    setModelPickerOpen(false);
    setModelQuery("");
    onModelSelect?.(model);
  };

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      const maxH = typeof window !== "undefined" && window.innerWidth < 768 ? 120 : 160;
      el.style.height = Math.min(el.scrollHeight, maxH) + "px";
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  return (
    <div className="relative">
      <AnimatePresence>
        {/* @ mention dropdown removed by design. */}
        {modelPickerOpen && activeAgentModels.length > 0 && (
          <ModelPickerDropdown
            models={activeAgentModels}
            query={modelQuery}
            onSelect={handleModelSelect}
            onClose={() => setModelPickerOpen(false)}
          />
        )}
      </AnimatePresence>
      {/* Desktop: liquid-glass surface (no solid card wrapper) */}
      <div className="md:rounded-[28px]">
        <motion.div
          animate={{ scale: isActive ? 1.004 : 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className={`chat-composer-frame chat-mobile-input-glow composer-card pointer-events-auto rounded-[24px] px-3.5 pt-3 pb-2.5 relative z-10 md:rounded-[24px] md:px-4 md:pt-3 md:pb-2.5 border-0 ${chatContext ? "chat-composer-liquid" : ""}`}
        >
          {/* Active service strip — fused into the top of the composer card */}
          {headerSlot && (
            <div className="-mx-2 -mt-1 mb-1.5 pointer-events-auto">{headerSlot}</div>
          )}
          {/* Chips row (model picker, slides template, research depth) — sit ABOVE the input */}
          {inlineSlot && (
            <div dir="ltr" className="flex items-center flex-wrap gap-1.5 pb-1.5">
              {inlineSlot}
            </div>
          )}

          {/* Textarea — full width, on top */}
          <div className="px-1">
            {/* Inline service chip — lives inside the input box and pushes the textarea down */}
            <AnimatePresence>
              {isEditing && (
                <motion.div
                  key="editing-chip"
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.8 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-2 pt-2 pb-1.5">
                    <span className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full text-[12px] font-medium bg-primary/12 text-primary border border-primary/25">
                      <Pencil className="w-3 h-3" strokeWidth={2.4} />
                      {uiT("editing")}
                    </span>
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-foreground/60 hover:text-foreground hover:bg-foreground/10 active:scale-90 transition"
                      aria-label={uiT("cancelEdit")}
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2.4} />
                    </button>
                  </div>
                </motion.div>
              )}
              {activeServiceSlot && (
                <motion.div
                  key="active-service-chip"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center px-0.5 pt-0.5 pb-1">{activeServiceSlot}</div>
                </motion.div>
              )}
              {activeAgentDef && (
                <motion.div
                  key={activeAgentDef.id}
                  initial={{ opacity: 0, y: -4, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -4, height: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center pt-1 pb-1.5">
                    <span className="inline-flex items-center gap-1.5 h-9 pl-3 pr-1.5 rounded-full text-[12.5px] font-medium border border-foreground/20 bg-foreground/10 text-foreground">
                      <activeAgentDef.icon className="w-3.5 h-3.5" />
                      <span className="leading-none">{activeAgentDef.label}</span>
                      <button
                        type="button"
                        onClick={onAgentRemove}
                        className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-foreground/20 transition-colors"
                        aria-label={`Remove ${activeAgentDef.label}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={`relative ${listening ? "hidden" : ""}`}>

              {!value && displayedPlaceholder && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-start px-1 pt-2 text-[15.5px] md:text-sm text-foreground/90 leading-relaxed overflow-hidden"
                >
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={displayedPlaceholder}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.35 }}
                      className="truncate"
                    >
                      {displayedPlaceholder}
                    </motion.span>
                  </AnimatePresence>
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={() => { setFocused(true); onFocusChange?.(true); }}
                onBlur={() => { setFocused(false); onFocusChange?.(false); }}
                placeholder=""

                rows={1}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                name="chat-message"
                className="relative w-full bg-transparent border-none outline-none resize-none text-[15.5px] md:text-sm text-foreground !text-foreground py-1.5 px-1 leading-relaxed md:py-2 font-medium"
                style={{ minHeight: "38px" }}
              />
            </div>
            <AnimatePresence>{listening ? <ComposerVoiceWave /> : null}</AnimatePresence>
          </div>


          {/* Bottom controls row — borderless icon buttons, send is the only filled one */}
          <div
            dir="ltr"
            className="relative flex items-center gap-1 pt-1 md:pt-0"
          >
            <motion.button
              type="button"
              onClick={onPlusClick}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
              className="animated-plus-btn shrink-0 inline-flex w-11 h-11 md:w-10 md:h-10 items-center justify-center rounded-full border-0 outline-none text-foreground/70 hover:text-foreground transition-colors"
              style={{ boxShadow: "none", background: "transparent", border: 0 }}
              aria-label={uiT("openTools")}
              data-plus-trigger
            >

              <Plus className="w-[20px] h-[20px]" strokeWidth={1.9} />
            </motion.button>


            <ComposerIntegrationsButton onClick={() => setIntegrationsOpen(true)} />
            <IntegrationsSheet open={integrationsOpen} onOpenChange={setIntegrationsOpen} />

            <ComposerMicButton
              onListeningChange={setListening}
              onTranscript={(text) =>
                onChange(value ? `${value.trimEnd()} ${text}` : text)
              }
            />

            <div className="flex-1" />



            <AnimatePresence mode="popLayout" initial={false}>
              {isLoading ? (
                <motion.button
                  key="stop"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onCancel}
                  className="shrink-0 w-11 h-11 md:h-10 md:w-10 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-[0_2px_10px_rgba(0,0,0,0.2)] hover:opacity-90 transition-opacity"
                  aria-label={uiT("stopGeneration")}
                >
                  <Square className="w-3 h-3" fill="currentColor" />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSendWithSlash}
                  disabled={disabled || (!value.trim() && !canSendWithoutText)}
                  data-testid="mobile-composer-send"
                  className="shrink-0 w-11 h-11 md:h-10 md:w-10 flex items-center justify-center rounded-full bg-foreground text-background shadow-[0_2px_10px_rgba(0,0,0,0.2)] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={uiT("sendMessage")}
                >
                  <ArrowUp className="w-[18px] h-[18px] md:w-4 md:h-4" strokeWidth={2.2} />
                </motion.button>

              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

    </div>
  );
};

export default memo(AnimatedInput);
