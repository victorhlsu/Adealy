import React, { createContext, useContext, useMemo, useState } from "react";

export type Passport = {
  id: string;
  countryCode: string;
  countryName: string;
  nickname?: string;
};

export type PromptVersion = {
  id: string;
  createdAt: number;
  text: string;
};

export type PromptItem = {
  id: string;
  title: string;
  versions: PromptVersion[];
  activeVersionId: string;
};

type AppState = {
  isAuthed: boolean;
  onboardingComplete: boolean;
  email?: string;

  passports: Passport[];
  home: {
    city?: string;
    airportCode?: string;
  };

  prompts: PromptItem[];

  setAuthed: (email: string) => void;
  logout: () => void;
  setOnboardingComplete: (done: boolean) => void;

  addPassport: (p: Omit<Passport, "id">) => void;
  updatePassport: (id: string, patch: Partial<Omit<Passport, "id">>) => void;
  removePassport: (id: string) => void;

  setHome: (home: { city?: string; airportCode?: string }) => void;

  addPrompt: (text: string) => void;
  editPromptActiveVersion: (promptId: string, nextText: string) => void;
  createPromptVersionFromActive: (promptId: string, nextText: string) => void;
  switchPromptVersion: (promptId: string, versionId: string) => void;
  removePrompt: (promptId: string) => void;
};

const Ctx = createContext<AppState | null>(null);

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

const DEFAULT_PROMPT = "7-day Japan trip, food-focused, mid-budget, flying from Toronto";

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(false);
  const [email, setEmail] = useState<string | undefined>(undefined);

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [passports, setPassports] = useState<Passport[]>([]);
  const [home, setHome] = useState<{ city?: string; airportCode?: string }>({
    city: "Toronto",
    airportCode: "YYZ",
  });

  const [prompts, setPrompts] = useState<PromptItem[]>(() => {
    const p0Id = uid("prompt");
    const v0Id = uid("ver");
    return [
      {
        id: p0Id,
        title: "Main prompt",
        versions: [{ id: v0Id, createdAt: Date.now(), text: DEFAULT_PROMPT }],
        activeVersionId: v0Id,
      },
    ];
  });

  const value = useMemo<AppState>(
    () => ({
      isAuthed,
      onboardingComplete,
      email,
      passports,
      home,
      prompts,

      setAuthed: (e) => {
        setIsAuthed(true);
        setEmail(e);
      },
      logout: () => {
        setIsAuthed(false);
        setOnboardingComplete(false);
        setEmail(undefined);
        setPassports([]);
        setPrompts(() => {
          const p0Id = uid("prompt");
          const v0Id = uid("ver");
          return [
            {
              id: p0Id,
              title: "Main prompt",
              versions: [{ id: v0Id, createdAt: Date.now(), text: DEFAULT_PROMPT }],
              activeVersionId: v0Id,
            },
          ];
        });
        setHome({ city: "Toronto", airportCode: "YYZ" });
      },
      setOnboardingComplete: (done) => setOnboardingComplete(done),

      addPassport: (p) => setPassports((prev) => [{ ...p, id: uid("pp") }, ...prev]),
      updatePassport: (id, patch) =>
        setPassports((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))),
      removePassport: (id) => setPassports((prev) => prev.filter((p) => p.id !== id)),

      setHome: (h) => setHome(h),

      addPrompt: (text) => {
        const pId = uid("prompt");
        const vId = uid("ver");
        setPrompts((prev) => [
          ...prev,
          {
            id: pId,
            title: `Prompt ${prev.length + 1}`,
            versions: [{ id: vId, createdAt: Date.now(), text }],
            activeVersionId: vId,
          },
        ]);
      },
      editPromptActiveVersion: (promptId, nextText) =>
        setPrompts((prev) =>
          prev.map((p) => {
            if (p.id !== promptId) return p;
            return {
              ...p,
              versions: p.versions.map((v) => (v.id === p.activeVersionId ? { ...v, text: nextText } : v)),
            };
          }),
        ),
      createPromptVersionFromActive: (promptId, nextText) =>
        setPrompts((prev) =>
          prev.map((p) => {
            if (p.id !== promptId) return p;
            const vId = uid("ver");
            return {
              ...p,
              versions: [...p.versions, { id: vId, createdAt: Date.now(), text: nextText }],
              activeVersionId: vId,
            };
          }),
        ),
      switchPromptVersion: (promptId, versionId) =>
        setPrompts((prev) => prev.map((p) => (p.id === promptId ? { ...p, activeVersionId: versionId } : p))),
      removePrompt: (promptId) => setPrompts((prev) => prev.filter((p) => p.id !== promptId)),
    }),
    [email, home, isAuthed, onboardingComplete, passports, prompts],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used within AppStateProvider");
  return v;
}

export function useActivePromptText(prompt: PromptItem) {
  const active = prompt.versions.find((v) => v.id === prompt.activeVersionId);
  return active?.text ?? "";
}
