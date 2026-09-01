/** @doc Settings route pass-through shell; desktop uses the same mobile settings experience. */
import { createContext, useContext, type ReactNode } from "react";

type ShellCtx = { mainEl: HTMLElement | null; active: boolean };

const SettingsShellContext = createContext<ShellCtx>({ mainEl: null, active: false });

export const useSettingsShell = () => useContext(SettingsShellContext);

export function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <SettingsShellContext.Provider value={{ mainEl: null, active: false }}>
      {children}
    </SettingsShellContext.Provider>
  );
}

export default SettingsShell;
