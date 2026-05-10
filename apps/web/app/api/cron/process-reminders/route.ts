/**
 * Cron : envoi des relances de factures impayées (1.6.5).
 *
 * Appelé quotidiennement par Vercel Cron (cf. apps/web/vercel.json).
 * Vercel envoie automatiquement `Authorization: Bearer ${CRON_SECRET}` quand
 * la route est listée dans la config crons et que CRON_SECRET est en env var.
 *
 * Architecture en 2 phases :
 *
 *   PHASE 1 — Scheduling
 *     - Charge toutes les factures pending+client_email+!is_closed_period
 *     - Pour chacune, appelle computeRemindersToSchedule()
 *     - Pour chaque reminder à créer, RENDER le subject/body MAINTENANT et
 *       snapshote dans la row invoice_reminders (status='scheduled').
 *     - Skip palier 2 si le palier 1 n'a pas status='sent' (sécurité légale :
 *       pas de mise en demeure si la relance amiable n'a pas été envoyée).
 *
 *   PHASE 2 — Sending
 *     - Re-query les rows status='scheduled' && scheduled_at <= now()
 *     - Boucle Promise.all + p-limit(20) (cap Hostinger 100/h)
 *     - Try/catch PER-REMINDER : une erreur SMTP n'arrête pas la boucle
 *     - Update status='sent' ou 'failed' avec error_message
 *
 * Idempotence : la unique constraint DB (invoice_id, level) bloque les
 * doublons. On catch le code 23505 et on continue.
 *
 * Env vars requises :
 *   CRON_SECRET                  — auth du cron
 *   SUPABASE_SERVICE_ROLE_KEY    — bypass RLS pour le cron
 *   SMTP_HOST / PORT / SECURE / USER / PASS / FROM
 */

import "server-only";
import type { NextRequest } from "next/server";
import pLimit from "p-limit";
import { getAdminClient } from "@/lib/supabase-admin";
import { sendPlainText } from "@/lib/email/transport";
import { renderReminder } from "@/lib/email/templates";
import { computeRemindersToSchedule } from "@/lib/engines/reminder-scheduler";

export const dynamic = "force-dynamic";

interface InvoiceRow {
  id: string;
  company_id: string;
  number: string;
  client_email: string | null;
  amount_ttc_cents: number;
  issued_at: string;
  due_at: string;
  status: string;
  is_closed_period: boolean | null;
}

interface ReminderRow {
  invoice_id: string;
  level: number;
  status: string;
  sent_at: string | null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const startedAt = Date.now();

  // ── Auth strict ──
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = getAdminClient();
  const asOf = new Date();

  // ============================================
  // PHASE 1 — SCHEDULING
  // ============================================
  const { data: invoices, error: invErr } = await admin
    .from("invoices_emitted")
    .select(
      "id, company_id, number, client_email, amount_ttc_cents, issued_at, due_at, status, is_closed_period",
    )
    .eq("status", "pending")
    .not("client_email", "is", null)
    .eq("is_closed_period", false);

