import Imap from "imap-simple";
import { simpleParser } from "mailparser";

export default async function handler(req, res) {
  const { email, password } = req.query;
  if (!email || !password)
    return res.status(400).json({ error: "Missing email or password" });

  const config = {
    imap: {
      user: email,
      password,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      authTimeout: 10000,
    },
  };

  try {
    const connection = await Imap.connect(config);
    await connection.openBox("INBOX");
    const since = new Date(Date.now() - 5 * 60 * 1000); // last 5 min
    const searchCriteria = [["SINCE", since.toISOString()]];
    const fetchOptions = { bodies: [""], markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);
    const parsed = [];

    for (const msg of messages) {
      const all = msg.parts.find((p) => p.which === "");
      if (!all?.body) continue;
      const parsedMail = await simpleParser(all.body);
      const from = parsedMail.from?.text || "Unknown";
      const subject = parsedMail.subject || "(no subject)";
      const date = parsedMail.date || new Date();
      const headers = parsedMail.headerLines || [];
      const received = headers
        .filter((h) => h.key.toLowerCase() === "received")
        .map((h) => h.line)
        .join(" ");
      const ipMatch = received.match(
        /\b\d{1,3}(?:\.\d{1,3}){3}\b|\[?[A-F0-9:]+\]?/i
      );
      const ip = ipMatch ? ipMatch[0].replace(/\[|\]/g, "") : "N/A";
      const domain = (from.split("@")[1] || "").replace(">", "").trim();
      parsed.push({
        from,
        subject,
        domain,
        ip,
        received: date,
        ago: timeAgo(date),
      });
    }

    connection.end();
    res.status(200).json({ emails: parsed.slice(0, 10) });
  } catch (err) {
    console.error("IMAP error", err);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

