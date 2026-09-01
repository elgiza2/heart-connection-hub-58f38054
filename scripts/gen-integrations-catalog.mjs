/**
 * Regenerates src/lib/integrationsCatalog.generated.ts from the public
 * Pipedream component registry (github.com/PipedreamHQ/pipedream/components).
 *
 * Every app in that registry already ships ready-made actions + triggers, so
 * anything listed here can be connected through the existing
 * `pipedream-connect` edge function without extra backend work.
 *
 * Usage: node scripts/gen-integrations-catalog.mjs [limit]
 */
import { writeFileSync } from "node:fs";

const LIMIT = Number(process.argv[2] ?? 1000);
const TREE_URL =
  "https://api.github.com/repos/PipedreamHQ/pipedream/git/trees/master?recursive=1";

/** Apps that are famous enough to be pinned to the front of the catalog. */
const PRIORITY = [
  "slack_v2","google_sheets","gmail","google_drive","google_calendar","google_docs","notion","airtable_oauth",
  "hubspot","salesforce_rest_api","stripe","shopify","github","gitlab","jira","linear","asana","trello","clickup",
  "monday","zoom_admin","microsoft_teams","microsoft_outlook","microsoft_excel","microsoft_onedrive","sharepoint",
  "dropbox","box","aws","google_cloud","azure_devops","cloudflare","vercel","netlify","digitalocean","supabase_management_api",
  "mongodb","postgresql","mysql","redis","snowflake","bigquery","databricks","openai","anthropic","google_gemini",
  "perplexity","hugging_face","elevenlabs","stability_ai","replicate","pinecone","twilio","sendgrid","mailgun",
  "mailchimp","klaviyo","brevo","activecampaign","intercom","zendesk","freshdesk","front","help_scout","crisp",
  "hootsuite","buffer","linkedin","twitter","facebook_pages","instagram_business","youtube_data_api","tiktok",
  "pinterest","reddit","discord","telegram_bot_api","whatsapp_business","google_ads","facebook_conversions_api",
  "google_analytics","google_analytics_4","mixpanel","amplitude","segment","posthog","hotjar","semrush","ahrefs",
  "quickbooks","xero","freshbooks","paypal","square","razorpay","paddle","chargebee","recurly","wise","plaid",
  "docusign","dropbox_sign","pandadoc","adobe_acrobat_sign","typeform","jotform","google_forms","surveymonkey",
  "calendly","cal_com","acuity_scheduling","zoho_crm","zoho_desk","zoho_books","pipedrive","copper","close",
  "attio","apollo_io","clearbit","zoominfo","lusha","snov_io","instantly","lemlist","smartlead_ai","woodpecker",
  "workday","bamboohr","gusto","rippling","greenhouse","lever","workable","jazzhr","adp_workforce_now",
  "servicenow","pagerduty","opsgenie","datadog","new_relic","sentry","grafana","better_stack","statuspage",
  "jenkins","circleci","docker_hub","bitbucket","npm","figma","canva","adobe_creative_cloud","miro","loom",
  "webflow","wordpress_org","wix","squarespace","framer","contentful","sanity","strapi","ghost_org","medium",
  "woocommerce","bigcommerce","magento","etsy","ebay","amazon_seller_central","walmart","shipstation","shippo",
  "stripe_connect","toggl","harvest","clockify","jira_service_desk","confluence","basecamp","wrike","smartsheet",
  "todoist","evernote","obsidian","onenote","coda","dropbox_paper","notion_api","google_slides","google_tasks",
  "google_chat","google_contacts","google_my_business","youtube_analytics","vimeo","twitch","spotify","apple_app_store",
  "google_play","firebase_admin_sdk","onesignal","pusher","expo","zapier","make","n8n_io","airtable","retool",
  "salesforce_marketing_cloud","marketo","pardot","eloqua","braze","customer_io","iterable","sendinblue","postmark",
  "resend","amazon_ses","mandrill","drip","omnisend","constant_contact","aweber","getresponse","moosend",
  "shopify_developer_app","stripe_app","quickbooks_sandbox","netsuite","sap","oracle","ibm_watson","tableau",
  "power_bi","looker","metabase","domo","airbyte","fivetran","dbt_cloud","google_search_console","bing_webmaster_tools",
];

