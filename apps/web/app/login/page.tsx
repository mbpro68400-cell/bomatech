"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    setStatus(error ? "error" : "sent");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <article className="card" style={{ width: "100%", maxWidth: 400 }}>
        <div className="card-body" style={{ padding: 28 }}>
          <Link href="/" className="brand" style={{ padding: "0 0 20px" }}>
            <div className="brand-mark">B</div>
            <div className="brand-name">Bomatech</div>
          </Link>

          <h1 className="serif" style={{ fontSize: 28, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            Connexion
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: "0 0 24px" }}>
            Entre ton email, on t'envoie un lien magique.
          </p>

          {status === "sent" ? (
            <div
              className="card"
              style={{
                padding: 14,
                background: "var(--accent-soft)",
                borderColor: "var(--accent)",
              }}
            >
              <p style={{ margin: 0, fontSize: 13 }}>
                ✓ Lien envoyé à <strong>{email}</strong>. Vérifie ta boîte mail.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="tweak-row">
                <label className="tweak-label">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@entreprise.fr"
                  className="input"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="btn primary"
                style={{ width: "100%", height: 36 }}
              >
                {loading ? "Envoi..." : "Recevoir le lien"}
              </button>
              {status === "error" && (
                <p style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>
                  Erreur. Vérifie l'email et réessaie.
                </p>
              )}
            </form>
          )}
        </div>
      </article>
    </main>
  );
}
