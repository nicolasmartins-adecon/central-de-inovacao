// =============================================================================
// Edge Function: lembretes-prazos
//
// Roda uma vez por dia, às 13h30 de Brasília (16h30 UTC), e avisa quem se
// inscreveu para acompanhar os prazos:
//
//   · 7 dias antes   · 3 dias antes   · 1 dia antes
//
// Quem recebe cada aviso:
//   - o responsável pela etapa (campo "e-mail do responsável"), sempre;
//   - o responsável pelo projeto, nos avisos de término;
//   - todo mundo inscrito naquele projeto;
//   - quem se inscreveu em "todos os projetos internos".
//
// Etapas já vencidas rendem um aviso diário só para o responsável, até serem
// concluídas ou repactuadas — evita encher a caixa de todo mundo.
//
// O índice uq_notificacoes_prazo_dia garante um aviso por pessoa, por alvo,
// por dia: rodar a função duas vezes no mesmo dia não duplica e-mail.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS } from "../_shared/email.ts";

const JANELAS = [7, 3, 1];          // dias de antecedência
const FUSO = "America/Sao_Paulo";

type Inscricao = { email: string; nome: string | null; projeto_id: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  /* A data de hoje no fuso de Brasília, não no do servidor. */
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
  const emDias = (n: number) => {
    const d = new Date(hoje + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const diasAte = (iso: string) =>
    Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(hoje + "T12:00:00Z")) / 86400000);

  const alvos = JANELAS.map(emDias);
  const limite = alvos[0];                     // a janela mais distante

  /* ---- quem quer ser avisado ---- */
  const { data: inscricoes, error: erroInsc } = await supabase
    .from("inscricoes").select("email, nome, projeto_id").eq("ativo", true);
  if (erroInsc) return json({ erro: erroInsc.message }, 500);

  const gerais = (inscricoes ?? []).filter((i: Inscricao) => !i.projeto_id);
  const porProjeto = new Map<string, Inscricao[]>();
  (inscricoes ?? []).forEach((i: Inscricao) => {
    if (!i.projeto_id) return;
    const lista = porProjeto.get(i.projeto_id) ?? [];
    lista.push(i);
    porProjeto.set(i.projeto_id, lista);
  });

  /** E-mails que devem receber um aviso deste projeto, sem repetir ninguém. */
  function destinatarios(projetoId: string, tipoProjeto: string, ...extras: (string | null)[]) {
    const mapa = new Map<string, string>();          // e-mail em minúsculas -> nome
    const por = (email?: string | null, nome?: string | null) => {
      const e = (email ?? "").trim();
      if (!e || !e.includes("@")) return;
      const chave = e.toLowerCase();
      if (!mapa.has(chave)) mapa.set(chave, nome?.trim() || "");
    };
    extras.forEach(e => por(e));
    (porProjeto.get(projetoId) ?? []).forEach(i => por(i.email, i.nome));
    // "todos os projetos internos" vale só para os projetos internos
    if (tipoProjeto === "Projeto Interno") gerais.forEach(i => por(i.email, i.nome));
    return [...mapa.entries()].map(([email, nome]) => ({ email, nome }));
  }

  const fila: Array<Record<string, unknown>> = [];

  /* ---- prazos das etapas ---- */
  const { data: etapas, error: erroEtapas } = await supabase
    .from("etapas")
    .select("id, numero, descricao, responsavel, responsavel_email, data_entrega, projeto_id, " +
            "projetos(nome, tipo, responsavel_email)")
    .eq("concluida", false)
    .not("data_entrega", "is", null)
    .lte("data_entrega", limite);
  if (erroEtapas) return json({ erro: erroEtapas.message }, 500);

  for (const e of etapas ?? []) {
    const entrega = String(e.data_entrega);
    const p = (e as { projetos?: { nome?: string; tipo?: string } }).projetos ?? {};
    const projeto = p.nome ?? "Projeto";
    const dias = diasAte(entrega);

    if (JANELAS.includes(dias)) {
      for (const d of destinatarios(String(e.projeto_id), p.tipo ?? "", e.responsavel_email)) {
        fila.push({
          tipo: "prazo_proximo",
          para_email: d.email,
          assunto: `Faltam ${dias} dia${dias > 1 ? "s" : ""}: etapa ${e.numero} — ${projeto}`,
          dados: {
            etapa_id: e.id, projeto_id: e.projeto_id, projeto,
            numero: e.numero, descricao: e.descricao, responsavel: e.responsavel,
            data_entrega: entrega, dias, para_nome: d.nome
          }
        });
      }
    } else if (dias < 0 && e.responsavel_email) {
      fila.push({
        tipo: "prazo_vencido",
        para_email: String(e.responsavel_email).toLowerCase(),
        assunto: `Etapa ${e.numero} está atrasada — ${projeto}`,
        dados: {
          etapa_id: e.id, projeto_id: e.projeto_id, projeto,
          numero: e.numero, descricao: e.descricao, responsavel: e.responsavel,
          data_entrega: entrega, dias: 0
        }
      });
    }
  }

  /* ---- término dos projetos ---- */
  const { data: projetos, error: erroProj } = await supabase
    .from("projetos")
    .select("id, nome, tipo, termino, responsavel, responsavel_email, objetivo")
    .not("termino", "is", null)
    .in("termino", alvos)
    .neq("status", "Concluído");
  if (erroProj) return json({ erro: erroProj.message }, 500);

  for (const p of projetos ?? []) {
    const dias = diasAte(String(p.termino));
    if (!JANELAS.includes(dias)) continue;
    for (const d of destinatarios(String(p.id), String(p.tipo), p.responsavel_email)) {
      fila.push({
        tipo: "prazo_projeto",
        para_email: d.email,
        assunto: `Faltam ${dias} dia${dias > 1 ? "s" : ""} para o término de ${p.nome}`,
        dados: {
          projeto_id: p.id, projeto: p.nome, descricao: p.objetivo,
          responsavel: p.responsavel, data_entrega: p.termino, dias, para_nome: d.nome
        }
      });
    }
  }

  if (!fila.length) return json({ enfileiradas: 0, hoje, mensagem: "Nenhum prazo na janela de hoje." });

  const { error: erroInsert, count } = await supabase
    .from("notificacoes")
    .upsert(fila, { ignoreDuplicates: true, count: "exact" });
  if (erroInsert) return json({ erro: erroInsert.message }, 500);

  /* dispara o envio na sequência, sem esperar o próximo ciclo do cron */
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enviar-notificacoes`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
  } catch { /* o cron de 2 em 2 minutos cobre */ }

  return json({ enfileiradas: count ?? fila.length, hoje, janelas: JANELAS });
});

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
