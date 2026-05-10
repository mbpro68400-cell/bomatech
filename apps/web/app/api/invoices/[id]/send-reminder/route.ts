/**
 * POST /api/invoices/[id]/send-reminder
 *
 * Envoi manuel et IMMÉDIAT d'une relance pour une facture donnée.
 * Body : { level: 1 | 2 }
 *
 * Différences vs le cron :
 *  - Authent via session utilisateur (cookies), RLS appliqué
 *  - Pas de delta de temps : envoie tout de suite, status='sent' direct
 *  - created_by='manual', created_by_user_id=auth.uid()
 *  - Pour level=2, on vérifie quand même qu'un palier 1 status='sent' existe
 *    (cohérence légale : pas de mise en demeure sans relance amiable)
 */

import "server-only";
import type { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase";
import { sendPlainText } from "@/lib/email/transport";
import { renderReminder } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  const { id } = await params;
  let level: number;
  try {
    const body = await request.json();
    level = Number(body?.level);
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (level !== 1 && level !== 2) {
    return Response.json({ ok: false, error: "level must be 1 or 2" }, { status: 400 });
  }

  const supabase = await getServerClient();

  // Vérifier l'utilisateur authentifié (sinon RLS aurait déjà bloqué l'INSERT, mais on
  // veut aussi récupérer son user_id pour l'audit field created_by_user_id).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Charger l'invoice + sa company pour le rendu (RLS scope auto)
  const { data: inv, error: invErr } = await supabase
    .from("invoices_emitted")
    .select("id, company_id, number, client_email, amount_ttc_cents, issued_at, due_at, status, is_closed_period")
    .eq("id", id)
    .maybeSingle();
  if (invErr || !inv) {
    return Response.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }
  const invoice = inv as {
    id: string;
    company_id: string;
    number: string;
    client_email: string | null;
    amount_ttc_cents: number;
    issued_at: string;
    due_at: string;
    status: string;
    is_closed_period: boolean;
  };

  if (!invoice.client_email) {
    return Response.json(
      { ok: false, error: "Aucun email client renseigné sur cette facture." },
      { status: 400 },
    );
  }
  if (invoice.status !== "pending") {
    return Response.json(
      { ok: false, error: `Statut invoice = '${invoice.status}', attendu 'pending'` },
      { status: 400 },
    );
  }

  // Charger la company name
  const { data: companyRow } = await supabase
    .from("companies")
    .select("name")
    .eq("id", invoice.company_id)
    .maybeSingle();
  const companyName = (companyRow as { name?: string } | null)?.name ?? "";

  // Pour level=2, exiger un palier 1 status='sent'
  let level1SentAt: string | null = null;
  if (level === 2) {
    const { data: palier1 } = await supabase
      .from("invoice_reminders")
      .select("sent_at, status")
      .eq("invoice_id", invoice.id)
      .eq("level", 1)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const p1 = palier1 as { sent_at: string | null; status: string } | null;
    if (!p1 || !p1.sent_at) {
      return Response.json(
        {
          ok: false,
          error:
            "Impossible d'envoyer une mise en demeure (palier 2) sans avoir envoyé une relance amiable (palier 1) au préalable.",
        },
        { status: 400 },
      );
    }
    level1SentAt = p1.sent_at.slice(0, 10);
  }

  // Render le template
  const invoiceCtx = {
    number: invoice.number,
    amount_ttc_cents: invoice.amount_ttc_cents,
    issued_at: invoice.issued_at,
    due_at: invoice.due_at,
  };
  const company = { name: companyName };
  const rendered =
    level === 1
      ? renderReminder(1, { invoice: invoiceCtx, company })
      : renderReminder(2, {
          invoice: invoiceCtx,
          company,
          level1SentAt: level1SentAt!,
        });

  // Envoi immédiat (try/catch — on update DB selon résultat)
  const nowIso = new Date().toISOString();
  let sendOk = true;
  let sendErr: string | null = null;
  try {
    await sendPlainText({
      to: invoice.client_email,
      subject: rendered.subject,
      body: rendered.body,
    });
  } catch (e) {
    sendOk = false;
    sendErr = e instanceof Error ? e.message : String(e);
  }

  // Insert row reminder (snapshot subject/body, audit manual + user_id)
  const { error: insErr } = await supabase.from("invoice_reminders").insert({
    invoice_id: invoice.id,
    company_id: invoice.company_id,
    level,
    status: sendOk ? "sent" : "failed",
    scheduled_at: nowIso,
    sent_at: sendOk ? nowIso : null,
    failed_at: sendOk ? null : nowIso,
    error_message: sendErr ? sendErr.slice(0, 1000) : null,
    email_to: invoice.client_email,
    subject: rendered.subject,
    body: rendered.body,
    created_by: "manual",
    created_by_user_id: user.id,
  });

  if (insErr) {
    // Cas le plus probable : 23505 = unique violation = un reminder de ce niveau existe déjà
    const code = (insErr as { code?: string }).code;
    if (code === "23505") {
      return Response.json(
        {
          ok: false,
          error: `Une relance palier ${level} existe déjà pour cette facture. Supprimez-la côté DB pour pouvoir en renvoyer une nouvelle.`,
        },
        { status: 409 },
      );
    }
    return Response.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return Response.json({
    ok: sendOk,
    level,
    sent_at: sendOk ? nowIso : null,
    error: sendErr,
  });
}
