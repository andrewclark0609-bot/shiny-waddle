// netlify/functions/create-checkout-session.js
//
// This runs on the server (never in the visitor's browser), so it's the only
// safe place to decide what something costs. The browser only tells us WHICH
// options were picked (unit, storage index, warranty index, colour index) —
// this function looks up the actual prices itself and builds the Stripe
// Checkout Session from that. A visitor editing browser code cannot change
// what they're charged.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Keep this in sync with the option lists in configure.html.
// All prices in pence (GBP).
const UNITS = {
  "0.5": { name: "SIGNAL-0.5", price: 85000 },
  "1": { name: "SIGNAL-1", price: 120000 },
  "3": { name: "SIGNAL-3", price: 175000 },
  "9": { name: "SIGNAL-9", price: 225000 }
};

const STORAGE = {
  "0.5": [
    { label: "1TB NVMe", delta: 0 },
    { label: "2TB NVMe", delta: 7500 },
    { label: "1TB + 1TB NVMe", delta: 6500 }
  ],
  "1": [
    { label: "1TB NVMe Gen4", delta: 0 },
    { label: "2TB NVMe Gen4", delta: 9500 },
    { label: "1TB + 2TB NVMe Gen4", delta: 15000 }
  ],
  "3": [
    { label: "2TB NVMe Gen4", delta: 0 },
    { label: "4TB NVMe Gen4", delta: 14000 },
    { label: "2TB + 2TB NVMe Gen4", delta: 11000 }
  ],
  "9": [
    { label: "2TB NVMe Gen4", delta: 0 },
    { label: "4TB NVMe Gen4", delta: 14500 },
    { label: "2TB + 2TB NVMe Gen4", delta: 11000 }
  ]
};

const WARRANTY = [
  { label: "3-year parts & labor", delta: 0 },
  { label: "5-year parts & labor", delta: 8900 }
];

const COLOUR = [
  { label: "Black", delta: 0 },
  { label: "White", delta: 3500 },
  { label: "Black / white split", delta: 5500 }
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { unit, storageIndex, warrantyIndex, colourIndex } = body;

    const unitData = UNITS[unit];
    const storageData = STORAGE[unit] && STORAGE[unit][storageIndex];
    const warrantyData = WARRANTY[warrantyIndex];
    const colourData = COLOUR[colourIndex];

    if (!unitData || !storageData || !warrantyData || !colourData) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid selection' }) };
    }

    const siteUrl = process.env.URL || 'http://localhost:8888';

    const line_items = [
      {
        price_data: {
          currency: 'gbp',
          product_data: { name: unitData.name + ' — base build' },
          unit_amount: unitData.price
        },
        quantity: 1
      }
    ];

    if (storageData.delta > 0) {
      line_items.push({
        price_data: {
          currency: 'gbp',
          product_data: { name: 'Storage upgrade — ' + storageData.label },
          unit_amount: storageData.delta
        },
        quantity: 1
      });
    }

    if (warrantyData.delta > 0) {
      line_items.push({
        price_data: {
          currency: 'gbp',
          product_data: { name: 'Warranty — ' + warrantyData.label },
          unit_amount: warrantyData.delta
        },
        quantity: 1
      });
    }

    if (colourData.delta > 0) {
      line_items.push({
        price_data: {
          currency: 'gbp',
          product_data: { name: 'Case colour — ' + colourData.label },
          unit_amount: colourData.delta
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: siteUrl + '/order-confirmed.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: siteUrl + '/configure.html?unit=' + unit
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