const CATEGORY_RULES = [
  [/(^|_)(github|gitlab|bitbucket|jenkins|circleci|docker|npm|vercel|netlify|render|railway|heroku|fly|cloudflare|aws|azure|gcp|google_cloud|supabase|firebase|mongodb|postgres|mysql|redis|sentry|datadog|new_relic|grafana|pagerduty|opsgenie|deploy|kubernetes|terraform|linode|vultr|namecheap|godaddy|dns|ssh|webhook_?relay)/, "Development"],
  [/(mail|smtp|email|newsletter|sendgrid|mailgun|postmark|resend|klaviyo|mailchimp|brevo|drip|campaign)/, "Marketing"],
  [/(slack|discord|teams|telegram|whatsapp|chat|sms|twilio|voice|call|zoom|meet|webex|messenger|signal)/, "Communication"],
  [/(crm|sales|hubspot|salesforce|pipedrive|close|lead|prospect|apollo|outreach|deal)/, "Sales & CRM"],
  [/(pay|billing|invoice|stripe|paypal|square|checkout|subscription|accounting|quickbooks|xero|book)/, "Payments & Finance"],
  [/(drive|dropbox|box|storage|s3|file|onedrive|sharepoint|bucket)/, "Storage"],
  [/(analytic|mixpanel|amplitude|segment|posthog|tracking|metrics|bi|looker|tableau|dashboard|warehouse|snowflake|bigquery)/, "Analytics"],
  [/(ai|gpt|openai|anthropic|llm|gemini|claude|ml|vision|speech|voice_ai|replicate|huggingface|hugging_face|stability|eleven)/, "AI"],
  [/(shop|store|commerce|ecommerce|etsy|ebay|amazon|woo|magento|product|order|ship)/, "E-commerce"],
  [/(support|helpdesk|ticket|zendesk|freshdesk|intercom|desk|service)/, "Support"],
  [/(social|twitter|facebook|instagram|linkedin|tiktok|reddit|pinterest|youtube|threads|buffer|hootsuite)/, "Social"],
  [/(hr|recruit|hiring|payroll|employee|people|greenhouse|lever|workable|bamboo|gusto)/, "HR & Recruiting"],
  [/(design|figma|canva|photo|image|video|creative|adobe|media)/, "Design & Media"],
  [/(calendar|schedul|booking|appointment|calendly|meeting|event)/, "Scheduling"],
  [/(form|survey|typeform|jotform|poll|quiz)/, "Forms & Surveys"],
  [/(doc|sign|pdf|contract|esign|notion|coda|wiki|confluence|note)/, "Documents"],
  [/(task|project|asana|trello|clickup|monday|jira|linear|todo|kanban|sprint)/, "Productivity"],
  [/(seo|ads|advert|adwords|keyword|semrush|ahrefs|search_console|ppc)/, "Marketing"],
  [/(zapier|make|n8n|automat|workflow|integrat|webhook|pipe)/, "Automation"],
  [/(cms|wordpress|webflow|wix|squarespace|contentful|sanity|strapi|ghost|blog|site)/, "Website & CMS"],
  [/(crypto|coin|bitcoin|binance|wallet|blockchain|nft|web3)/, "Crypto & Web3"],
  [/(bank|loan|tax|expense|payroll_?tax|finance|budget|ledger)/, "Payments & Finance"],
  [/(school|course|learn|student|education|training|lms)/, "Education"],
  [/(health|medical|patient|clinic|fitness|therapy|dental)/, "Health"],
  [/(travel|flight|hotel|booking_?com|airbnb|maps|location|weather)/, "Travel & Location"],
  [/(real_?estate|property|rental|tenant|lease)/, "Real Estate"],
  [/(legal|law|compliance|contract|gdpr|policy)/, "Legal & Compliance"],
  [/(print|label|logistic|delivery|courier|warehouse|inventory|fleet|supply)/, "Logistics"],
  [/(restaurant|food|menu|pos|retail|salon|spa|booking)/, "Retail & Local"],
  [/(sheet|table|database|data|etl|sync|import|export)/, "Data"],
  [/(sign|verify|auth|identity|password|security|scan|firewall|vpn)/, "Security & Identity"],
  [/(review|reputation|feedback|nps|testimonial)/, "Reviews & Feedback"],
  [/(call|dial|phone|telephony|ivr|contact_?center)/, "Communication"],
  [/(subscription|member|community|forum|donat|fundrais|nonprofit)/, "Community"],
];

