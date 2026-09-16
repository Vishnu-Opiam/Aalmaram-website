/**
 * Builds the n8n workflows that consume the new store's events, from the
 * Shopify-triggered originals at the repo root.
 *
 *     node scripts/n8n/build-commerce-workflows.mjs
 *
 * Writes to docs/custom-commerce/n8n/. The originals are left alone.
 *
 * The outbox sends each order event with a Shopify-shaped order at the top of
 * the body (see src/lib/outbox.ts), and every original code node already reads
 * `$json.body ?? $json`. So for the order flows the change is only the trigger:
 * a Shopify Trigger node becomes a Webhook node guarded by header auth. Flows 1,
 * 2 and 2b all fired on Shopify's orders/create; here they hang off one
 * `order.paid` webhook, because the store sends each event to one URL.
 *
 * Flows 5 and 6 read Shopify's API directly, so their Shopify nodes are
 * replaced: Flow 5 asks /api/integrations/summary, and Flow 6 is fed by the
 * store's own `inventory.low` event.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs", "custom-commerce", "n8n");
mkdirSync(OUT, { recursive: true });

const load = (file) => JSON.parse(readFileSync(join(ROOT, file), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Stable ids, so regenerating doesn't churn every node in a diff or an import. */
const nodeId = (...parts) => {
  const h = createHash("sha256").update(parts.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

const TOKEN_CREDENTIAL = {
  httpHeaderAuth: { id: "REPLACE_AALMARAM_TOKEN_CRED_ID", name: "Aalmaram store token" },
};

function webhookNode(workflow, path, position) {
  return {
    parameters: {
      httpMethod: "POST",
      path,
      authentication: "headerAuth",
      responseMode: "onReceived",
      options: {},
    },
    id: nodeId(workflow, "webhook"),
    name: "Aalmaram Webhook",
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    position,
    webhookId: path,
    credentials: clone(TOKEN_CREDENTIAL),
  };
}

function replaceExactly(text, from, to, where) {
  if (!text.includes(from)) throw new Error(`${where}: expected to find ${JSON.stringify(from.slice(0, 80))}`);
  return text.split(from).join(to);
}

function workflow(name, nodes, connections) {
  const names = nodes.map((n) => n.name);
  const duplicate = names.find((n, i) => names.indexOf(n) !== i);
  if (duplicate) throw new Error(`${name}: two nodes are called ${duplicate}`);
  for (const [from, { main }] of Object.entries(connections)) {
    if (!names.includes(from)) throw new Error(`${name}: connection from unknown node ${from}`);
    for (const branch of main) {
      for (const c of branch) {
        if (!names.includes(c.node)) throw new Error(`${name}: connection to unknown node ${c.node}`);
      }
    }
  }
  return { name, nodes, connections, settings: { executionOrder: "v1" }, active: false, pinData: {} };
}

function write(file, wf) {
  writeFileSync(join(OUT, file), JSON.stringify(wf, null, 2) + "\n", "utf8");
  console.log(`wrote docs/custom-commerce/n8n/${file} (${wf.nodes.length} nodes)`);
}

/** Every node except the Shopify trigger, shifted, plus the connections among them. */
function body(source, { dx = 0, dy = 0, key }) {
  const trigger = source.nodes.find((n) => n.type === "n8n-nodes-base.shopifyTrigger");
  const nodes = source.nodes
    .filter((n) => n !== trigger)
    .map((n) => ({
      ...clone(n),
      id: nodeId(key, n.name),
      position: [n.position[0] + dx, n.position[1] + dy],
    }));
  const connections = clone(source.connections);
  const first = trigger ? connections[trigger.name].main[0].map((c) => c.node) : [];
  if (trigger) delete connections[trigger.name];
  return { nodes, connections, first };
}

// ── order.paid → Flows 1, 2, 2b, and newsletter opt-in ───────────────────────

{
  const zoho = body(load("shopify-zoho-books-workflow.json"), { dy: -520, key: "paid-zoho" });
  const people = body(load("shopify-nocodb-people-workflow.json"), { dy: -40, key: "paid-people" });
  const interactions = body(load("shopify-nocodb-interactions-workflow.json"), { dy: 420, key: "paid-interactions" });

  // Contacts created from a store order were labelled "Shopify"; they aren't now.
  for (const node of people.nodes) {
    if (node.name === "NocoDB: Create Contact") {
      node.parameters.jsonBody = replaceExactly(node.parameters.jsonBody, "source: 'Shopify'", "source: 'Website'", node.name);
    }
  }
  for (const node of interactions.nodes) {
    if (node.name === "Build Purchase") {
      node.parameters.jsCode = replaceExactly(node.parameters.jsCode, "`SHOP-${", "`WEB-${", node.name);
    }
  }

  const optIn = [
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, typeValidation: "loose" },
          conditions: [
            {
              id: "cond-opted-in",
              leftValue: "={{ (($json.body ?? $json).data || {}).accepts_marketing === true }}",
              rightValue: true,
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      id: nodeId("paid-optin", "if"),
      name: "Ticked the newsletter box?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [-140, 900],
    },
    {
      parameters: {
        method: "POST",
        url: "https://n8n.opiamanalytics.com/webhook/newsletter-signup",
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          "={{ JSON.stringify({\n  email: ($('Aalmaram Webhook').item.json.body ?? $('Aalmaram Webhook').item.json).email,\n  name: [(($('Aalmaram Webhook').item.json.body ?? $('Aalmaram Webhook').item.json).customer || {}).first_name, (($('Aalmaram Webhook').item.json.body ?? $('Aalmaram Webhook').item.json).customer || {}).last_name].filter(Boolean).join(' ')\n}) }}",
        options: {},
      },
      id: nodeId("paid-optin", "subscribe"),
      name: "Newsletter: Subscribe Buyer",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [100, 820],
    },
    {
      parameters: {},
      id: nodeId("paid-optin", "skip"),
      name: "No Opt-In — Skip",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [100, 980],
    },
  ];

  const webhook = webhookNode("order-paid", "aalmaram-order-paid", [-600, 300]);
  const nodes = [webhook, ...zoho.nodes, ...people.nodes, ...interactions.nodes, ...optIn];
  const connections = {
    [webhook.name]: {
      main: [
        [...zoho.first, ...people.first, ...interactions.first, "Ticked the newsletter box?"].map((node) => ({
          node,
          type: "main",
          index: 0,
        })),
      ],
    },
    ...zoho.connections,
    ...people.connections,
    ...interactions.connections,
    "Ticked the newsletter box?": {
      main: [
        [{ node: "Newsletter: Subscribe Buyer", type: "main", index: 0 }],
        [{ node: "No Opt-In — Skip", type: "main", index: 0 }],
      ],
    },
  };

  write("order-paid-workflow.json", workflow("Aalmaram order.paid → Zoho invoice, NocoDB contact + interaction, newsletter", nodes, connections));
}

// ── order.delivered → Flow 3 ─────────────────────────────────────────────────

{
  const flow = body(load("flow3-post-purchase-workflow.json"), { key: "delivered" });
  const webhook = webhookNode("order-delivered", "aalmaram-order-delivered", [-600, 300]);
  const connections = {
    [webhook.name]: { main: [flow.first.map((node) => ({ node, type: "main", index: 0 }))] },
    ...flow.connections,
  };
  write("order-delivered-workflow.json", workflow("Aalmaram order.delivered → post-purchase emails (Flow 3)", [webhook, ...flow.nodes], connections));
}

// ── inventory.low → Flow 6 ───────────────────────────────────────────────────

{
  const source = load("flow6-low-inventory-workflow.json");
  const alert = clone(source.nodes.find((n) => n.name === "Build Alert"));
  const resend = clone(source.nodes.find((n) => n.name === "Resend: Alert Nivedith"));

  const original = alert.parameters.jsCode;
  const tail = original.slice(original.indexOf("const reorder"));
  if (!tail.startsWith("const reorder")) throw new Error("Flow 6: Build Alert code changed shape");

  alert.parameters.jsCode =
    "// Build the low-stock alert email from the store's inventory.low event.\n" +
    "// The store decides the threshold (Settings → Inventory) and fires once per crossing.\n" +
    "const p = $input.first().json.body ?? $input.first().json;\n" +
    "const d = p.data || {};\n" +
    "const available = Number(p.current_available ?? d.available);\n" +
    "const threshold = Number(d.threshold ?? 5);\n" +
    "const title = (d.product_title || 'A product') + (d.variant_title && d.variant_title !== 'Default' ? ' — ' + d.variant_title : '');\n\n" +
    replaceExactly(tail, "(threshold: 10)", "(threshold: ${threshold})", "Flow 6 Build Alert");
  alert.id = nodeId("inventory-low", alert.name);
  alert.position = [-340, 300];
  resend.id = nodeId("inventory-low", resend.name);
  resend.position = [-100, 300];

  const webhook = webhookNode("inventory-low", "aalmaram-inventory-low", [-600, 300]);
  write(
    "inventory-low-workflow.json",
    workflow("Aalmaram inventory.low → stock alert (Flow 6)", [webhook, alert, resend], {
      [webhook.name]: { main: [[{ node: alert.name, type: "main", index: 0 }]] },
      [alert.name]: { main: [[{ node: resend.name, type: "main", index: 0 }]] },
    })
  );
}

// ── Weekly digest → Flow 5, reading the store instead of Shopify ─────────────

{
  const source = load("flow5-weekly-digest-workflow.json");
  const nodes = clone(source.nodes).map((n) => ({ ...n, id: nodeId("digest", n.name) }));
  const shopify = nodes.find((n) => n.name === "Shopify: Last 7 Days Orders");
  if (!shopify) throw new Error("Flow 5: Shopify orders node not found");

  const STORE = "Aalmaram: Last 7 Days";
  shopify.name = STORE;
  shopify.parameters = {
    method: "GET",
    url: "https://aalmaram.com/api/integrations/summary",
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendQuery: true,
    queryParameters: { parameters: [{ name: "days", value: "7" }] },
    options: {},
  };
  shopify.credentials = clone(TOKEN_CREDENTIAL);

  const compile = nodes.find((n) => n.name === "Compile Digest");
  let code = compile.parameters.jsCode;
  code = replaceExactly(
    code,
    "const ordersResp = $('Shopify: Last 7 Days Orders').first().json;\nconst orders = ordersResp.orders || [];\nconst orderCount = orders.length;\nconst revenue = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);",
    `const store = $('${STORE}').first().json;\nconst orderCount = Number(store.orders || 0);\n// Net of refunds, in rupees.\nconst revenue = Number(store.net_revenue_paise || 0) / 100;`,
    "Flow 5 Compile Digest"
  );
  code = replaceExactly(
    code,
    "const lowStockNote = ''; // Flow 6 alerts in real time; add a stock check here later if wanted",
    "const lowStock = store.low_stock || [];\nconst lowStockNote = lowStock.length\n  ? 'Low stock: ' + lowStock.map((v) => `${v.title} (${v.available})`).join(', ')\n  : '';",
    "Flow 5 Compile Digest"
  );
  compile.parameters.jsCode = code;

  const connections = JSON.parse(
    JSON.stringify(source.connections).split('"Shopify: Last 7 Days Orders"').join(JSON.stringify(STORE))
  );
  write("weekly-digest-workflow.json", workflow("Aalmaram weekly digest (Flow 5)", nodes, connections));
}
