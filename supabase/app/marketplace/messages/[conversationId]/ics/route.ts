import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function GET(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const meetupId = new URL(req.url).searchParams.get("meetup") ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: conv } = await supabase.from("conversations").select("id, listing_id, created_by").eq("id", conversationId).maybeSingle();
  if (!conv?.listing_id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: l } = await supabase.from("marketplace_listings").select("id, title, listed_by").eq("id", conv.listing_id).maybeSingle();
  if (!l || (user.id !== conv.created_by && user.id !== l.listed_by)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: m } = await supabase
    .from("listing_meetups")
    .select("id, starts_at, status, place_text, court_id")
    .eq("id", meetupId)
    .eq("listing_id", l.id)
    .maybeSingle();
  if (!m || m.status !== "accepted") return NextResponse.json({ error: "not found" }, { status: 404 });

  let place = m.place_text ?? "Meet spot";
  if (m.court_id) {
    const { data: c } = await supabase.from("courts").select("name").eq("id", m.court_id).maybeSingle();
    if (c?.name) place = c.name;
  }
  const start = new Date(m.starts_at);
  const end = new Date(start.getTime() + 45 * 60000);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Klimr//Second Serve//EN",
    "BEGIN:VEVENT",
    `UID:${m.id}@klimr.com`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:Gear pickup \u2014 ${l.title.replace(/[\n,;]/g, " ")}`,
    `LOCATION:${place.replace(/[\n,;]/g, " ")}`,
    "DESCRIPTION:Arranged on Klimr Second Serve. Meet in public and inspect before paying.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="klimr-gear-pickup.ics"`,
    },
  });
}
