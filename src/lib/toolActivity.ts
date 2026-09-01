// Maps tool names (Odysseus first-party + Pipedream integrations) to a brand
// slug + action verb so the chat UI can render the right icon and the right
// human label while the agent is using the tool.

export type ToolAction = "search" | "send" | "fetch" | "write" | "list" | "run" | "think";

export interface ToolActivityMeta {
  /** simple-icons slug — rendered from the simple-icons CDN. */
  slug?: string;
  /** Lucide icon name fallback when no brand slug applies. */
  lucide?: string;
  action: ToolAction;
  /** Human label parts; the target (email, query…) is appended at runtime. */
  ar: string;
  en: string;
}

const REG: Record<string, ToolActivityMeta> = {
  // first-party
  web_search: { lucide: "Search", action: "search", ar: "يSearch عن", en: "Searching for" },
  generate_image: { lucide: "Image", action: "run", ar: "يرسم صورة", en: "Generating image" },
  generate_video: { lucide: "Video", action: "run", ar: "يرندر فيديو", en: "Generating video" },
  code_agent: {
    lucide: "Code2",
    action: "run",
    ar: "يشغّل وكيل البرمجة",
    en: "Running code agent",
  },
  memory_recall: { lucide: "Brain", action: "fetch", ar: "يستدعي الMemory", en: "Recalling memory" },
  memory_save: { lucide: "Save", action: "write", ar: "يحفظ ملاحظة", en: "Saving memory" },
  skill_lookup: {
    lucide: "Sparkles",
    action: "search",
    ar: "يSearch عن مهارة",
    en: "Looking up skill",
  },
  tool_search: { lucide: "Wrench", action: "search", ar: "يSearch عن أداة", en: "Looking up tools" },
  tool_invoke: { lucide: "Play", action: "run", ar: "يستخدم أداة", en: "Running tool" },

  // pipedream integrations — keyed by exact tool name
  gmail_send_email: {
    slug: "gmail",
    action: "send",
    ar: "يرسل بريد عبر Gmail",
    en: "Sending email via Gmail",
  },
  gmail_list_recent: { slug: "gmail", action: "list", ar: "يقرأ بريد Gmail", en: "Reading Gmail" },
  google_sheets_read_range: {
    slug: "googlesheets",
    action: "fetch",
    ar: "يقرأ من Google Sheets",
    en: "Reading Google Sheets",
  },
  google_sheets_append_row: {
    slug: "googlesheets",
    action: "write",
    ar: "يكتب في Google Sheets",
    en: "Writing to Google Sheets",
  },
  google_calendar_list_events: {
    slug: "googlecalendar",
    action: "list",
    ar: "يفحص التقويم",
    en: "Reading Google Calendar",
  },
  google_calendar_create_event: {
    slug: "googlecalendar",
    action: "send",
    ar: "ينشئ حدث في التقويم",
    en: "Creating calendar event",
  },
  slack_post_message: {
    slug: "slack",
    action: "send",
    ar: "يرسل رسالة على Slack",
    en: "Sending Slack message",
  },
  discord_post_message: {
    slug: "discord",
    action: "send",
    ar: "يرسل رسالة على Discord",
    en: "Sending Discord message",
  },
  notion_search: { slug: "notion", action: "search", ar: "يSearch في Notion", en: "Searching Notion" },
  notion_create_page: {
    slug: "notion",
    action: "write",
    ar: "ينشئ صفحة Notion",
    en: "Creating Notion page",
  },
  airtable_list_records: {
    slug: "airtable",
    action: "list",
    ar: "يقرأ من Airtable",
    en: "Reading Airtable",
  },
  airtable_create_record: {
    slug: "airtable",
    action: "write",
    ar: "يضيف سجل Airtable",
    en: "Creating Airtable record",
  },
  github_list_repos: {
    slug: "github",
    action: "list",
    ar: "يفحص مستودعات GitHub",
    en: "Listing GitHub repos",
  },
  github_create_issue: {
    slug: "github",
    action: "write",
    ar: "ينشئ Issue على GitHub",
    en: "Creating GitHub issue",
  },
  linear_create_issue: {
    slug: "linear",
    action: "write",
    ar: "ينشئ مهمة Linear",
    en: "Creating Linear issue",
  },
  hubspot_create_contact: {
    slug: "hubspot",
    action: "write",
    ar: "ينشئ جهة Connect HubSpot",
    en: "Creating HubSpot contact",
  },
  telegram_send_message: {
    slug: "telegram",
    action: "send",
    ar: "يرسل رسالة Telegram",
    en: "Sending Telegram message",
  },
  trello_create_card: {
    slug: "trello",
    action: "write",
    ar: "ينشئ بطاقة Trello",
    en: "Creating Trello card",
  },
};

const SLUG_BY_APP: Record<string, string> = {
  gmail: "gmail",
  google_sheets: "googlesheets",
  google_calendar: "googlecalendar",
  google_drive: "googledrive",
  google_docs: "googledocs",
  slack: "slack",
  discord: "discord",
  notion: "notion",
  airtable: "airtable",
  airtable_oauth: "airtable",
  github: "github",
  linear: "linear",
  hubspot: "hubspot",
  telegram_bot_api: "telegram",
  trello: "trello",
  asana: "asana",
  zoom: "zoom",
  twitter: "x",
  x: "x",
  stripe: "stripe",
  shopify: "shopify",
  zendesk: "zendesk",
  intercom: "intercom",
  jira: "jira",
  confluence: "confluence",
  dropbox: "dropbox",
  figma: "figma",
};

/** Build a meta description for any tool name, with sensible fallbacks. */
export function resolveToolActivity(name: string, appSlug?: string): ToolActivityMeta {
  if (REG[name]) return REG[name];
  // derive from app slug
  if (appSlug && SLUG_BY_APP[appSlug]) {
    return {
      slug: SLUG_BY_APP[appSlug],
      action: "run",
      ar: `يستخدم ${appSlug}`,
      en: `Using ${appSlug}`,
    };
  }
  // derive from tool name prefix
  const prefix = name.split("_")[0];
  if (prefix && SLUG_BY_APP[prefix]) {
    return {
      slug: SLUG_BY_APP[prefix],
      action: "run",
      ar: `يستخدم ${prefix}`,
      en: `Using ${prefix}`,
    };
  }
  return { lucide: "Wrench", action: "run", ar: "يستخدم أداة", en: "Running tool" };
}

/** simple-icons CDN URL for a given slug. */
export function brandIconUrl(slug: string): string {
  return `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`;
}
