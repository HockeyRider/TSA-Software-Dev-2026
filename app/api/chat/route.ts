import { NextRequest, NextResponse } from "next/server";

const API_KEY = "XXXXXXXXXXXXXXXXXXXXXX";
const YOUTUBE_API_KEY = "XXXXXXXXXXXXXXXXXXXXXX";
const GMAIL_CLIENT_ID = "XXXXXXXXXXXXXXXXXXXXXX";
const GMAIL_CLIENT_SECRET = "XXXXXXXXXXXXXXXXXXXXXX";
const GMAIL_REFRESH_TOKEN = "XXXXXXXXXXXXXXXXXXXXXX";
const GOOGLE_TTS_API_KEY = "XXXXXXXXXXXXXXXXXXXXXX";
const GOOGLE_MAPS_API_KEY = "XXXXXXXXXXXXXXXXXXXXXX";
const MODEL = "openai/gpt-4o-mini-2024-07-18";

// Keywords that open World Monitor + fetch news
const WORLD_MONITOR_KEYWORDS = [
  "what's happening",
  "whats happening",
  "what is happening",
  "around the world",
  "current news",
  "latest news",
  "world news",
  "global news",
  "international news",
  "breaking news",
  "top stories",
  "news today",
  "headlines",
  "world events",
  "world monitor",
  "worldmonitor",
  "open world monitor",
  "show world monitor",
  "open map",
  "show map",
  "world map",
  "global map",
];

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function getEmails(): Promise<string> {
  const accessToken = await getAccessToken();
  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();
  const messages = listData.messages ?? [];
  if (messages.length === 0) return "No unread emails.";
  const emails = await Promise.all(
    messages.map(async (msg: { id: string }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers ?? [];
      const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "No subject";
      const from = headers.find((h: any) => h.name === "From")?.value ?? "Unknown sender";
      return `From: ${from} — Subject: ${subject}`;
    })
  );
  return emails.join("\n");
}

async function getArticleText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const matches = html.match(/<p[^>]*>(.*?)<\/p>/gis) || [];
  const text = matches
    .map((p) => p.replace(/<[^>]+>/g, "").trim())
    .filter((t) => t.length > 40)
    .join(" ")
    .slice(0, 8000);
  return text;
}

