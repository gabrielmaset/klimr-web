import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { buildSupportSystemPrompt } from "@/lib/support-kb";
import { emailSupportInbox, emitTicketWebhook, getRequester, notifySupportAdmins, ticketRef } from "@/lib/support-events";

// AI support assistant. One POST = one user turn: persist it, run Claude
// (Haiku 4.5 — cheap, fast, built for support chat) with a cached knowledge
// base and two narrow tools, run the tool loop server-side, persist the reply.
// The model is read-only by design: it can look up the caller's own account
// and file a ticket for admins — never change anything.

export const maxDuration = 30;

const MODEL = "claude-haiku-4-5";
const MAX_TOOL_ROUNDS = 3;
const HISTORY_TURNS = 20;
const MAX_MESSAGE_CHARS = 2000;

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type ApiMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

const TOOLS = [
  {
    name: "lookup_my_account",
    description:
      "Fetch safe, read-only facts about the current signed-in member: display name, account status, verification status, active sports, and member-since date. Use when the answer depends on their account state.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "escalate_to_admin",
    description:
      "File a support ticket and notify Klimr administrators. Use when the problem can't be solved from the knowledge base, needs staff action, or is urgent (safety, security, widespread breakage). Write a concise factual subject and summary for the admin.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Short ticket subject (under 80 chars)" },
        summary: { type: "string", description: "What the user needs, what was tried, and any key details an admin needs" },
        severity: { type: "string", enum: ["normal", "urgent"] },
      },
      required: ["subject", "summary", "severity"],
      additionalProperties: false,
    },
  },
];

