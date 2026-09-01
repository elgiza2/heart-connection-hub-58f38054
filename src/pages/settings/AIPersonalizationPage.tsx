/** @doc Tell Megsy about you so replies feel personal. */
// AI Personalization ("Tuning Fork") — editorial redesign using SubShell.
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SubShell } from "@/components/settings/SubShell";
import {
  CleanCard,
  CleanField,
  CleanInput,
  CleanTextarea,
  CleanSlider,
  CleanChoice,
  CleanButton,
} from "@/components/settings/CleanSettings";
import { cn } from "@/lib/utils";

const LANGUAGE_STYLES: { id: string; label: string; description?: string }[] = [
  { id: "mixed", label: "Auto", description: "Mix based on your chat" },
  { id: "casual", label: "Casual", description: "Relaxed and friendly" },
  { id: "formal", label: "Formal", description: "Polished and precise" },
  { id: "english", label: "English", description: "Always reply in English" },
];

type Tier = "lite" | "pro" | "max";
const TIERS: { id: Tier; label: string; description: string; paid: boolean }[] = [
  { id: "lite", label: "Lite", description: "Fast everyday", paid: false },
  { id: "pro", label: "Pro", description: "Smarter answers", paid: true },
  { id: "max", label: "Max", description: "Top-tier model", paid: true },
];