const NAME_OVERRIDES = {
  openai: "OpenAI",
  quickbooks: "QuickBooks",
  pagerduty: "PagerDuty",
  clickup: "ClickUp",
  hubspot: "HubSpot",
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  whatsapp_business: "WhatsApp Business",
  paypal: "PayPal",
  woocommerce: "WooCommerce",
  wordpress: "WordPress",
  bigcommerce: "BigCommerce",
  activecampaign: "ActiveCampaign",
  getresponse: "GetResponse",
  aweber: "AWeber",
  mailerlite: "MailerLite",
  sendgrid: "SendGrid",
  mailchimp: "Mailchimp",
  convertkit: "Kit (ConvertKit)",
  surveymonkey: "SurveyMonkey",
  typeform: "Typeform",
  jotform: "Jotform",
  docusign: "DocuSign",
  pandadoc: "PandaDoc",
  bamboohr: "BambooHR",
  jazzhr: "JazzHR",
  servicenow: "ServiceNow",
  freshdesk: "Freshdesk",
  freshbooks: "FreshBooks",
  freshsales: "Freshsales",
  zendesk: "Zendesk",
  intercom: "Intercom",
  datadog: "Datadog",
  new_relic: "New Relic",
  netsuite: "NetSuite",
  dataforseo: "DataForSEO",
  semrush: "Semrush",
  ahrefs: "Ahrefs",
  mailgun: "Mailgun",
  onesignal: "OneSignal",
  circleci: "CircleCI",
  docker_hub: "Docker Hub",
  digitalocean: "DigitalOcean",
  mongodb: "MongoDB",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  snowflake: "Snowflake",
  bigquery: "BigQuery",
  aws: "AWS",
  google_cloud: "Google Cloud",
  azure_devops: "Azure DevOps",
  cloudflare: "Cloudflare",
  vercel: "Vercel",
  netlify: "Netlify",
  shopify: "Shopify",
  woodpecker: "Woodpecker",
  instantly: "Instantly",
  lemlist: "lemlist",
  smartsheet: "Smartsheet",
  monday: "monday.com",
  asana: "Asana",
  trello: "Trello",
  notion: "Notion",
  airtable: "Airtable",
  zoho_crm: "Zoho CRM",
  zoho_books: "Zoho Books",
  pipedrive: "Pipedrive",
  copper: "Copper",
  close: "Close",
  attio: "Attio",
  clearbit: "Clearbit",
  zoominfo: "ZoomInfo",
  lusha: "Lusha",
  greenhouse: "Greenhouse",
  lever: "Lever",
  workable: "Workable",
  gusto: "Gusto",
  rippling: "Rippling",
  workday: "Workday",
  xero: "Xero",
  razorpay: "Razorpay",
  paddle: "Paddle",
  chargebee: "Chargebee",
  recurly: "Recurly",
  plaid: "Plaid",
  stripe: "Stripe",
  square: "Square",
  twilio: "Twilio",
  discord: "Discord",
  reddit: "Reddit",
  pinterest: "Pinterest",
  figma: "Figma",
  canva: "Canva",
  miro: "Miro",
  loom: "Loom",
  webflow: "Webflow",
  wix: "Wix",
  squarespace: "Squarespace",
  contentful: "Contentful",
  sanity: "Sanity",
  strapi: "Strapi",
  medium: "Medium",
  etsy: "Etsy",
  ebay: "eBay",
  walmart: "Walmart",
  shipstation: "ShipStation",
  shippo: "Shippo",
  toggl: "Toggl",
  harvest: "Harvest",
  clockify: "Clockify",
  confluence: "Confluence",
  basecamp: "Basecamp",
  wrike: "Wrike",
  todoist: "Todoist",
  evernote: "Evernote",
  onenote: "OneNote",
  coda: "Coda",
  vimeo: "Vimeo",
  twitch: "Twitch",
  spotify: "Spotify",
  firebase: "Firebase",
  pusher: "Pusher",
  expo: "Expo",
  zapier: "Zapier",
  make: "Make",
  retool: "Retool",
  marketo: "Marketo",
  braze: "Braze",
  customer_io: "Customer.io",
  iterable: "Iterable",
  sendinblue: "Brevo (Sendinblue)",
  brevo: "Brevo",
  resend: "Resend",
  drip: "Drip",
  omnisend: "Omnisend",
  constant_contact: "Constant Contact",
  moosend: "Moosend",
  klaviyo: "Klaviyo",
  tableau: "Tableau",
  looker: "Looker",
  metabase: "Metabase",
  domo: "Domo",
  airbyte: "Airbyte",
  fivetran: "Fivetran",
  anthropic: "Anthropic (Claude)",
  perplexity: "Perplexity",
  elevenlabs: "ElevenLabs",
  replicate: "Replicate",
  pinecone: "Pinecone",
  jira: "Jira",
  linear: "Linear",
  sentry: "Sentry",
  grafana: "Grafana",
  jenkins: "Jenkins",
  npm: "npm",
  google_search_console: "Google Search Console",
  slack_v2: "Slack",
  airtable_oauth: "Airtable",
  salesforce_rest_api: "Salesforce",
  youtube_data_api: "YouTube",
  supabase_management_api: "Supabase",
  zoom_admin: "Zoom",
  telegram_bot_api: "Telegram",
  google_analytics_4: "Google Analytics 4",
  cal_com: "Cal.com",
  n8n_io: "n8n",
  apollo_io: "Apollo.io",
  snov_io: "Snov.io",
  wordpress_org: "WordPress",
  ghost_org: "Ghost",
  shopify_developer_app: "Shopify",
  firebase_admin_sdk: "Firebase",
  dbt_cloud: "dbt Cloud",
  smartlead_ai: "Smartlead",
  stability_ai: "Stability AI",
  hugging_face: "Hugging Face",
  google_gemini: "Google Gemini",
  microsoft_excel: "Microsoft Excel",
  power_bi: "Power BI",
};

