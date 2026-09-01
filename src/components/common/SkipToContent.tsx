/** @doc Accessibility skip-to-content link: keyboard users can jump past the header to <main id="main">. */
const SkipToContent = () => (
  <a
    href="#main"
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
  >
    Skip to main content
  </a>
);

export default SkipToContent;