async function callOpenRouter(prompt: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${err}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callOpenRouterWithHistory(
  messages: { role: string; content: string }[]
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful voice assistant. Keep responses short and conversational since they will be read aloud. No bullet points, no markdown.",
        },
        ...messages.filter((m) => m.content != null),
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${err}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function searchYouTube(query: string): Promise<{ videoId: string; title: string } | null> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;
  return { videoId: item.id.videoId, title: item.snippet.title };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // TTS
    if (body.type === "tts") {
      const res = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: body.text },
            voice: {
              languageCode: "en-US",
              name: "en-US-Neural2-F",
              ssmlGender: "FEMALE",
            },
            audioConfig: { audioEncoding: "MP3" },
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: err }, { status: 500 });
      }
      const data = await res.json();
      const audioBuffer = Buffer.from(data.audioContent, "base64");
      return new NextResponse(audioBuffer, {
        headers: { "Content-Type": "audio/mpeg" },
      });
    }

    // Location
    if (body.type === "location") {
      const { latitude, longitude, query } = body;
      const geocodeRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const geocodeData = await geocodeRes.json();
      const address = geocodeData.results?.[0]?.formatted_address ?? "unknown location";
      const placesRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=500&key=${GOOGLE_MAPS_API_KEY}`
      );
      const placesData = await placesRes.json();
      const places =
        placesData.results
          ?.slice(0, 10)
          .map((p: any) => `${p.name} (${p.types?.[0]?.replace(/_/g, " ")})`)
          .join(", ") ?? "no nearby places found";
      const summary = await callOpenRouterWithHistory([
        {
          role: "user",
          content: `The user is at ${address}. Nearby places within 1000 meters include: ${places}. The user asked: "${query}". Answer their specific question using this location data naturally in 2-3 sentences like you're helping a blind person.`,
        },
      ]);
      return NextResponse.json({ intent: "location", message: summary });
    }

    // Voice commands
    const { command, messages = [] } = body;
    if (!command) {
      return NextResponse.json({ error: "No command" }, { status: 400 });
    }

    const lowerCommand = command.toLowerCase();

    // ── Music ──
    if (
      lowerCommand.includes("play ") ||
      lowerCommand.includes("put on ") ||
      lowerCommand.includes("listen to ") ||
      lowerCommand.includes("queue ") ||
      lowerCommand.includes("start playing")
    ) {
      const result = await searchYouTube(command);
      if (!result)
        return NextResponse.json({ intent: "music", message: "Sorry, I couldn't find that song." });
      return NextResponse.json({
        intent: "music",
        message: `Playing ${result.title}`,
        videoId: result.videoId,
      });
    }

    // ── Email ──
    if (
      lowerCommand.includes("email") ||
      lowerCommand.includes("inbox") ||
      lowerCommand.includes("unread") ||
      lowerCommand.includes("my mail") ||
      lowerCommand.includes("check my")
    ) {
      const emailList = await getEmails();
      const summary = await callOpenRouter(
        `Read out these emails naturally and conversationally like you're a personal assistant. Do NOT restate the question, just read them out. Keep it brief:\n\n${emailList}`
      );
      return NextResponse.json({ intent: "email", message: summary });
    }

    // ── Location ──
    if (
      lowerCommand.includes("where am i") ||
      lowerCommand.includes("where are we") ||
      lowerCommand.includes("my location") ||
      lowerCommand.includes("near me") ||
      lowerCommand.includes("nearby") ||
      lowerCommand.includes("around me") ||
      lowerCommand.includes("closest ") ||
      lowerCommand.includes("nearest ") ||
      lowerCommand.includes("directions to") ||
      lowerCommand.includes("navigate to")
    ) {
      return NextResponse.json({ intent: "location" });
    }

    // ── World Monitor + News (combined) ──
    // Covers: "what's happening around the world", "world news", "current news",
    // "world monitor", "open map", etc.
    const isWorldMonitorTrigger = WORLD_MONITOR_KEYWORDS.some((kw) =>
      lowerCommand.includes(kw)
    );

    if (isWorldMonitorTrigger) {
      // Check if it's also a map control action
      let mapAction = "open";
      let mapTarget = "";

      if (lowerCommand.includes("zoom in")) mapAction = "zoomIn";
      else if (lowerCommand.includes("zoom out")) mapAction = "zoomOut";
      else if (lowerCommand.includes("reset") || lowerCommand.includes("center map"))
        mapAction = "reset";
      else {
        const regionMatch = lowerCommand.match(
          /(?:go to|show|focus on|find on map)\s+(.+)/
        );
        if (regionMatch) {
          mapAction = "goto";
          mapTarget = regionMatch[1];
        }
      }

      // If it's a news/current-events query, fetch real news for the narration
      const isNewsQuery =
        lowerCommand.includes("news") ||
        lowerCommand.includes("headlines") ||
        lowerCommand.includes("happening") ||
        lowerCommand.includes("events") ||
        lowerCommand.includes("stories");

      let message = "";

      if (isNewsQuery && mapAction === "open") {
        // Determine news source from command
        const NEWS_SOURCES: Record<string, string> = {
          bbc: "https://www.bbc.com/news",
          cnn: "https://www.cnn.com",
          reuters: "https://www.reuters.com",
          guardian: "https://www.theguardian.com",
          "washington post": "https://www.washingtonpost.com",
          "fox news": "https://www.foxnews.com",
          "new york times": "https://www.nytimes.com",
          nyt: "https://www.nytimes.com",
          npr: "https://www.npr.org/sections/news",
          ap: "https://apnews.com",
          "associated press": "https://apnews.com",
          bloomberg: "https://www.bloomberg.com",
          techcrunch: "https://techcrunch.com",
          wired: "https://www.wired.com",
          espn: "https://www.espn.com",
          axios: "https://www.axios.com",
          cnbc: "https://www.cnbc.com",
          wsj: "https://www.wsj.com",
          "wall street journal": "https://www.wsj.com",
        };

        let url = "https://apnews.com"; // default
        for (const [keyword, sourceUrl] of Object.entries(NEWS_SOURCES)) {
          if (lowerCommand.includes(keyword)) {
            url = sourceUrl;
            break;
          }
        }

        try {
          const articleText = await getArticleText(url);
          if (articleText) {
            message = await callOpenRouter(
              `You are a voice assistant with a World Monitor map open. Briefly tell the user you're opening World Monitor and then give a 3-4 sentence summary of what's happening in the world based on this news content. Keep it conversational, no bullet points, no symbols:\n\n${articleText}`
            );
          }
        } catch {
          // fallback below
        }
      }

      if (!message) {
        message =
          mapAction === "open"
            ? "Opening World Monitor for you. This will show you what's currently happening across the globe."
            : `Executing map command: ${mapAction}${mapTarget ? " — " + mapTarget : ""}`;
      }

      return NextResponse.json({
        intent: "worldmap",
        mapAction,
        mapTarget,
        message,
      });
    }

    // ── Browser ──
    if (
      lowerCommand.includes("open ") ||
      lowerCommand.includes("go to ") ||
      lowerCommand.includes("search for ") ||
      lowerCommand.includes("google ") ||
      lowerCommand.includes("look up ") ||
      lowerCommand.includes("youtube") ||
      lowerCommand.includes("spotify") ||
      lowerCommand.includes("instagram") ||
      lowerCommand.includes("reddit") ||
      lowerCommand.includes("twitter") ||
      lowerCommand.includes("facebook")
    ) {
      return NextResponse.json({ intent: "browser", message: "Opening that for you now" });
    }

    // ── Exit ──
    if (
      lowerCommand === "exit" ||
      lowerCommand === "goodbye" ||
      lowerCommand === "bye" ||
      lowerCommand.includes("shut down") ||
      lowerCommand.includes("stop aria") ||
      lowerCommand.includes("quit")
    ) {
      return NextResponse.json({ intent: "exit", message: "Goodbye!" });
    }

    // ── Chat (default) ──
    const reply = await callOpenRouterWithHistory([
      ...messages,
      { role: "user", content: command },
    ]);
    return NextResponse.json({ intent: "chat", message: reply });
  } catch (err) {
    console.error("Route error:", err);
    return NextResponse.json({ intent: "error", message: String(err) }, { status: 500 });
  }
}