const DOMAIN_OVERRIDES = {
  slack_v2: "slack.com",
  airtable_oauth: "airtable.com",
  salesforce_rest_api: "salesforce.com",
  youtube_data_api: "youtube.com",
  supabase_management_api: "supabase.com",
  zoom_admin: "zoom.us",
  telegram_bot_api: "telegram.org",
  google_sheets: "google.com",
  google_docs: "google.com",
  google_drive: "google.com",
  google_calendar: "google.com",
  google_ads: "google.com",
  google_analytics: "google.com",
  google_analytics_4: "google.com",
  gmail: "google.com",
  cal_com: "cal.com",
  n8n_io: "n8n.io",
  apollo_io: "apollo.io",
  snov_io: "snov.io",
  wordpress_org: "wordpress.org",
  ghost_org: "ghost.org",
  shopify_developer_app: "shopify.com",
  notion: "notion.so",
  openai: "openai.com",
  microsoft_teams: "microsoft.com",
  microsoft_outlook: "microsoft.com",
  microsoft_excel: "microsoft.com",
  microsoft_onedrive: "microsoft.com",
};

const SKIP = /(sandbox|_test$|^test_|example|pipedream_utils|_dev$|dummy|demo|deprecated)/;

const ACRONYMS = new Set([
  "ai","api","aws","bi","cdn","cms","crm","css","csv","erp","faq","ftp","gcp","hr","html","http","id","io","ip",
  "kpi","llm","ocr","pdf","ppc","qr","rss","saas","sdk","seo","sftp","sms","sql","ssl","svg","ui","url","ux","vat","xml",
]);

