// Inline iOS Settings-style rounded tiles served as data URIs.
// v2: cleaner, muted palette and minimal white symbols on colored tiles.

const tile = (bg: string, paths: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${bg}"/><g transform="translate(4 4)" fill="#fff" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`,
  )}`;

export const IOS26_ICONS = {
  account: tile(
    '#6C6C70',
    '<circle cx="12" cy="8.5" r="3.8" stroke="none"/><path d="M3.8 21.5c.8-4 3.8-6.2 8.2-6.2s7.4 2.2 8.2 6.2" stroke="none"/>',
  ),
  billing: tile(
    '#34C759',
    '<rect x="2.5" y="6.5" width="19" height="11" rx="2.5" stroke="none"/><path d="M2.5 10.5h19" stroke="none" opacity=".55"/><circle cx="17.5" cy="15" r="1.2" stroke="none"/>',
  ),
  appearance: tile(
    '#A1A1AA',
    '<circle cx="12" cy="12" r="5" stroke="none"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8 5.4 18.6" fill="none" stroke="#fff" stroke-width="1.8"/>',
  ),
  personas: tile(
    '#FF9F0A',
    '<circle cx="9" cy="8.5" r="3.3" stroke="none"/><path d="M3.5 20.5c.6-3.6 2.8-5.6 5.7-5.6s5.1 2 5.7 5.6" stroke="none"/><circle cx="17.2" cy="9.2" r="2.5" opacity=".75" stroke="none"/><path d="M15 15.5c2.6.3 4.6 1.9 5.1 4.5" opacity=".75" stroke="none"/>',
  ),
  workspaces: tile(
    '#FF9F0A',
    '<rect x="4" y="4" width="7" height="7" rx="1.8" stroke="none"/><rect x="13" y="4" width="7" height="7" rx="1.8" stroke="none"/><rect x="4" y="13" width="7" height="7" rx="1.8" stroke="none"/><rect x="13" y="13" width="7" height="7" rx="1.8" stroke="none"/>',
  ),
  ai: tile(
    '#BF5AF2',
    '<path d="M12 4 14 9.5 19.5 11 14 12.5 12 20 10 12.5 4.5 11 10 9.5 12 4Z" stroke="none"/>',
  ),
  skills: tile(
    '#FFCC00',
    '<path d="m18.2 4.4 1.4 1.4a1.5 1.5 0 0 1 0 2.1L8.5 19 4.5 19.8l.8-4L16.8 4.4a1.5 1.5 0 0 1 2.1 0Z" stroke="none"/>',
  ),
  memory: tile(
    '#AF52DE',
    '<path d="M12 4.8c-1-1-2.8-.8-3.7.2-.9.8-1.1 1.9-.8 2.8-1.3.4-2.2 1.5-2.2 2.9 0 1.1.5 2.1 1.5 2.7-.2 1.9 1.3 3.6 3.2 3.6.8 0 1.6-.3 2-.8.5.5 1.3.8 2.1.8 1.9 0 3.4-1.6 3.2-3.6.9-.6 1.5-1.6 1.5-2.7 0-1.4-.9-2.6-2.2-2.9.3-.9-.1-2-.9-2.8-1-1-2.7-1.2-3.7.2Z" stroke="none"/>',
  ),
  integrations: tile(
    '#007AFF',
    '<path d="M7.5 3.5v4.5M16.5 3.5v4.5M5.5 8h13.3v3a6.5 6.5 0 0 1-13.3 0V8Z" fill="none" stroke="#fff" stroke-width="1.9"/><path d="M12 16.5v5" fill="none" stroke="#fff" stroke-width="1.9"/>',
  ),
  language: tile(
    '#30B0C7',
    '<circle cx="12" cy="12" r="8.5" stroke="none"/><path d="M3.5 12h17M12 3.5c2.5 2.8 2.5 13.2 0 16M12 3.5c-2.5 2.8-2.5 13.2 0 16" fill="none" stroke="#fff" stroke-width="1.5"/>',
  ),
  support: tile(
    '#FF453A',
    '<path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" stroke="none" fill-rule="evenodd"/><path d="M6 6 9 9m6 6 3 3m3-12-3 3M9 15 6 18" fill="none" stroke="#fff" stroke-width="2"/>',
  ),
  faq: tile(
    '#5AC8FA',
    '<path d="M5 5.5h14a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5h-6l-4.4 3.5V18H5a2.5 2.5 0 0 1-2.5-2.5V8A2.5 2.5 0 0 1 5 5.5Z" stroke="none"/><path d="M9 10.5c.4-1.3 1.5-2 3-2 1.7 0 2.8.9 2.8 2.2 0 1.1-.7 1.8-1.7 2.3-.8.4-1 1-1.1 1.5M12.2 17h.1" fill="none" stroke="#fff" stroke-width="1.6"/>',
  ),
  privacy: tile(
    '#5AC8FA',
    '<path d="M12 3.5 19 6v4.5c0 4.2-2.8 8-7 9.2-4.2-1.2-7-5-7-9.2V6l7-2.5Z" stroke="none"/><path d="m9 12 2 2 4.5-4.5" fill="none" stroke="#fff" stroke-width="1.8"/>',
  ),
  notifications: tile(
    '#FF9500',
    '<path d="M12 20.5a2.5 2.5 0 0 0 2.5-2.5H9.5A2.5 2.5 0 0 0 12 20.5Z" stroke="none"/><path d="M5.5 17h13c-1.2-1.3-1.6-2.6-1.6-5V9.5a5.5 5.5 0 0 0-11 0v2.5c0 2.4-.4 3.7-1.6 5Z" stroke="none"/>',
  ),
  status: tile(
    '#30D158',
    '<path d="M3 12.5h3.5l2.5-7 3.5 12 2.5-5h6.5" fill="none" stroke="#fff" stroke-width="2"/>',
  ),
  gift: tile(
    '#FF2D55',
    '<path d="M4 10h16v10H4V10Z" stroke="none"/><path d="M3.5 7h17v4h-17V7Z" stroke="none"/><path d="M12 7v13M8 7c-1.4 0-2.3-.7-2.3-1.7S7.4 3.7 8.4 4c1.5.4 2.8 3 2.8 3H8Zm8 0c1.4 0 2.3-.7 2.3-1.7S17.4 3.7 16.4 4c-1.5.4-2.8 3-2.8 3h2.4Z" fill="none" stroke="#fff" stroke-width="1.4"/>',
  ),
  switch: tile(
    '#8E8E93',
    '<path d="M5 8h12.5M14 4.5 17.5 8 14 11.5M19 16H6.5M10 12.5 6.5 16 10 19.5" fill="none" stroke="#fff" stroke-width="2"/>',
  ),
  sparkle: tile(
    '#BF5AF2',
    '<path d="M12 4 14 9.5 19.5 11 14 12.5 12 20 10 12.5 4.5 11 10 9.5 12 4Z" stroke="none"/>',
  ),
  api: tile(
    '#007AFF',
    '<path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13 5 10.5 19" fill="none" stroke="#fff" stroke-width="2"/>',
  ),
  logout: tile(
    '#FF453A',
    '<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14v-2h3.5v-11H14V4.5Z" stroke="none"/><path d="M10 16.5 5 12l5-4.5M5.5 12h10" fill="none" stroke="#fff" stroke-width="2"/>',
  ),
};
