import { memo } from "react";
import { AnimatePresence, m as motion } from "framer-motion";

interface SystemEvent {
  id: string;
  text: string;
}

interface SystemEventsListProps {
  events: SystemEvent[];
}

const SystemEventsListImpl = ({ events }: SystemEventsListProps) => {
  return (
    <AnimatePresence>
      {events.slice(-3).map((ev) => (
        <motion.div
          key={ev.id}
          initial={{ opacity: 0, y: 6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex justify-center my-2"
        >
          <span className="px-3 py-1 rounded-full bg-muted/60 text-[11px] text-muted-foreground">
            {ev.text}
          </span>
        </motion.div>
      ))}
    </AnimatePresence>
  );
};

export const SystemEventsList = memo(
  SystemEventsListImpl,
  (prev, next) => prev.events === next.events,
);

export default SystemEventsList;
