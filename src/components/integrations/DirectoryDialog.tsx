import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateIntegrations: () => void;
}

export default function DirectoryDialog({ open, onOpenChange, onNavigateIntegrations }: DirectoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Integrations</DialogTitle>
          <DialogDescription>
            Browse and connect apps in the integrations settings.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => { onOpenChange(false); onNavigateIntegrations(); }}>
            Open integrations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
