/**
 * SMTP transport (Hostinger) pour les relances de factures.
 *
 * Lazy-init : on ne touche pas aux env vars au load du module pour ne pas
 * casser le build Vercel ni les imports côté client (le module est server-only
 * mais on garde la garde de défense).
 *
 * Env vars requises côté production :
 *   SMTP_HOST=smtp.hostinger.com
 *   SMTP_PORT=465
 *   SMTP_SECURE=true
 *   SMTP_USER=contact@bomatech.fr
 *   SMTP_PASS=<récupéré dans hPanel>
 *   SMTP_FROM=Bomatech <contact@bomatech.fr>
 */

import "server-only";
import { createTransport, type Transporter } from "nodemailer";

let cached: Transporter | null = null;

export function getTransporter(): Transporter {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error(
      "SMTP not configured: missing SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS",
    );
  }

  cached = createTransport({
    host,
    port: Number(port),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
  return cached;
}

export function getFrom(): string {
  const from = process.env.SMTP_FROM;
  if (!from) throw new Error("SMTP not configured: missing SMTP_FROM");
  return from;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

export async function sendPlainText(params: SendEmailParams): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: getFrom(),
    to: params.to,
    subject: params.subject,
    text: params.body,
  });
}