export default function AIPersonalizationPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>("free");

  const [callName, setCallName] = useState("");
  const [profession, setProfession] = useState("");
  const [about, setAbout] = useState("");

  const [toneFormality, setToneFormality] = useState(50);
  const [toneVerbosity, setToneVerbosity] = useState(50);
  const [toneCreativity, setToneCreativity] = useState(50);

  const [languageStyle, setLanguageStyle] = useState("mixed");
  const [interests, setInterests] = useState<string[]>([]);
  const [aiTraits, setAiTraits] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  const [preferredTier, setPreferredTier] = useState<Tier>("lite");

  const [savedSnapshot, setSavedSnapshot] = useState<string>("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setUserId(user.id);

      const [profileRes, persRes] = await Promise.all([
        supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
        supabase.from("ai_personalization").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      setUserPlan((profileRes.data as any)?.plan || "free");

      const d: any = persRes.data || {};
      setCallName(d.call_name || "");
      setProfession(d.profession || "");
      setAbout(d.about || "");
      setAiTraits(d.ai_traits || "");
      setCustomInstructions(d.custom_instructions || "");
      setToneFormality(d.tone_formality ?? 50);
      setToneVerbosity(d.tone_verbosity ?? 50);
      setToneCreativity(d.tone_creativity ?? 50);
      setLanguageStyle(d.language_style || "mixed");
      setInterests(Array.isArray(d.interests) ? d.interests : []);
      setPreferredTier((d.preferred_tier as Tier) || "lite");

      setSavedSnapshot(
        JSON.stringify({
          callName: d.call_name || "",
          profession: d.profession || "",
          about: d.about || "",
          aiTraits: d.ai_traits || "",
          customInstructions: d.custom_instructions || "",
          toneFormality: d.tone_formality ?? 50,
          toneVerbosity: d.tone_verbosity ?? 50,
          toneCreativity: d.tone_creativity ?? 50,
          languageStyle: d.language_style || "mixed",
          interests: Array.isArray(d.interests) ? d.interests : [],
          preferredTier: (d.preferred_tier as Tier) || "lite",
        }),
      );
      setLoading(false);
    })();
  }, [navigate]);

  const isPaid = userPlan !== "free" && userPlan !== "trial";

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        callName,
        profession,
        about,
        aiTraits,
        customInstructions,
        toneFormality,
        toneVerbosity,
        toneCreativity,
        languageStyle,
        interests,
        preferredTier,
      }),
    [
      callName,
      profession,
      about,
      aiTraits,
      customInstructions,
      toneFormality,
      toneVerbosity,
      toneCreativity,
      languageStyle,
      interests,
      preferredTier,
    ],
  );

  const isDirty = currentSnapshot !== savedSnapshot;

  const save = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    const payload: any = {
      user_id: userId,
      call_name: callName.trim() || null,
      profession: profession.trim() || null,
      about: about.trim() || null,
      ai_traits: aiTraits.trim() || null,
      custom_instructions: customInstructions.trim() || null,
      tone_formality: toneFormality,
      tone_verbosity: toneVerbosity,
      tone_creativity: toneCreativity,
      language_style: languageStyle,
      interests,
      preferred_tier: preferredTier,
    };
    const { error } = await supabase
      .from("ai_personalization")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error("Failed to save");
      return;
    }
    setSavedSnapshot(currentSnapshot);
  }, [
    userId,
    callName,
    profession,
    about,
    aiTraits,
    customInstructions,
    toneFormality,
    toneVerbosity,
    toneCreativity,
    languageStyle,
    interests,
    preferredTier,
    currentSnapshot,
  ]);

  // Autosave: debounce changes and persist automatically
  useEffect(() => {
    if (loading || !userId) return;
    if (currentSnapshot === savedSnapshot) return;
    const t = setTimeout(() => { save(); }, 800);
    return () => clearTimeout(t);
  }, [currentSnapshot, savedSnapshot, loading, userId, save]);

  const [autofilling, setAutofilling] = useState(false);

  const autofill = useCallback(async () => {
    setAutofilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-alibaba", {
        body: { action: "personalization_suggest" },
      });
      if (error) {
        toast.error(error.message || "Auto-fill failed");
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error);
        return;
      }
      const s = (data as any)?.suggestion as
        | {
            call_name?: string;
            profession?: string;
            about?: string;
            interests?: string[];
            ai_traits?: string;
            custom_instructions?: string;
          }
        | undefined;
      if (!s) {
        toast.error("No suggestions returned");
        return;
      }
      let filled = 0;
      if (!callName.trim() && s.call_name) {
        setCallName(s.call_name);
        filled++;
      }
      if (!profession.trim() && s.profession) {
        setProfession(s.profession);
        filled++;
      }
      if (!about.trim() && s.about) {
        setAbout(s.about);
        filled++;
      }
      if (interests.length === 0 && Array.isArray(s.interests) && s.interests.length) {
        setInterests(s.interests);
        filled++;
      }
      if (!aiTraits.trim() && s.ai_traits) {
        setAiTraits(s.ai_traits);
        filled++;
      }
      if (!customInstructions.trim() && s.custom_instructions) {
        setCustomInstructions(s.custom_instructions);
        filled++;
      }
      if (filled === 0) {
        toast.info("Nothing to fill — your empty fields didn't have enough signal yet");
      } else {
        toast.success(`Filled ${filled} field${filled === 1 ? "" : "s"} from your real data`);
      }
    } catch (e) {
      toast.error((e as Error).message || "Auto-fill failed");
    } finally {
      setAutofilling(false);
    }
  }, [callName, profession, about, interests, aiTraits, customInstructions]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const form = (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div />
        <CleanButton
          variant="secondary"
          size="sm"
          loading={autofilling}
          onClick={autofill}
          className="shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Auto-fill from history
        </CleanButton>
      </div>

      <CleanCard title="About you" description="Basics Megsy uses to address you correctly.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <CleanField label="What should Megsy call you?">
            <CleanInput
              value={callName}
              onChange={(e) => setCallName(e.target.value)}
              placeholder="e.g. Alex"
            />
          </CleanField>
          <CleanField label="Your role or field">
            <CleanInput
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              placeholder="Developer, designer, student…"
            />
          </CleanField>
        </div>
        <CleanField label="A short bio">
          <CleanTextarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="Anything that helps Megsy understand you…"
            rows={3}
          />
        </CleanField>
      </CleanCard>

      <CleanCard title="Reply tone" description="How Megsy should sound in every reply.">
        <div className="space-y-5">
          <CleanSlider
            label="Tone"
            leftLabel="Formal"
            rightLabel="Friendly"
            value={toneFormality}
            onChange={setToneFormality}
          />
          <CleanSlider
            label="Length"
            leftLabel="Concise"
            rightLabel="Detailed"
            value={toneVerbosity}
            onChange={setToneVerbosity}
          />
          <CleanSlider
            label="Style"
            leftLabel="Conservative"
            rightLabel="Creative"
            value={toneCreativity}
            onChange={setToneCreativity}
          />
        </div>
      </CleanCard>

      <CleanCard title="Preferences" description="Language and model defaults.">
        <CleanField label="Reply language">
          <CleanChoice
            options={LANGUAGE_STYLES.map((s) => ({ ...s }))}
            value={languageStyle}
            onChange={(v) => setLanguageStyle(v)}
            columns={4}
          />
        </CleanField>

        <CleanField label="Preferred model tier">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIERS.map((t) => {
              const locked = t.paid && !isPaid;
              const active = preferredTier === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    if (locked) {
                      toast.info(`Megsy ${t.label} requires a paid plan`);
                      return;
                    }
                    setPreferredTier(t.id);
                  }}
                  className={cn(
                    "relative text-left rounded-lg border px-4 py-3 transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:border-foreground/20 hover:bg-accent/40",
                    locked && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-[13px] font-semibold",
                        active ? "text-primary" : "text-foreground",
                      )}
                    >
                      {t.label}
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-primary" strokeWidth={3} />}
                    {locked && !active && (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        Pro
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t.description}</p>
                </button>
              );
            })}
          </div>
        </CleanField>
      </CleanCard>

      <CleanCard title="Interests & advanced" description="Optional details that shape replies.">
        <CleanField label="Your interests (comma separated)">
          <CleanTextarea
            value={interests.join(", ")}
            onChange={(e) =>
              setInterests(
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder="photography, indie music, hiking, AI research…"
            rows={2}
          />
          {interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {interests.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center h-6 px-2 rounded-md bg-secondary text-[11.5px] text-foreground/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </CleanField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <CleanField label="Personality traits for Megsy">
            <CleanInput
              value={aiTraits}
              onChange={(e) => setAiTraits(e.target.value)}
              placeholder="e.g. playful, direct"
            />
          </CleanField>
          <CleanField label="Anything else Megsy should know">
            <CleanInput
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="always cite sources…"
            />
          </CleanField>
        </div>
      </CleanCard>
    </div>
  );

  const statusPill = (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
      {saving ? (
        <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
      ) : isDirty ? (
        <>Unsaved changes</>
      ) : (
        <><Check className="w-3 h-3 text-primary" strokeWidth={3} /> All changes saved</>
      )}
    </span>
  );

  return (
    <SubShell
      title="Tuning Fork"
      subtitle="Tune Megsy's voice, tempo, and register. Changes save automatically."
      action={<div className="hidden md:block">{statusPill}</div>}
    >
      <div className="pt-6">{form}</div>
      <div className="mt-6 flex justify-end md:hidden">{statusPill}</div>
    </SubShell>
  );
}
