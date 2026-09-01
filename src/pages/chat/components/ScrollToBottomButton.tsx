import { memo } from "react";

interface ScrollToBottomButtonProps {
  visible: boolean;
  newMessagesCount: number;
  onClick: () => void;
}

/** Removed by product direction: the floating "jump to latest" button is gone. */
const ScrollToBottomButtonImpl = (_props: ScrollToBottomButtonProps) => null;

export const ScrollToBottomButton = memo(ScrollToBottomButtonImpl);

export default ScrollToBottomButton;
