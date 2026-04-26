export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');
  if (!address) return new Response(JSON.stringify({ error: 'Keine Adresse' }), { status: 400, headers: CORS });

  try {
    const pageUrl = `https://www.crossvertise.com/plakatwerbung?location=${encodeURIComponent(address)}`;
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
      redirect: 'follow',
    });
    const html = await res.text();

    const pricePatterns = [
      /ab\s*([\d.,]+)\s*€\s*[\/\-]\s*Tag/gi,
      /([\d.,]+)\s*€\s*[\/\-]\s*Tag/gi,
      /Tagespreis[^\d]*([\d.,]+)/gi,
    ];
    const contactPatterns = [
      /(\d[\d.]*)\s*Kontakte?\s*pro\s*(Tag|Woche|Monat)/gi,
      /Reichweite[^\d]*([\d.]+)/gi,
      /PPS[^\d]*([\d.]+)/gi,
    ];

    let pricePerDay = null, contacts = null, contactPeriod = 'Tag';

    for (const p of pricePatterns) {
      const m = p.exec(html);
      if (m) { pricePerDay = parseFloat(m[1].replace(/\./g,'').replace(',','.')); break; }
    }
    for (const p of contactPatterns) {
      const m = p.exec(html);
      if (m) { contacts = parseInt(m[1].replace(/\./g,'')); if (m[2]) contactPeriod = m[2]; break; }
    }

    if (!pricePerDay) {
      const apiRes = await fetch(
        `https://www.crossvertise.com/api/search?q=${encodeURIComponent(address)}&type=plakatwerbung`,
        { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124.0', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
      );
      if (apiRes.ok) {
        try {
          const json = await apiRes.json();
          const item = json?.results?.[0] || json?.data?.[0] || json?.[0];
          if (item) {
            pricePerDay = item.price_per_day || item.pricePerDay || item.daily_price || null;
            contacts = item.contacts || item.reach || item.pps || null;
          }
        } catch {}
      }
    }

    return new Response(JSON.stringify({ found: !!(pricePerDay || contacts), pricePerDay, contacts, contactPeriod, address }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
