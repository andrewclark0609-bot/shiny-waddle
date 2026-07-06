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
  "0.5": { name: "SIGNAL-0.5", price: 95000 },
  "1": { name: "SIGNAL-1", price: 135000 },
  "3": { name: "SIGNAL-3", price: 185000 },
  "9": { name: "SIGNAL-9", price: 245000 }
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
      shipping_address_collection: {
        allowed_countries: [
          "AC","AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AT","AU","AW","AX","AZ",
          "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
          "CA","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CV","CW","CY","CZ",
          "DE","DJ","DK","DM","DO","DZ",
          "EC","EE","EG","EH","ER","ES","ET",
          "FI","FJ","FK","FO","FR",
          "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY",
          "HK","HN","HR","HT","HU",
          "ID","IE","IL","IM","IN","IO","IQ","IS","IT",
          "JE","JM","JO","JP",
          "KE","KG","KH","KI","KM","KN","KR","KW","KY","KZ",
          "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
          "MA","MC","MD","ME","MF","MG","MK","ML","MM","MN","MO","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
          "NA","NC","NE","NG","NI","NL","NO","NP","NR","NU","NZ",
          "OM",
          "PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PY",
          "QA",
          "RE","RO","RS","RU","RW",
          "SA","SB","SC","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SZ",
          "TA","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
          "UA","UG","US","UY","UZ",
          "VA","VC","VE","VG","VN","VU",
          "WF","WS",
          "XK",
          "YE","YT",
          "ZA","ZM","ZW"
        ]
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'gbp' },
            display_name: 'UK Standard Shipping (5–7 business days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 7 }
            }
          }
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 3500, currency: 'gbp' },
            display_name: 'Europe Shipping (7–10 business days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 7 },
              maximum: { unit: 'business_day', value: 10 }
            }
          }
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 6500, currency: 'gbp' },
            display_name: 'North America Shipping (7–12 business days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 7 },
              maximum: { unit: 'business_day', value: 12 }
            }
          }
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 8500, currency: 'gbp' },
            display_name: 'Rest of World Shipping (10–18 business days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 10 },
              maximum: { unit: 'business_day', value: 18 }
            }
          }
        }
      ],
      phone_number_collection: {
        enabled: true
      },
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
