// netlify/functions/stripe-webhook.js
//
// Stripe calls this automatically whenever a checkout finishes — we verify
// the request really came from Stripe (using the webhook signing secret),
// then send two emails via Resend: one to the business owner, one to the
// customer. Nothing here trusts data from the browser; it all comes from
// Stripe's own verified session.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const OWNER_EMAIL = 'andrewclark0609@gmail.com';
const FROM_EMAIL = 'SIGNAL Orders <onboarding@resend.dev>'; // swap to your own verified domain in Resend once you have one

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('Resend error:', errText);
  }
}

function formatMoney(amount, currency) {
  return (amount / 100).toLocaleString('en-GB', { style: 'currency', currency: currency.toUpperCase() });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: 'Webhook signature verification failed' };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      const customerEmail = session.customer_details && session.customer_details.email;
      const customerName = session.customer_details && session.customer_details.name;
      const shipping = session.shipping_details;
      const total = formatMoney(session.amount_total, session.currency);

      const itemsHtml = lineItems.data.map(li =>
        `<tr><td style="padding:6px 0;">${li.description}</td><td style="padding:6px 0; text-align:right;">${formatMoney(li.amount_total, session.currency)}</td></tr>`
      ).join('');

      const shippingHtml = shipping ?
        `${shipping.name}<br>${shipping.address.line1}${shipping.address.line2 ? '<br>' + shipping.address.line2 : ''}<br>${shipping.address.city}, ${shipping.address.postal_code}<br>${shipping.address.country}`
        : 'Not provided';

      // Email to the business owner
      await sendEmail({
        to: OWNER_EMAIL,
        subject: 'New order — ' + total,
        html: `
          <h2 style="font-family:monospace;">New order received</h2>
          <table style="width:100%; border-collapse:collapse; font-family:monospace; font-size:14px;">${itemsHtml}</table>
          <p style="font-family:monospace; font-size:16px;"><b>Total: ${total}</b></p>
          <p><b>Customer:</b> ${customerName || '—'} (${customerEmail || '—'})</p>
          <p><b>Phone:</b> ${session.customer_details && session.customer_details.phone || '—'}</p>
          <p><b>Shipping to:</b><br>${shippingHtml}</p>
          <p style="color:#888; font-size:12px;">Stripe session: ${session.id}</p>
        `
      });

      // Confirmation email to the customer
      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          subject: 'Your SIGNAL order is confirmed',
          html: `
            <div style="font-family:Arial,sans-serif; max-width:520px; margin:0 auto;">
              <h1 style="font-family:monospace; color:#b87c00;">SIGNAL</h1>
              <h2>Your order is confirmed</h2>
              <p>Thanks${customerName ? ', ' + customerName : ''} — we've got your order and payment. Here's what you ordered:</p>
              <table style="width:100%; border-collapse:collapse; font-size:14px;">${itemsHtml}</table>
              <p style="font-size:16px;"><b>Total: ${total}</b></p>
              <p><b>Shipping to:</b><br>${shippingHtml}</p>
              <p>Your unit now enters our 72-hour burn-in process. We'll email you again once it's cleared for shipment, along with its burn-in report.</p>
              <p>Questions? Just reply to this email or reach us at ${OWNER_EMAIL}.</p>
            </div>
          `
        });
      }

    } catch (err) {
      console.error('Error processing order emails:', err);
      // Still return 200 so Stripe doesn't retry endlessly for an email issue
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