async function runLookup(userId: string): Promise<string> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: sports }] = await Promise.all([
    admin
      .from("profiles")
      .select("display_name, account_status, verification_status, created_at, home_zip, city")
      .eq("id", userId)
      .maybeSingle(),
    admin.from("player_sports").select("sport_key, active, skill_level").eq("user_id", userId),
  ]);
  if (!profile) return "No profile found for this account (the member may not have finished onboarding).";
  const active = (sports ?? []).filter((s) => s.active).map((s) => `${s.sport_key} (${s.skill_level})`);
  return [
    `Display name: ${profile.display_name}`,
    `Account status: ${profile.account_status}`,
    `Verification status: ${profile.verification_status}`,
    `Member since: ${new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
    `Home area: ${[profile.city, profile.home_zip].filter(Boolean).join(" ") || "not set"}`,
    `Active sports: ${active.length ? active.join(", ") : "none active"}`,
  ].join("\n");
}

async function runEscalation(input: { userId: string; conversationId: string; subject: string; summary: string; severity: string }): Promise<string> {
  const admin = createAdminClient();

  // One ticket per conversation: if this chat already escalated, don't file twice.
  const { data: convo } = await admin
    .from("support_conversations")
    .select("escalated")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (convo?.escalated) {
    return "This conversation was already escalated — the team will see the full transcript. Do not file again; reassure the user instead.";
  }

  const severity = input.severity === "urgent" ? "urgent" : "normal";
  const subject = input.subject.slice(0, 120) || "Support request";
  const { data: ticket, error } = await admin
    .from("support_tickets")
    .insert({
      user_id: input.userId,
      source: "ai_chat",
      category: "assistant",
      severity,
      subject,
      ai_summary: input.summary.slice(0, 4000),
      conversation_id: input.conversationId,
    })
    .select("id, source, category, severity, status, subject, body, ai_summary, conversation_id, created_at, updated_at")
    .single();
  if (error || !ticket) return "Ticket creation failed — apologize and direct the user to the contact form on the Support page.";

  await admin.from("support_conversations").update({ escalated: true, updated_at: new Date().toISOString() }).eq("id", input.conversationId);

  // Dispatch through the integration seam: in-app admin fan-out, the inbox
  // email (universal helpdesk-ingestion path, reply-to = the member), and the
  // signed webhook if one is configured.
  const requester = await getRequester(input.userId);
  await notifySupportAdmins(
    severity === "urgent" ? "\u{1F6A8} Urgent support ticket" : "New support ticket from the assistant",
    `[${ticketRef(ticket.id)}] ${subject}`,
  );
  await emailSupportInbox({
    ticket,
    requester,
    text: `${input.summary.slice(0, 2000)}\n\nFull transcript: https://klimr.com/admin/support/${ticket.id}`,
  });
  await emitTicketWebhook("ticket.created", ticket, requester);
  return `Ticket filed (ref ${ticket.id.slice(0, 8)}, severity ${severity}). Admins have been notified and will follow up by email.`;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to use the assistant." }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "The assistant isn't configured yet — please use the contact form on the Support page." },
      { status: 503 },
    );
  }

  const allowed = await rateLimit(`support-chat:${user.id}`, 20, 3600); // 20 messages/hour
  if (!allowed) {
    return NextResponse.json({ error: "You've sent a lot of messages — give it a few minutes, or use the contact form." }, { status: 429 });
  }

  let body: { conversationId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const text = (body.message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!text) return NextResponse.json({ error: "Say something first." }, { status: 400 });

  const admin = createAdminClient();

  // Load (and verify ownership of) the conversation, or start one.
  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const { data: convo } = await admin.from("support_conversations").select("id, user_id").eq("id", conversationId).maybeSingle();
    if (!convo || convo.user_id !== user.id) conversationId = null;
  }
  if (!conversationId) {
    const { data: created, error } = await admin.from("support_conversations").insert({ user_id: user.id }).select("id").single();
    if (error || !created) return NextResponse.json({ error: "Couldn't start a conversation — try again." }, { status: 500 });
    conversationId = created.id;
  }

  // History (indexed lookup on conversation_id) + the new user turn.
  const { data: historyRows } = await admin
    .from("support_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(HISTORY_TURNS);
  const history = (historyRows ?? []).reverse();

  await admin.from("support_messages").insert({ conversation_id: conversationId, role: "user", content: text });

  const messages: ApiMessage[] = [
    ...history.map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: m.content })),
    { role: "user", content: text },
  ];

  // The knowledge base rides in a cached system block: full price once,
  // then 10% of input price on every subsequent message in the cache window.
  const system = [{ type: "text", text: buildSupportSystemPrompt(), cache_control: { type: "ephemeral" } }];

  const replyParts: string[] = [];
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 800, system, tools: TOOLS, messages }),
      });
      if (!res.ok) {
        console.error("[support-chat] anthropic error", res.status, await res.text());
        return NextResponse.json({ error: "The assistant hit a snag — try again in a moment." }, { status: 502 });
      }
      const data = (await res.json()) as { content: ContentBlock[]; stop_reason: string };

      for (const block of data.content) {
        if (block.type === "text" && block.text.trim()) replyParts.push(block.text.trim());
      }

      const toolUses = data.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
      if (data.stop_reason !== "tool_use" || toolUses.length === 0 || round === MAX_TOOL_ROUNDS) break;

      const results: ContentBlock[] = [];
      for (const tu of toolUses) {
        let result = "Unknown tool.";
        try {
          if (tu.name === "lookup_my_account") {
            result = await runLookup(user.id);
          } else if (tu.name === "escalate_to_admin") {
            const input = tu.input as { subject?: string; summary?: string; severity?: string };
            result = await runEscalation({
              userId: user.id,
              conversationId,
              subject: String(input.subject ?? ""),
              summary: String(input.summary ?? ""),
              severity: String(input.severity ?? "normal"),
            });
          }
        } catch (e) {
          console.error("[support-chat] tool error", tu.name, e);
          result = "The tool failed — continue without it and offer the contact form if needed.";
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
      }
      messages.push({ role: "assistant", content: data.content });
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    console.error("[support-chat] request failed", e);
    return NextResponse.json({ error: "The assistant hit a snag — try again in a moment." }, { status: 502 });
  }

  const reply = replyParts.join("\n\n") || "Sorry — I couldn't put an answer together. Try rephrasing, or use the contact form on the Support page.";

  await admin.from("support_messages").insert({ conversation_id: conversationId, role: "assistant", content: reply });
  await admin.from("support_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  const { data: convoState } = await admin.from("support_conversations").select("escalated").eq("id", conversationId).maybeSingle();

  return NextResponse.json({ conversationId, reply, escalated: !!convoState?.escalated });
}