function toName(slug) {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug
    .replace(/_v\d+$/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function toDomain(slug) {
  if (DOMAIN_OVERRIDES[slug]) return DOMAIN_OVERRIDES[slug];
  const base = slug.replace(/_v\d+$/, "").replace(/_(api|app|oauth|rest_api|admin|developer_app)$/, "");
  if (/_io$/.test(base)) return `${base.replace(/_io$/, "")}.io`;
  if (/_ai$/.test(base)) return `${base.replace(/_ai$/, "")}.ai`;
  if (/_com$/.test(base)) return `${base.replace(/_com$/, "")}.com`;
  return `${base.replace(/_/g, "")}.com`;
}

function toCategory(slug) {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(slug)) return cat;
  return "Business Apps";
}

const res = await fetch(TREE_URL, {
  headers: { "User-Agent": "megsy-integrations-generator", Accept: "application/vnd.github+json" },
});
if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status} ${await res.text()}`);
const tree = await res.json();

const counts = new Map();
for (const node of tree.tree) {
  if (node.type !== "blob" || !node.path.startsWith("components/")) continue;
  const slug = node.path.split("/")[1];
  if (!slug || SKIP.test(slug)) continue;
  counts.set(slug, (counts.get(slug) ?? 0) + 1);
}

// Drop legacy duplicates: prefer the variant with more ready-made components.
const byBase = new Map();
for (const [slug, count] of counts) {
  const base = slug.replace(/_v\d+$/, "").replace(/_(oauth|rest_api|developer_app|admin|bot_api|management_api)$/, "");
  const prev = byBase.get(base);
  const score = count + (PRIORITY.includes(slug) ? 10_000 : 0);
  if (!prev || score > prev.score) byBase.set(base, { slug, count, score });
}

const ranked = [...byBase.values()].sort((a, b) => b.score - a.score).slice(0, LIMIT);

const entries = ranked.map(({ slug, count }) => {
  const name = toName(slug);
  const category = toCategory(slug);
  return {
    id: slug.replace(/_/g, "-"),
    name,
    description: `Connect ${name} and run its ${count > 12 ? "actions and triggers" : "actions"} straight from chat.`,
    category,
    app: slug,
    type: "pipedream",
    pipedreamSlug: slug,
    domain: toDomain(slug),
  };
});

const body = entries
  .map(
    (e) => `  {
    id: ${JSON.stringify(e.id)},
    name: ${JSON.stringify(e.name)},
    description: ${JSON.stringify(e.description)},
    category: ${JSON.stringify(e.category)},
    app: ${JSON.stringify(e.app)},
    type: "pipedream",
    pipedreamSlug: ${JSON.stringify(e.pipedreamSlug)},
    domain: ${JSON.stringify(e.domain)},
  },`,
  )
  .join("\n");

const out = `// AUTO-GENERATED by scripts/gen-integrations-catalog.mjs — do not edit by hand.
// Source: the public Pipedream component registry
// (github.com/PipedreamHQ/pipedream/components), ranked by how many ready-made
// actions/triggers each app ships, with the most widely used business apps
// pinned to the top. Every entry connects through the existing
// \`pipedream-connect\` edge function.
import type { Integration } from "./integrationsData";

export const generatedIntegrations: Integration[] = [
${body}
];

export default generatedIntegrations;
`;

writeFileSync(new URL("../src/lib/integrationsCatalog.generated.ts", import.meta.url), out);
console.log(`wrote ${entries.length} integrations`);
