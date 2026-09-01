import { Suspense } from "react";
import type { NavigateFunction } from "react-router-dom";
import { ConnectorsDialog, DirectoryDialog, TemplatePickerSheet } from "../lazyComponents";
import { SLIDES_TEMPLATES } from "@/lib/slidesTemplates";

interface ChatGlobalModalsProps {
  connectorsOpen: boolean;
  setConnectorsOpen: (open: boolean) => void;
  directoryOpen: boolean;
  setDirectoryOpen: (open: boolean) => void;
  slidesPickerOpen: boolean;
  setSlidesPickerOpen: (open: boolean) => void;
  slidesTemplate: string | null;
  setSlidesTemplate: (id: string) => void;
  navigate: NavigateFunction;
}

export const ChatGlobalModals = ({
  connectorsOpen,
  setConnectorsOpen,
  directoryOpen,
  setDirectoryOpen,
  slidesPickerOpen,
  setSlidesPickerOpen,
  slidesTemplate,
  setSlidesTemplate,
  navigate,
}: ChatGlobalModalsProps) => {
  return (
    <Suspense fallback={null}>
      {connectorsOpen && (
        <ConnectorsDialog
          open={connectorsOpen}
          onOpenChange={setConnectorsOpen}
          onNavigateIntegrations={() => navigate("/chat?integrations=1")}
        />
      )}

      {directoryOpen && (
        <DirectoryDialog
          open={directoryOpen}
          onOpenChange={setDirectoryOpen}
          onNavigateIntegrations={() => navigate("/chat?integrations=1")}
        />
      )}

      {slidesPickerOpen && (
        <TemplatePickerSheet
          open={slidesPickerOpen}
          showCategoryTabs
          templates={SLIDES_TEMPLATES.map((t) => ({
            id: t.id,
            name: t.name,
            preview: t.cover,
            description: t.description,
            fallbackLabel: t.name,
            category: t.category,
            colors: t.colors,
          }))}
          selectedId={slidesTemplate}
          onSelect={(t) => setSlidesTemplate(t.id)}
          onClose={() => setSlidesPickerOpen(false)}
        />
      )}
    </Suspense>
  );
};

export default ChatGlobalModals;