  if (invErr) {
    return Response.json(
      {
        ok: false,
        error: `load invoices: ${invErr.message}`,
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  const invList = (invoices ?? []) as InvoiceRow[];

  // Charger les reminders existantes pour ces invoices (tous statuts)
  let existingByInvoice = new Map<string, ReminderRow[]>();
  if (invList.length > 0) {
    const { data: rems, error: remErr } = await admin
      .from("invoice_reminders")
      .select("invoice_id, level, status, sent_at")
      .in(
        "invoice_id",
        invList.map((i) => i.id),
      );
    if (remErr) {
      return Response.json(
        {
          ok: false,
          error: `load reminders: ${remErr.message}`,
          duration_ms: Date.now() - startedAt,
        },
        { status: 500 },
      );
    }
    for (const r of (rems ?? []) as ReminderRow[]) {
      const list = existingByInvoice.get(r.invoice_id) ?? [];
      list.push(r);
      existingByInvoice.set(r.invoice_id, list);
    }
  }

  // Charger les companies pour le name dans le templating
  const companyIds = Array.from(new Set(invList.map((i) => i.company_id)));
  const companyName = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: cos } = await admin
      .from("companies")
      .select("id, name")
      .in("id", companyIds);
    for (const c of (cos ?? []) as { id: string; name: string }[]) {
      companyName.set(c.id, c.name);
    }
  }

  let createdCount = 0;
  let skippedPalier2NoPalier1 = 0;

  for (const inv of invList) {
    const existing = existingByInvoice.get(inv.id) ?? [];
    const toSchedule = computeRemindersToSchedule(
      {
        id: inv.id,
        status: inv.status,
        client_email: inv.client_email,
        due_at: inv.due_at,
        is_closed_period: inv.is_closed_period ?? false,
      },
      existing.map((r) => ({ level: r.level, status: r.status })),
      asOf,
    );

    const company = { name: companyName.get(inv.company_id) ?? "" };
    const invoiceCtx = {
      number: inv.number,
      amount_ttc_cents: inv.amount_ttc_cents,
      issued_at: inv.issued_at,
      due_at: inv.due_at,
    };

    for (const sched of toSchedule) {
      let subject: string;
      let body: string;

      if (sched.level === 1) {
        const r = renderReminder(1, { invoice: invoiceCtx, company, asOf });
        subject = r.subject;
        body = r.body;
      } else {
        // Palier 2 : exiger un palier 1 status='sent' avec sent_at
        const palier1 = existing.find(
          (r) => r.level === 1 && r.status === "sent" && r.sent_at,
        );
        if (!palier1 || !palier1.sent_at) {
          skippedPalier2NoPalier1++;
          continue;
        }
        const r = renderReminder(2, {
          invoice: invoiceCtx,
          company,
          level1SentAt: palier1.sent_at.slice(0, 10),
          asOf,
        });
        subject = r.subject;
        body = r.body;
      }

      const { error: insErr } = await admin.from("invoice_reminders").insert({
        invoice_id: inv.id,
        company_id: inv.company_id,
        level: sched.level,
        status: "scheduled",
        scheduled_at: asOf.toISOString(),
        email_to: inv.client_email,
        subject,
        body,
        created_by: "auto",
        created_by_user_id: null,
      });

      if (insErr) {
        // 23505 = unique violation = reminder déjà créée (race entre 2 runs)
        if ((insErr as { code?: string }).code === "23505") continue;
        // Autre erreur : on log et on continue
        continue;
      }
      createdCount++;
    }
  }

  // ============================================
  // PHASE 2 — SENDING
  // ============================================
  const { data: toSend, error: sendQErr } = await admin
    .from("invoice_reminders")
    .select("id, email_to, subject, body")
    .eq("status", "scheduled")
    .lte("scheduled_at", asOf.toISOString())
    .limit(200);

  if (sendQErr) {
    return Response.json(
      {
        ok: false,
        error: `load to-send: ${sendQErr.message}`,
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  const queue = (toSend ?? []) as {
    id: string;
    email_to: string;
    subject: string;
    body: string;
  }[];

  let sentOk = 0;
  let sentFailed = 0;
  const errors: { id: string; error: string }[] = [];

  const limit = pLimit(20);
  await Promise.all(
    queue.map((rem) =>
      limit(async () => {
        try {
          await sendPlainText({
            to: rem.email_to,
            subject: rem.subject,
            body: rem.body,
          });
          const { error } = await admin
            .from("invoice_reminders")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", rem.id);
          if (error) {
            sentFailed++;
            errors.push({ id: rem.id, error: `update sent: ${error.message}` });
          } else {
            sentOk++;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sentFailed++;
          errors.push({ id: rem.id, error: msg });
          await admin
            .from("invoice_reminders")
            .update({
              status: "failed",
              failed_at: new Date().toISOString(),
              error_message: msg.slice(0, 1000),
            })
            .eq("id", rem.id);
        }
      }),
    ),
  );

  return Response.json({
    ok: true,
    scheduled: {
      created: createdCount,
      skipped_palier2_no_palier1: skippedPalier2NoPalier1,
    },
    sent: { ok: sentOk, failed: sentFailed },
    duration_ms: Date.now() - startedAt,
    errors: errors.slice(0, 10),
  });
}
