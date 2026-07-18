// Datei: /api/chat.js
// Läuft als Vercel Serverless Function — der API-Key bleibt serverseitig,
// das Frontend ruft nur diese Funktion auf, nie direkt die Anthropic API.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Nur POST erlaubt' });
  }

  const { propertyId, messages } = req.body;
  if (!propertyId || !messages) {
    return res.status(400).json({ error: 'propertyId und messages erforderlich' });
  }

  // 1. Wissensbasis der Unterkunft aus Supabase laden
  const supabaseRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/properties?id=eq.${propertyId}&select=name,knowledge_base`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const rows = await supabaseRes.json();
  const property = rows[0];

  if (!property) {
    return res.status(404).json({ error: 'Unterkunft nicht gefunden' });
  }

  // 2. Claude API aufrufen — Key liegt nur hier auf dem Server, nie im Browser
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system:
        `Du bist der automatische Gast-Assistent für die Unterkunft "${property.name}". ` +
        `Beantworte Fragen ausschließlich auf Basis der folgenden Wissensbasis. ` +
        `Antworte kurz, freundlich und auf Deutsch. Wenn die Antwort nicht in der ` +
        `Wissensbasis steht, sag ehrlich, dass du das nicht weißt.\n\n` +
        `Wissensbasis:\n${property.knowledge_base}`,
      messages,
    }),
  });

  const data = await claudeRes.json();

  // 3. Optional: Konversation für den Vermieter protokollieren
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/conversations`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      property_id: propertyId,
      last_message: messages[messages.length - 1]?.content,
    }),
  }).catch(() => {}); // Logging darf nie die Antwort blockieren

  res.status(200).json(data);
}

/*
  Einrichtung auf Vercel:
  1. Projekt mit dieser Datei unter /api/chat.js hochladen (z.B. via GitHub-Repo)
  2. Im Vercel-Dashboard → Settings → Environment Variables anlegen:
     ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
  3. Frontend ruft nur noch fetch('/api/chat', { method:'POST', body: JSON.stringify({propertyId, messages}) })
     auf — nie mehr die Anthropic-URL direkt aus dem Browser.
*/
