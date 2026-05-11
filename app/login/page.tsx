"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;

    setStatus("sending");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    setStatus("sent");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-white px-6">
      <div className="flex flex-col gap-6 w-full max-w-sm">
        <div className="flex flex-col items-center gap-1">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold mb-2"
            style={{ backgroundColor: "var(--portesco-blue)" }}
          >
            P
          </div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--portesco-blue)" }}
          >
            Bienvenido
          </h1>
          <p
            className="text-sm text-center"
            style={{ color: "var(--portesco-gray-mid)" }}
          >
            Ingresa tu correo electrónico para recibir tu enlace de acceso
          </p>
        </div>

        {status === "sent" ? (
          <div
            className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"
            role="status"
          >
            <p className="font-medium mb-1">Revisa tu correo</p>
            <p>
              Te enviamos un enlace de acceso a <strong>{email}</strong>. Abrilo
              en este dispositivo para entrar.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
              className="h-12 px-4 rounded-xl border border-gray-200 text-base outline-none focus:border-blue-900 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status === "sending" || !email}
              className="h-12 rounded-xl text-white font-medium disabled:opacity-60"
              style={{ backgroundColor: "var(--portesco-red)" }}
            >
              {status === "sending" ? "Enviando..." : "Enviar enlace de acceso"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-600" role="alert">
                No pudimos enviar el enlace. {errorMsg || "Intenta de nuevo."}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
