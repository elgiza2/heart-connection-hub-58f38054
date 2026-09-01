/** @doc Capabilities settings — strict, minimal, clean layout. */
import { useNavigate } from "react-router-dom";
import { useCapabilities, formatRelative, type ToolAccess } from "@/hooks/useCapabilities";

export default function CapabilitiesPage() {
  const navigate = useNavigate();
  const { state, update } = useCapabilities();

  const Toggle = ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: () => void;
    label: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={[
        "relative inline-flex h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-[#4C8BF5]" : "bg-card",
        "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-[26px] w-[26px] transform rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        ].join(" ")}
        style={{ marginTop: 2 }}
      />
    </button>
  );

  // Code exec is a child of Artifacts.
  const setArtifacts = (v: boolean) => {
    update("artifacts", v);
    if (!v && state.codeExec) update("codeExec", false);
  };
  const setCodeExec = (v: boolean) => {
    update("codeExec", v);
    if (v && !state.artifacts) update("artifacts", true);
  };

  const Row = ({
    title,
    description,
    trailing,
    onClick,
    last,
  }: {
    title: string;
    description?: string;
    trailing?: React.ReactNode;
    onClick?: () => void;
    last?: boolean;
  }) => {
    const content = (
      <>
        <div className="flex-1 min-w-0 pr-3">
          <div className="text-[16px] font-medium leading-[1.35] text-foreground tracking-[-0.005em]">{title}</div>
          {description ? (
            <div className="mt-1 text-[13px] leading-[1.5] text-foreground/50">{description}</div>
          ) : null}
        </div>
        {trailing ? <div className="shrink-0 self-center">{trailing}</div> : null}
      </>
    );
    const cls = [
      "flex items-center w-full text-left px-4",
      "py-[14px]",
      last ? "" : "border-b border-foreground/[0.05]",
    ].join(" ");
    return onClick ? (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    ) : (
      <div className={cls}>{content}</div>
    );
  };

  const RadioRow = ({
    title,
    description,
    value,
    last,
  }: {
    title: string;
    description: string;
    value: ToolAccess;
    last?: boolean;
  }) => {
    const selected = state.toolAccess === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => update("toolAccess", value)}
        className={[
          "flex items-center w-full text-left px-4 py-[14px]",
          last ? "" : "border-b border-foreground/[0.05]",
        ].join(" ")}
      >
        <div className="flex-1 min-w-0 pr-3">
          <div className="text-[16px] font-medium leading-[1.35] text-foreground">{title}</div>
          <div className="mt-1 text-[13px] leading-[1.5] text-foreground/50">{description}</div>
        </div>
        <span
          className={[
            "shrink-0 grid place-items-center w-[22px] h-[22px] rounded-full border transition-colors",
            selected ? "border-[#4C8BF5] bg-[#4C8BF5]" : "border-foreground/25 bg-transparent",
          ].join(" ")}
          aria-hidden
        >
          {selected ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          ) : null}
        </span>
      </button>
    );
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mt-8 mb-2 px-4 text-[12px] font-medium uppercase tracking-[0.08em] text-foreground/65">
      {children}
    </h2>
  );

  const Card = ({ children }: { children: React.ReactNode }) => (
    <section className="rounded-[16px] bg-background border border-foreground/[0.06] overflow-hidden">
      {children}
    </section>
  );

  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground"
      style={{
        fontFamily:
          '"Neue Haas Unica","Helvetica Now Display",-apple-system,"SF Pro Display",Inter,"Segoe UI",Roboto,sans-serif',
      }}
    >
      <header
        className="sticky top-0 z-10 grid items-center px-4 pb-3"
        style={{
          gridTemplateColumns: "40px 1fr 40px",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          background: "linear-gradient(to bottom, #000 82%, transparent)",
        }}
      >
        <button
          aria-label="Back"
          onClick={() => navigate("/settings")}
          className="w-9 h-9 grid place-items-center rounded-full text-foreground/85 active:scale-95 transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-center text-[17px] font-semibold text-foreground tracking-[-0.01em]">Capabilities</h1>
        <div />
      </header>

      <section className="px-4 pb-10 max-w-[520px] mx-auto">
        <Card>
          <Row
            title="Artifacts"
            description="Required by code execution"
            trailing={<Toggle label="Artifacts" checked={state.artifacts} onChange={() => setArtifacts(!state.artifacts)} />}
          />
          <Row
            title="Code execution and file creation"
            description="Allow Megsy to execute code and create and edit docs, spreadsheets, presentations, PDFs, and data reports."
            trailing={<Toggle label="Code execution" checked={state.codeExec} onChange={() => setCodeExec(!state.codeExec)} />}
          />
          <Row
            title="Web search"
            description="Megsy will automatically search the web when it determines it needs current information."
            trailing={<Toggle label="Web search" checked={state.webSearch} onChange={() => update("webSearch", !state.webSearch)} />}
          />
          <Row
            title="Switch models when a message is flagged"
            description="When safety measures flag a message, automatically switch to a different model to keep chatting. When off, your chat will pause instead."
            trailing={<Toggle label="Switch models when flagged" checked={state.switchOnFlag} onChange={() => update("switchOnFlag", !state.switchOnFlag)} />}
            last
          />
        </Card>

        <SectionLabel>Memory</SectionLabel>
        <Card>
          <Row
            title="Generate memory from chat history"
            trailing={<Toggle label="Generate memory" checked={state.generateMemory} onChange={() => update("generateMemory", !state.generateMemory)} />}
          />
          <Row
            title="View your memory"
            description={
              state.memoryUpdatedAt
                ? `Updated ${formatRelative(state.memoryUpdatedAt)} from your chats`
                : "No memory captured yet"
            }
            trailing={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/65">
                <path d="M9 6l6 6-6 6" />
              </svg>
            }
            onClick={() => navigate("/settings/memory")}
            last
          />
        </Card>
        <p className="mt-2 px-4 text-[12px] leading-[1.5] text-foreground/65">
          Starts fresh and learns from your conversations.
        </p>

        <SectionLabel>Tool access</SectionLabel>
        <Card>
          <RadioRow title="Auto" description="Megsy chooses for you" value="auto" />
          <RadioRow title="On demand" description="Load when needed. More messages, lower accuracy" value="on_demand" />
          <RadioRow title="Always available" description="Ready from start. Fewer messages, better accuracy" value="always" last />
        </Card>
      </section>
    </div>
  );
}
