/**
 * @doc Megsy 2026 tool catalog.
 *
 * The agent used to know about ~6 hardcoded tools, so it kept saying "I only do
 * certain tasks". This catalog gives it a large, searchable inventory of real
 * capabilities (1000+ tool ids) built from `service x operation` pairs.
 *
 * Nothing here is a stub: every entry maps to one of a few generic executors
 * (see `runtime.ts`) — an authenticated HTTP call, a live web lookup, a browser
 * operation, sandboxed code, or a model call. The catalog is the *index* the
 * model searches; the runtime is what actually performs the work.
 *
 * Tools are never all sent to the model at once (that would blow the context).
 * The agent calls `tool_search` with a need in plain language, gets back the
 * best matches, then calls `tool_call` with the chosen id.
 */

export type ToolKind = "http" | "web" | "browser" | "code" | "model" | "file" | "data";
export type ToolAuth = "none" | "key" | "oauth" | "login";

export interface CatalogTool {
  /** Stable id the model calls, e.g. `github.search`. */
  id: string;
  service: string;
  serviceName: string;
  op: string;
  name: string;
  category: string;
  kind: ToolKind;
  auth: ToolAuth;
  /** API base for `http` tools, or the site the browser tool works on. */
  base: string;
  keywords: string;
}

interface ServiceSpec {
  id: string;
  name: string;
  category: string;
  kind: ToolKind;
  auth: ToolAuth;
  base: string;
  ops: string[];
}

/* ------------------------------------------------------------------ op packs */

const READ = ["search", "get", "list", "export"];
const WRITE = ["create", "update", "delete"];
const CRUD = [...READ, ...WRITE];
const ANALYTICS = ["metrics", "report", "trend"];
const SOCIAL = ["search", "profile", "posts", "publish", "schedule", "engagement", "trends"];
const DEVOPS = ["status", "deploy", "logs", "rollback", "scale", "cost"];
const DATASET = ["search", "download", "query", "schema", "sample", "stats"];
const COMMERCE = ["search", "product", "price_history", "reviews", "stock", "order", "track"];
const FINANCE = ["quote", "history", "fundamentals", "news", "screener", "convert"];
const DOC = ["read", "create", "update", "search", "export", "share"];
const MEDIA = ["generate", "edit", "upscale", "caption", "transcribe", "convert"];

/**
 * Service inventory. Kept as data (not code) so adding a provider is one line.
 * `base` is a real API root wherever the provider has a public one; services
 * without an API are marked `browser`, which routes to the cloud browser.
 */
