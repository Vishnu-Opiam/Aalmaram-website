const domain = process.env.SHOPIFY_DOMAIN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

async function test() {
  const tokenRes = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
  });
  const token = (await tokenRes.json()).access_token;
  
  const adminRes = await fetch(`https://${domain}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: 'mutation { draftOrderCreate(input: {lineItems: [{title: "test", quantity: 1, originalUnitPrice: "10.00"}]}) { draftOrder { invoiceUrl } userErrors { message } } }' })
  });
  console.log('Draft Order:', await adminRes.text());
}
test();
