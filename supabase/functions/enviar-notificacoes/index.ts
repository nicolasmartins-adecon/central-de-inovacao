// =============================================================================
// Edge Function: enviar-notificacoes
//
// Drena a fila public.notificacoes e envia cada item pelo Resend.
// Chamada de três formas:
//   1. pg_cron, a cada 2 minutos  (ver seção 7 do schema.sql)
//   2. pelo próprio app, logo depois de uma ação, para entrega imediata
//   3. manualmente:  supabase functions invoke enviar-notificacoes
//
// Secrets necessários (Dashboard -> Edge Functions -> Secrets):
//   RESEND_API_KEY   re_xxxxxxxx
//   EMAIL_REMETENTE  Central de Inovação <central@seudominio.com.br>
//   URL_APP          https://seu-usuario.github.io/central-inovacao
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem por padrão.)
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, montarEmail, type DadosNotificacao, type TipoNotificacao } from "../_shared/email.ts";

const LOTE = 25;          // e-mails por execução
const MAX_TENTATIVAS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const remetente = Deno.env.get("EMAIL_REMETENTE") ?? "Central de Inovação <onboarding@resend.dev>";
  const urlApp = Deno.env.get("URL_APP") ?? "https://example.com";

  if (!resendKey) {
    return json({ erro: "RESEND_API_KEY não configurada nos secrets." }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: fila, error } = await supabase
    .from("notificacoes")
    .select("*")
    .eq("status", "pendente")
    .lt("tentativas", MAX_TENTATIVAS)
    .order("criado_em", { ascending: true })
    .limit(LOTE);

  if (error) return json({ erro: error.message }, 500);
  if (!fila?.length) return json({ enviadas: 0, mensagem: "Fila vazia." });

  let enviadas = 0;
  const falhas: string[] = [];

  for (const n of fila) {
    const { html, texto } = montarEmail(
      n.tipo as TipoNotificacao,
      (n.dados ?? {}) as DadosNotificacao,
      urlApp,
    );

    let ok = false;
    let erro: string | undefined;

    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: remetente,
          to: [n.para_email],
          subject: n.assunto,
          html,
          text: texto,
        }),
      });
      ok = r.ok;
      if (!ok) erro = `Resend ${r.status}: ${(await r.text()).slice(0, 400)}`;
    } catch (e) {
      erro = String(e);
    }

    if (ok) {
      enviadas++;
      await supabase.from("notificacoes")
        .update({ status: "enviada", enviada_em: new Date().toISOString(), erro: null })
        .eq("id", n.id);
    } else {
      falhas.push(erro ?? "erro desconhecido");
      const tentativas = (n.tentativas ?? 0) + 1;
      await supabase.from("notificacoes")
        .update({
          tentativas,
          erro: erro?.slice(0, 500),
          status: tentativas >= MAX_TENTATIVAS ? "erro" : "pendente",
        })
        .eq("id", n.id);
    }
  }

  return json({ enviadas, falhas: falhas.length, detalhes: falhas.slice(0, 3) });
});

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