const SERVICES: ServiceSpec[] = [
  // ---------------------------------------------------------------- research
  { id: "web", name: "Live Web", category: "research", kind: "web", auth: "none", base: "", ops: ["search", "news", "read_page", "images", "videos", "scholar", "compare_sources", "fact_check", "summarize_site", "monitor"] },
  { id: "wikipedia", name: "Wikipedia", category: "research", kind: "http", auth: "none", base: "https://en.wikipedia.org/api/rest_v1", ops: ["search", "summary", "sections", "links", "media"] },
  { id: "wikidata", name: "Wikidata", category: "research", kind: "http", auth: "none", base: "https://www.wikidata.org/w/api.php", ops: ["search", "entity", "claims", "sparql"] },
  { id: "arxiv", name: "arXiv", category: "research", kind: "http", auth: "none", base: "http://export.arxiv.org/api", ops: ["search", "paper", "authors", "latest", "citations"] },
  { id: "pubmed", name: "PubMed", category: "research", kind: "http", auth: "none", base: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils", ops: ["search", "abstract", "authors", "related", "trials"] },
  { id: "semanticscholar", name: "Semantic Scholar", category: "research", kind: "http", auth: "none", base: "https://api.semanticscholar.org/graph/v1", ops: ["search", "paper", "citations", "references", "author"] },
  { id: "crossref", name: "Crossref", category: "research", kind: "http", auth: "none", base: "https://api.crossref.org", ops: ["search", "doi", "journal", "funder"] },
  { id: "openalex", name: "OpenAlex", category: "research", kind: "http", auth: "none", base: "https://api.openalex.org", ops: ["search", "work", "institution", "topic", "trend"] },
  { id: "patents", name: "Patents", category: "research", kind: "http", auth: "none", base: "https://api.patentsview.org", ops: ["search", "patent", "assignee", "citations", "landscape"] },
  { id: "archive", name: "Internet Archive", category: "research", kind: "http", auth: "none", base: "https://archive.org", ops: ["search", "snapshot", "history", "save", "book"] },
  { id: "news", name: "News Wire", category: "research", kind: "web", auth: "none", base: "", ops: ["headlines", "topic", "region", "timeline", "sentiment", "sources"] },
  { id: "hackernews", name: "Hacker News", category: "research", kind: "http", auth: "none", base: "https://hn.algolia.com/api/v1", ops: ["search", "top", "comments", "user", "trend"] },
  { id: "reddit", name: "Reddit", category: "research", kind: "http", auth: "none", base: "https://www.reddit.com", ops: ["search", "subreddit", "post", "comments", "trends", "sentiment"] },
  { id: "stackoverflow", name: "Stack Overflow", category: "research", kind: "http", auth: "none", base: "https://api.stackexchange.com/2.3", ops: ["search", "question", "answers", "tag", "user"] },

  // ---------------------------------------------------------------- dev
  { id: "github", name: "GitHub", category: "dev", kind: "http", auth: "key", base: "https://api.github.com", ops: ["search", "repo", "clone", "file", "commits", "issues", "create_issue", "pull_requests", "create_pr", "actions", "releases", "stars", "contributors", "compare", "gist"] },
  { id: "gitlab", name: "GitLab", category: "dev", kind: "http", auth: "key", base: "https://gitlab.com/api/v4", ops: ["search", "project", "file", "pipelines", "issues", "merge_requests", "create_issue"] },
  { id: "bitbucket", name: "Bitbucket", category: "dev", kind: "http", auth: "key", base: "https://api.bitbucket.org/2.0", ops: ["search", "repo", "file", "pipelines", "pull_requests"] },
  { id: "npm", name: "npm Registry", category: "dev", kind: "http", auth: "none", base: "https://registry.npmjs.org", ops: ["search", "package", "versions", "downloads", "deps", "audit"] },
  { id: "pypi", name: "PyPI", category: "dev", kind: "http", auth: "none", base: "https://pypi.org/pypi", ops: ["search", "package", "versions", "downloads", "deps"] },
  { id: "crates", name: "crates.io", category: "dev", kind: "http", auth: "none", base: "https://crates.io/api/v1", ops: ["search", "crate", "versions", "downloads"] },
  { id: "dockerhub", name: "Docker Hub", category: "dev", kind: "http", auth: "none", base: "https://hub.docker.com/v2", ops: ["search", "image", "tags", "pulls"] },
  { id: "sandbox", name: "Code Sandbox", category: "dev", kind: "code", auth: "none", base: "", ops: ["run_js", "run_python", "run_sql", "test", "benchmark", "format", "lint", "regex", "diff", "refactor", "explain", "translate_code"] },
  { id: "devbox", name: "Dev Workspace", category: "dev", kind: "browser", auth: "none", base: "", ops: ["import_repo", "read_file", "edit_file", "run_build", "run_tests", "install_deps", "start_server", "screenshot", "commit", "push", "open_pr"] },
  { id: "api", name: "HTTP Client", category: "dev", kind: "http", auth: "none", base: "", ops: ["get", "post", "put", "patch", "delete", "graphql", "webhook", "openapi", "curl"] },
  { id: "swagger", name: "OpenAPI", category: "dev", kind: "http", auth: "none", base: "", ops: ["discover", "describe", "call", "mock", "validate"] },
  { id: "mcp", name: "MCP Servers", category: "dev", kind: "http", auth: "oauth", base: "", ops: ["connect", "list_tools", "call_tool", "resources", "prompts", "disconnect"] },

  // ---------------------------------------------------------------- cloud
  { id: "vercel", name: "Vercel", category: "cloud", kind: "http", auth: "key", base: "https://api.vercel.com", ops: DEVOPS },
  { id: "netlify", name: "Netlify", category: "cloud", kind: "http", auth: "key", base: "https://api.netlify.com/api/v1", ops: DEVOPS },
  { id: "cloudflare", name: "Cloudflare", category: "cloud", kind: "http", auth: "key", base: "https://api.cloudflare.com/client/v4", ops: [...DEVOPS, "dns", "purge_cache", "workers", "r2", "waf"] },
  { id: "aws", name: "AWS", category: "cloud", kind: "http", auth: "key", base: "", ops: [...DEVOPS, "s3", "lambda", "ec2", "rds", "iam", "cloudwatch"] },
  { id: "gcp", name: "Google Cloud", category: "cloud", kind: "http", auth: "oauth", base: "https://cloudresourcemanager.googleapis.com/v1", ops: [...DEVOPS, "storage", "bigquery", "run", "functions"] },
  { id: "azure", name: "Azure", category: "cloud", kind: "http", auth: "oauth", base: "https://management.azure.com", ops: [...DEVOPS, "blob", "functions", "aks"] },
  { id: "supabase", name: "Supabase", category: "cloud", kind: "http", auth: "key", base: "", ops: ["sql", "table", "insert", "update", "delete", "storage", "auth_users", "edge_function", "logs", "migration"] },
  { id: "railway", name: "Railway", category: "cloud", kind: "http", auth: "key", base: "https://backboard.railway.app/graphql/v2", ops: DEVOPS },
  { id: "fly", name: "Fly.io", category: "cloud", kind: "http", auth: "key", base: "https://api.machines.dev/v1", ops: DEVOPS },
  { id: "render", name: "Render", category: "cloud", kind: "http", auth: "key", base: "https://api.render.com/v1", ops: DEVOPS },
  { id: "digitalocean", name: "DigitalOcean", category: "cloud", kind: "http", auth: "key", base: "https://api.digitalocean.com/v2", ops: DEVOPS },
  { id: "docker", name: "Containers", category: "cloud", kind: "browser", auth: "none", base: "", ops: ["build", "run", "logs", "stop", "compose", "registry_push"] },
  { id: "k8s", name: "Kubernetes", category: "cloud", kind: "http", auth: "key", base: "", ops: ["pods", "deploy", "logs", "scale", "rollback", "events"] },
  { id: "sentry", name: "Sentry", category: "cloud", kind: "http", auth: "key", base: "https://sentry.io/api/0", ops: ["issues", "issue", "events", "resolve", "releases", "alerts"] },
  { id: "datadog", name: "Datadog", category: "cloud", kind: "http", auth: "key", base: "https://api.datadoghq.com/api/v1", ops: ["metrics", "logs", "monitors", "dashboards", "incidents"] },
  { id: "uptime", name: "Uptime Monitor", category: "cloud", kind: "http", auth: "key", base: "", ops: ["check", "history", "create_monitor", "incidents", "ssl_expiry"] },

  // ---------------------------------------------------------------- data
  { id: "sql", name: "SQL Engine", category: "data", kind: "data", auth: "none", base: "", ops: ["query", "explain", "schema", "profile", "join", "aggregate", "migrate", "seed"] },
  { id: "sheet", name: "Spreadsheets", category: "data", kind: "data", auth: "none", base: "", ops: ["read", "write", "formula", "pivot", "chart", "clean", "dedupe", "merge", "csv_to_json", "json_to_csv"] },
  { id: "dataframe", name: "Data Analysis", category: "data", kind: "code", auth: "none", base: "", ops: ["describe", "clean", "join", "group", "correlate", "regress", "forecast", "outliers", "cluster", "visualize"] },
  { id: "scrape", name: "Web Scraper", category: "data", kind: "web", auth: "none", base: "", ops: ["extract", "table", "links", "emails", "sitemap", "paginate", "schema_org", "rss", "screenshot", "diff"] },
  { id: "vector", name: "Vector Store", category: "data", kind: "data", auth: "none", base: "", ops: ["embed", "upsert", "search", "delete", "rerank", "cluster"] },
  { id: "kaggle", name: "Kaggle", category: "data", kind: "http", auth: "key", base: "https://www.kaggle.com/api/v1", ops: DATASET },
  { id: "huggingface", name: "Hugging Face", category: "data", kind: "http", auth: "key", base: "https://huggingface.co/api", ops: ["search_models", "model", "search_datasets", "dataset", "inference", "spaces"] },
  { id: "worldbank", name: "World Bank", category: "data", kind: "http", auth: "none", base: "https://api.worldbank.org/v2", ops: DATASET },
  { id: "eurostat", name: "Eurostat", category: "data", kind: "http", auth: "none", base: "https://ec.europa.eu/eurostat/api/dissemination", ops: DATASET },
  { id: "opendata", name: "Open Data Portals", category: "data", kind: "web", auth: "none", base: "", ops: DATASET },
  { id: "census", name: "Census", category: "data", kind: "http", auth: "key", base: "https://api.census.gov/data", ops: DATASET },
  { id: "geo", name: "Geospatial", category: "data", kind: "http", auth: "none", base: "https://nominatim.openstreetmap.org", ops: ["geocode", "reverse", "distance", "route", "bbox", "places", "isochrone"] },
  { id: "weather", name: "Weather", category: "data", kind: "http", auth: "none", base: "https://api.open-meteo.com/v1", ops: ["current", "forecast", "history", "alerts", "air_quality", "marine"] },

  // ---------------------------------------------------------------- ai
  { id: "llm", name: "Language Models", category: "ai", kind: "model", auth: "none", base: "", ops: ["ask", "reason", "plan", "critique", "rewrite", "translate", "classify", "extract", "summarize", "compare", "brainstorm", "roleplay"] },
  { id: "image", name: "Image AI", category: "ai", kind: "model", auth: "none", base: "", ops: MEDIA },
  { id: "video", name: "Video AI", category: "ai", kind: "model", auth: "none", base: "", ops: ["generate", "edit", "storyboard", "subtitle", "voiceover", "trim", "upscale"] },
  { id: "audio", name: "Audio AI", category: "ai", kind: "model", auth: "none", base: "", ops: ["tts", "stt", "clone_voice", "music", "denoise", "translate_audio"] },
  { id: "ocr", name: "OCR & Vision", category: "ai", kind: "model", auth: "none", base: "", ops: ["read_image", "read_pdf", "tables", "handwriting", "id_document", "receipt", "diagram"] },
  { id: "embed", name: "Embeddings", category: "ai", kind: "model", auth: "none", base: "", ops: ["embed", "similarity", "cluster", "dedupe", "classify"] },
  { id: "agentops", name: "Agent Ops", category: "ai", kind: "model", auth: "none", base: "", ops: ["spawn", "delegate", "review", "vote", "merge_results", "retry", "escalate", "memory_write", "memory_read"] },
  { id: "evals", name: "Evaluation", category: "ai", kind: "model", auth: "none", base: "", ops: ["score", "compare", "rubric", "hallucination_check", "citation_check", "regression"] },

  // ---------------------------------------------------------------- comms
  { id: "mail", name: "Megsy Mail", category: "comms", kind: "http", auth: "login", base: "", ops: ["send", "inbox", "read", "reply", "search", "attachment", "address", "verify_code"] },
  { id: "gmail", name: "Gmail", category: "comms", kind: "http", auth: "oauth", base: "https://gmail.googleapis.com/gmail/v1", ops: ["search", "read", "send", "reply", "label", "draft", "attachments"] },
  { id: "outlook", name: "Outlook", category: "comms", kind: "http", auth: "oauth", base: "https://graph.microsoft.com/v1.0", ops: ["search", "read", "send", "reply", "calendar", "contacts"] },
  { id: "slack", name: "Slack", category: "comms", kind: "http", auth: "oauth", base: "https://slack.com/api", ops: ["post", "search", "channels", "thread", "dm", "upload", "reminder"] },
  { id: "discord", name: "Discord", category: "comms", kind: "http", auth: "key", base: "https://discord.com/api/v10", ops: ["post", "search", "channels", "thread", "dm", "roles"] },
  { id: "telegram", name: "Telegram", category: "comms", kind: "http", auth: "key", base: "https://api.telegram.org", ops: ["send", "read", "channels", "broadcast", "bot_command", "file"] },
  { id: "whatsapp", name: "WhatsApp Business", category: "comms", kind: "http", auth: "key", base: "https://graph.facebook.com/v20.0", ops: ["send", "template", "read", "media", "status"] },
  { id: "sms", name: "SMS & Voice", category: "comms", kind: "http", auth: "key", base: "https://api.twilio.com/2010-04-01", ops: ["send_sms", "send_bulk", "call", "verify", "lookup", "logs"] },
  { id: "teams", name: "Microsoft Teams", category: "comms", kind: "http", auth: "oauth", base: "https://graph.microsoft.com/v1.0", ops: ["post", "channels", "meeting", "chat", "files"] },
  { id: "zoom", name: "Zoom", category: "comms", kind: "http", auth: "oauth", base: "https://api.zoom.us/v2", ops: ["create_meeting", "list", "recording", "transcript", "participants"] },
  { id: "meet", name: "Meetings", category: "comms", kind: "browser", auth: "login", base: "", ops: ["schedule", "join", "record", "transcribe", "minutes", "follow_up"] },

  // ---------------------------------------------------------------- productivity
  { id: "notion", name: "Notion", category: "productivity", kind: "http", auth: "oauth", base: "https://api.notion.com/v1", ops: [...DOC, "database_query", "append"] },
  { id: "gdocs", name: "Google Docs", category: "productivity", kind: "http", auth: "oauth", base: "https://docs.googleapis.com/v1", ops: DOC },
  { id: "gsheets", name: "Google Sheets", category: "productivity", kind: "http", auth: "oauth", base: "https://sheets.googleapis.com/v4", ops: ["read", "write", "append", "formula", "chart", "share"] },
  { id: "gslides", name: "Google Slides", category: "productivity", kind: "http", auth: "oauth", base: "https://slides.googleapis.com/v1", ops: ["create", "add_slide", "theme", "export", "share"] },
  { id: "gdrive", name: "Google Drive", category: "productivity", kind: "http", auth: "oauth", base: "https://www.googleapis.com/drive/v3", ops: ["search", "upload", "download", "share", "folder", "permissions"] },
  { id: "dropbox", name: "Dropbox", category: "productivity", kind: "http", auth: "oauth", base: "https://api.dropboxapi.com/2", ops: ["search", "upload", "download", "share", "folder"] },
  { id: "onedrive", name: "OneDrive", category: "productivity", kind: "http", auth: "oauth", base: "https://graph.microsoft.com/v1.0/me/drive", ops: ["search", "upload", "download", "share"] },
  { id: "calendar", name: "Calendar", category: "productivity", kind: "http", auth: "oauth", base: "https://www.googleapis.com/calendar/v3", ops: ["list", "create", "update", "delete", "free_busy", "invite"] },
  { id: "tasks", name: "Task Boards", category: "productivity", kind: "http", auth: "oauth", base: "", ops: CRUD },
  { id: "jira", name: "Jira", category: "productivity", kind: "http", auth: "oauth", base: "https://api.atlassian.com/ex/jira", ops: ["search", "issue", "create", "transition", "comment", "sprint", "report"] },
  { id: "linear", name: "Linear", category: "productivity", kind: "http", auth: "key", base: "https://api.linear.app/graphql", ops: ["search", "issue", "create", "update", "cycle", "project"] },
  { id: "asana", name: "Asana", category: "productivity", kind: "http", auth: "oauth", base: "https://app.asana.com/api/1.0", ops: CRUD },
  { id: "trello", name: "Trello", category: "productivity", kind: "http", auth: "key", base: "https://api.trello.com/1", ops: CRUD },
  { id: "clickup", name: "ClickUp", category: "productivity", kind: "http", auth: "key", base: "https://api.clickup.com/api/v2", ops: CRUD },
  { id: "airtable", name: "Airtable", category: "productivity", kind: "http", auth: "key", base: "https://api.airtable.com/v0", ops: CRUD },
  { id: "office", name: "Documents", category: "productivity", kind: "file", auth: "none", base: "", ops: ["write_doc", "write_pdf", "write_slides", "write_sheet", "read_pdf", "read_docx", "merge_pdf", "split_pdf", "sign_pdf", "convert"] },

  // ---------------------------------------------------------------- crm & sales
  { id: "hubspot", name: "HubSpot", category: "sales", kind: "http", auth: "oauth", base: "https://api.hubapi.com", ops: ["contacts", "companies", "deals", "create_contact", "notes", "pipeline", "reports"] },
  { id: "salesforce", name: "Salesforce", category: "sales", kind: "http", auth: "oauth", base: "https://login.salesforce.com/services/data", ops: ["soql", "contacts", "opportunities", "create", "update", "reports"] },
  { id: "pipedrive", name: "Pipedrive", category: "sales", kind: "http", auth: "key", base: "https://api.pipedrive.com/v1", ops: CRUD },
  { id: "leads", name: "Lead Research", category: "sales", kind: "web", auth: "none", base: "", ops: ["find_company", "find_people", "verify_email", "enrich", "icp_match", "list_build", "outreach_draft"] },
  { id: "linkedin", name: "LinkedIn", category: "sales", kind: "browser", auth: "login", base: "https://www.linkedin.com", ops: ["search_people", "search_jobs", "profile", "company", "post", "connect", "message"] },
  { id: "crunchbase", name: "Crunchbase", category: "sales", kind: "web", auth: "none", base: "https://www.crunchbase.com", ops: ["company", "funding", "investors", "people", "competitors"] },
  { id: "proposal", name: "Proposals & Quotes", category: "sales", kind: "file", auth: "none", base: "", ops: ["draft", "price", "terms", "export", "send", "track"] },

  // ---------------------------------------------------------------- marketing
  { id: "seo", name: "SEO", category: "marketing", kind: "web", auth: "none", base: "", ops: ["audit", "keywords", "serp", "backlinks", "competitors", "content_gap", "schema", "sitemap", "core_web_vitals", "rank_track"] },
  { id: "ads", name: "Ad Platforms", category: "marketing", kind: "http", auth: "oauth", base: "", ops: ["campaigns", "create_campaign", "budget", "creatives", "audience", "performance", "pause"] },
  { id: "ga4", name: "Analytics", category: "marketing", kind: "http", auth: "oauth", base: "https://analyticsdata.googleapis.com/v1beta", ops: [...ANALYTICS, "funnel", "cohort", "realtime", "attribution"] },
  { id: "gsc", name: "Search Console", category: "marketing", kind: "http", auth: "oauth", base: "https://searchconsole.googleapis.com/v1", ops: ["queries", "pages", "coverage", "sitemap", "inspect"] },
  { id: "email_marketing", name: "Email Marketing", category: "marketing", kind: "http", auth: "key", base: "", ops: ["campaign", "list", "segment", "send", "template", "stats", "ab_test"] },
  { id: "content", name: "Content Studio", category: "marketing", kind: "model", auth: "none", base: "", ops: ["blog_post", "landing_copy", "ad_copy", "email_copy", "script", "seo_brief", "calendar", "repurpose", "localize"] },
  { id: "brand", name: "Brand", category: "marketing", kind: "model", auth: "none", base: "", ops: ["naming", "tagline", "tone_guide", "logo_brief", "palette", "persona", "positioning"] },

  // ---------------------------------------------------------------- social
  { id: "x", name: "X / Twitter", category: "social", kind: "http", auth: "oauth", base: "https://api.x.com/2", ops: SOCIAL },
  { id: "instagram", name: "Instagram", category: "social", kind: "http", auth: "oauth", base: "https://graph.facebook.com/v20.0", ops: SOCIAL },
  { id: "facebook", name: "Facebook", category: "social", kind: "http", auth: "oauth", base: "https://graph.facebook.com/v20.0", ops: SOCIAL },
  { id: "tiktok", name: "TikTok", category: "social", kind: "http", auth: "oauth", base: "https://open.tiktokapis.com/v2", ops: SOCIAL },
  { id: "youtube", name: "YouTube", category: "social", kind: "http", auth: "oauth", base: "https://www.googleapis.com/youtube/v3", ops: [...SOCIAL, "transcript", "comments", "analytics"] },
  { id: "pinterest", name: "Pinterest", category: "social", kind: "http", auth: "oauth", base: "https://api.pinterest.com/v5", ops: SOCIAL },
  { id: "threads", name: "Threads", category: "social", kind: "http", auth: "oauth", base: "https://graph.threads.net", ops: SOCIAL },
  { id: "snapchat", name: "Snapchat", category: "social", kind: "browser", auth: "login", base: "https://www.snapchat.com", ops: SOCIAL },
  { id: "twitch", name: "Twitch", category: "social", kind: "http", auth: "oauth", base: "https://api.twitch.tv/helix", ops: ["search", "streams", "clips", "channel", "analytics"] },

  // ---------------------------------------------------------------- finance
  { id: "stocks", name: "Stock Markets", category: "finance", kind: "http", auth: "key", base: "https://query1.finance.yahoo.com", ops: FINANCE },
  { id: "crypto", name: "Crypto Markets", category: "finance", kind: "http", auth: "none", base: "https://api.coingecko.com/api/v3", ops: [...FINANCE, "onchain", "gas", "defi_tvl"] },
  { id: "forex", name: "FX Rates", category: "finance", kind: "http", auth: "none", base: "https://api.exchangerate.host", ops: ["rate", "convert", "history", "trend"] },
  { id: "stripe", name: "Stripe", category: "finance", kind: "http", auth: "key", base: "https://api.stripe.com/v1", ops: ["customers", "charges", "subscriptions", "invoices", "refund", "payouts", "products", "payment_link"] },
  { id: "paypal", name: "PayPal", category: "finance", kind: "http", auth: "oauth", base: "https://api-m.paypal.com", ops: ["transactions", "invoice", "payout", "refund", "balance"] },
  { id: "paddle", name: "Paddle", category: "finance", kind: "http", auth: "key", base: "https://api.paddle.com", ops: ["customers", "subscriptions", "transactions", "prices", "refund"] },
  { id: "quickbooks", name: "QuickBooks", category: "finance", kind: "http", auth: "oauth", base: "https://quickbooks.api.intuit.com/v3", ops: ["invoices", "expenses", "customers", "reports", "reconcile"] },
  { id: "accounting", name: "Accounting", category: "finance", kind: "code", auth: "none", base: "", ops: ["invoice", "expense_report", "pnl", "cashflow", "budget", "tax_estimate", "vat", "payroll"] },
  { id: "banking", name: "Banking Data", category: "finance", kind: "http", auth: "oauth", base: "https://production.plaid.com", ops: ["accounts", "transactions", "balance", "categorize", "statements"] },
  { id: "market_research", name: "Market Research", category: "finance", kind: "web", auth: "none", base: "", ops: ["market_size", "competitors", "pricing_survey", "swot", "trend", "forecast", "report"] },

  // ---------------------------------------------------------------- commerce
  { id: "amazon", name: "Amazon", category: "commerce", kind: "browser", auth: "login", base: "https://www.amazon.com", ops: COMMERCE },
  { id: "shopify", name: "Shopify", category: "commerce", kind: "http", auth: "key", base: "https://admin.shopify.com/api", ops: ["products", "create_product", "orders", "customers", "inventory", "discounts", "reports"] },
  { id: "woocommerce", name: "WooCommerce", category: "commerce", kind: "http", auth: "key", base: "", ops: ["products", "orders", "customers", "coupons", "reports"] },
  { id: "etsy", name: "Etsy", category: "commerce", kind: "http", auth: "oauth", base: "https://openapi.etsy.com/v3", ops: COMMERCE },
  { id: "ebay", name: "eBay", category: "commerce", kind: "http", auth: "oauth", base: "https://api.ebay.com", ops: COMMERCE },
  { id: "aliexpress", name: "AliExpress", category: "commerce", kind: "browser", auth: "login", base: "https://www.aliexpress.com", ops: COMMERCE },
  { id: "noon", name: "Noon", category: "commerce", kind: "browser", auth: "login", base: "https://www.noon.com", ops: COMMERCE },
  { id: "jumia", name: "Jumia", category: "commerce", kind: "browser", auth: "login", base: "https://www.jumia.com.eg", ops: COMMERCE },
  { id: "pricing", name: "Price Intelligence", category: "commerce", kind: "web", auth: "none", base: "", ops: ["compare", "history", "alert", "competitor_map", "margin"] },
  { id: "logistics", name: "Shipping", category: "commerce", kind: "http", auth: "key", base: "", ops: ["rates", "label", "track", "customs", "returns"] },

  // ---------------------------------------------------------------- travel
  { id: "flights", name: "Flights", category: "travel", kind: "browser", auth: "none", base: "https://www.google.com/travel/flights", ops: ["search", "price_alert", "seat_map", "book", "check_in", "status"] },
  { id: "hotels", name: "Hotels", category: "travel", kind: "browser", auth: "none", base: "https://www.booking.com", ops: ["search", "compare", "reviews", "book", "cancel", "map"] },
  { id: "trains", name: "Trains & Buses", category: "travel", kind: "browser", auth: "none", base: "", ops: ["search", "schedule", "book", "status"] },
  { id: "maps", name: "Maps", category: "travel", kind: "http", auth: "key", base: "https://maps.googleapis.com/maps/api", ops: ["place", "directions", "distance", "traffic", "reviews", "nearby", "street_view"] },
  { id: "visa", name: "Visas & Travel Docs", category: "travel", kind: "web", auth: "none", base: "", ops: ["requirements", "appointment", "checklist", "insurance"] },
  { id: "itinerary", name: "Trip Planner", category: "travel", kind: "model", auth: "none", base: "", ops: ["plan", "budget", "day_by_day", "packing", "local_tips"] },

  // ---------------------------------------------------------------- hr
  { id: "jobs", name: "Job Market", category: "hr", kind: "web", auth: "none", base: "", ops: ["search", "company_jobs", "salary", "apply", "track", "alerts"] },
  { id: "recruiting", name: "Recruiting", category: "hr", kind: "model", auth: "none", base: "", ops: ["job_description", "screen_cv", "rank_candidates", "interview_kit", "offer_letter", "outreach"] },
  { id: "cv", name: "CV & Career", category: "hr", kind: "file", auth: "none", base: "", ops: ["build", "tailor", "ats_check", "cover_letter", "portfolio", "linkedin_optimize"] },
  { id: "hris", name: "HR Systems", category: "hr", kind: "http", auth: "oauth", base: "", ops: ["employees", "leave", "payroll", "onboarding", "reviews"] },

  // ---------------------------------------------------------------- legal
  { id: "legal", name: "Legal Drafting", category: "legal", kind: "model", auth: "none", base: "", ops: ["contract", "nda", "terms", "privacy_policy", "review_clause", "risk_flag", "translate_legal"] },
  { id: "compliance", name: "Compliance", category: "legal", kind: "web", auth: "none", base: "", ops: ["gdpr_check", "policy_gap", "audit_trail", "dpa", "soc2_map"] },
  { id: "courts", name: "Public Legal Records", category: "legal", kind: "web", auth: "none", base: "", ops: ["search_case", "company_registry", "trademark", "sanctions_check"] },

  // ---------------------------------------------------------------- support
  { id: "helpdesk", name: "Helpdesk", category: "support", kind: "http", auth: "key", base: "", ops: ["tickets", "reply", "macro", "escalate", "csat", "kb_article"] },
  { id: "intercom", name: "Intercom", category: "support", kind: "http", auth: "key", base: "https://api.intercom.io", ops: ["conversations", "reply", "contacts", "tags", "articles"] },
  { id: "zendesk", name: "Zendesk", category: "support", kind: "http", auth: "key", base: "", ops: ["tickets", "reply", "users", "macros", "reports"] },
  { id: "feedback", name: "Voice of Customer", category: "support", kind: "model", auth: "none", base: "", ops: ["collect", "themes", "sentiment", "priority", "reply_draft"] },

  // ---------------------------------------------------------------- security
  { id: "security", name: "AppSec", category: "security", kind: "code", auth: "none", base: "", ops: ["dependency_scan", "secret_scan", "sast", "headers", "ssl_check", "port_scan", "rls_review", "threat_model"] },
  { id: "breach", name: "Breach Intel", category: "security", kind: "http", auth: "key", base: "https://haveibeenpwned.com/api/v3", ops: ["email_check", "domain_check", "pastes"] },
  { id: "dns", name: "DNS & WHOIS", category: "security", kind: "http", auth: "none", base: "https://dns.google/resolve", ops: ["lookup", "whois", "mx", "spf", "dmarc", "propagation"] },
  { id: "vt", name: "Threat Scanning", category: "security", kind: "http", auth: "key", base: "https://www.virustotal.com/api/v3", ops: ["url_scan", "file_scan", "domain", "ip"] },
  { id: "identity", name: "Identity & Access", category: "security", kind: "browser", auth: "login", base: "", ops: ["signup", "login", "otp", "password_reset", "2fa", "session_check", "vault_store"] },

  // ---------------------------------------------------------------- education & misc
  { id: "learn", name: "Learning", category: "education", kind: "model", auth: "none", base: "", ops: ["curriculum", "lesson", "quiz", "flashcards", "explain", "grade", "study_plan"] },
  { id: "courses", name: "Course Catalogs", category: "education", kind: "web", auth: "none", base: "", ops: ["search", "compare", "reviews", "syllabus", "certificate"] },
  { id: "translate", name: "Translation", category: "language", kind: "model", auth: "none", base: "", ops: ["text", "document", "subtitle", "localize", "glossary", "proofread"] },
  { id: "writing", name: "Writing", category: "language", kind: "model", auth: "none", base: "", ops: ["draft", "edit", "shorten", "expand", "tone", "outline", "citation", "plagiarism_check"] },
  { id: "health", name: "Health Info", category: "health", kind: "web", auth: "none", base: "", ops: ["condition", "drug", "interaction", "guideline", "clinic_finder", "nutrition"] },
  { id: "fitness", name: "Fitness", category: "health", kind: "model", auth: "none", base: "", ops: ["plan", "macros", "log", "progress"] },
  { id: "gov", name: "Government Services", category: "gov", kind: "browser", auth: "login", base: "", ops: ["form", "appointment", "status", "payment", "documents"] },
  { id: "realestate", name: "Real Estate", category: "realestate", kind: "web", auth: "none", base: "", ops: ["search", "valuation", "yield", "neighborhood", "mortgage", "alerts"] },
  { id: "automation", name: "Workflow Automation", category: "automation", kind: "http", auth: "key", base: "", ops: ["create_flow", "run", "schedule", "webhook", "condition", "retry", "logs"] },
  { id: "scheduler", name: "Scheduler", category: "automation", kind: "data", auth: "none", base: "", ops: ["cron", "once", "recurring", "cancel", "list", "next_run"] },
  { id: "notify", name: "Notifications", category: "automation", kind: "http", auth: "key", base: "", ops: ["push", "email", "sms", "webhook", "digest"] },
  { id: "iot", name: "IoT & Smart Home", category: "iot", kind: "http", auth: "oauth", base: "", ops: ["devices", "state", "command", "scene", "history"] },
  { id: "blockchain", name: "Blockchain", category: "web3", kind: "http", auth: "none", base: "https://api.etherscan.io/api", ops: ["balance", "tx", "contract", "nft", "gas", "events"] },
  { id: "wallet", name: "Wallets", category: "web3", kind: "http", auth: "key", base: "", ops: ["balance", "send", "history", "tokens", "approve"] },
  { id: "design", name: "Design", category: "design", kind: "model", auth: "none", base: "", ops: ["moodboard", "wireframe", "ui_spec", "palette", "icon", "mockup", "critique"] },
  { id: "figma", name: "Figma", category: "design", kind: "http", auth: "oauth", base: "https://api.figma.com/v1", ops: ["file", "nodes", "export", "comments", "components"] },
  { id: "canva", name: "Canva", category: "design", kind: "browser", auth: "login", base: "https://www.canva.com", ops: ["create", "template", "export", "brand_kit"] },
  { id: "podcast", name: "Podcasts", category: "media", kind: "web", auth: "none", base: "", ops: ["search", "episode", "transcript", "clip", "summary"] },
  { id: "music", name: "Music", category: "media", kind: "http", auth: "oauth", base: "https://api.spotify.com/v1", ops: ["search", "playlist", "create_playlist", "recommend", "analysis"] },
  { id: "sports", name: "Sports", category: "media", kind: "web", auth: "none", base: "", ops: ["scores", "fixtures", "standings", "player", "odds", "news"] },
  { id: "events", name: "Events & Tickets", category: "media", kind: "browser", auth: "none", base: "", ops: ["search", "compare", "book", "remind"] },
  { id: "food", name: "Food & Delivery", category: "lifestyle", kind: "browser", auth: "login", base: "", ops: ["search", "menu", "order", "track", "reviews"] },
  { id: "cars", name: "Automotive", category: "lifestyle", kind: "web", auth: "none", base: "", ops: ["search", "valuation", "specs", "history_check", "insurance"] },
  { id: "insurance", name: "Insurance", category: "lifestyle", kind: "web", auth: "none", base: "", ops: ["compare", "quote", "claim", "policy_review"] },
  { id: "utilities", name: "Utilities & Bills", category: "lifestyle", kind: "browser", auth: "login", base: "", ops: ["balance", "pay", "history", "dispute"] },
  { id: "memory", name: "Agent Memory", category: "core", kind: "data", auth: "none", base: "", ops: ["remember", "recall", "forget", "profile", "timeline"] },
  { id: "files", name: "Run Workspace", category: "core", kind: "file", auth: "none", base: "", ops: ["write", "read", "list", "delete", "zip", "share"] },
  { id: "human", name: "Human In The Loop", category: "core", kind: "data", auth: "none", base: "", ops: ["ask", "confirm", "approve", "handover"] },
];

/** Human labels for the generated operation ids. */
const OP_LABEL: Record<string, string> = {
  search: "search",
  get: "fetch one record",
  list: "list records",
  create: "create",
  update: "update",
  delete: "delete",
  export: "export",
};

function buildCatalog(): CatalogTool[] {
  const out: CatalogTool[] = [];
  for (const svc of SERVICES) {
    for (const op of svc.ops) {
      out.push({
        id: `${svc.id}.${op}`,
        service: svc.id,
        serviceName: svc.name,
        op,
        name: `${svc.name}: ${OP_LABEL[op] ?? op.replace(/_/g, " ")}`,
        category: svc.category,
        kind: svc.kind,
        auth: svc.auth,
        base: svc.base,
        keywords: `${svc.id} ${svc.name} ${svc.category} ${op}`.toLowerCase(),
      });
    }
  }
  return out;
}

export const CATALOG: CatalogTool[] = buildCatalog();
export const CATALOG_SIZE = CATALOG.length;

const BY_ID = new Map(CATALOG.map((t) => [t.id, t]));

export function getCatalogTool(id: string): CatalogTool | undefined {
  return BY_ID.get(id.trim().toLowerCase());
}

export function catalogCategories(): { category: string; count: number }[] {
  const map = new Map<string, number>();
  for (const t of CATALOG) map.set(t.category, (map.get(t.category) ?? 0) + 1);
  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Ranks tools against a plain-language need. Scoring is intentionally simple
 * (token overlap + service/op boosts) so it stays fast and predictable in the
 * browser; the model does the final pick from the shortlist.
 */
export function searchCatalog(query: string, limit = 12): CatalogTool[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1);
  if (!tokens.length) return CATALOG.slice(0, limit);

  const scored = CATALOG.map((tool) => {
    let score = 0;
    for (const token of tokens) {
      if (tool.id === token) score += 12;
      if (tool.service === token) score += 6;
      if (tool.op === token) score += 5;
      if (tool.category === token) score += 3;
      if (tool.keywords.includes(token)) score += 2;
      if (tool.op.includes(token) || token.includes(tool.op)) score += 1;
    }
    return { tool, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => s.tool);
}

/** Compact rendering the model reads inside a tool observation. */
export function renderTools(tools: CatalogTool[]): string {
  if (!tools.length) return "No matching tool. Use web.search, sandbox.run_js or devbox.* instead.";
  return tools
    .map((t) => `- ${t.id} — ${t.name} [${t.kind}${t.auth === "none" ? "" : `, needs ${t.auth}`}]`)
    .join("\n");
}
