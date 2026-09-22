// =============================================================================
// Template de e-mail da Central de Inovação + envio via Resend.
// Compartilhado pelas Edge Functions.
// =============================================================================

export type TipoNotificacao =
  | "etapa_atribuida"
  | "comentario_novo"
  | "etapa_concluida"
  | "prazo_proximo"
  | "prazo_projeto"
  | "prazo_vencido"
  | "resumo_semanal";

export interface DadosNotificacao {
  etapa_id?: string;
  projeto_id?: string;
  projeto?: string;
  numero?: number | string;
  descricao?: string;
  responsavel?: string;
  data_entrega?: string;
  autor?: string;
  corpo?: string;
  dias?: number;
  para_nome?: string;
  itens?: Array<{ projeto: string; numero: string; descricao: string; data: string }>;
}

const MARCA = {
  tinta: "#0B1017",
  painel: "#121A24",
  linha: "#22303F",
  texto: "#E7EDF4",
  suave: "#8595A8",
  laranja: "#FF5A1F",
  agua: "#4ED6C0",
  alerta: "#E5484D",
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataBR(iso?: string): string {
  if (!iso) return "sem data";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** "Oi, Fulano: " quando sabemos o nome de quem recebe. */
function saudacao(d: DadosNotificacao): string {
  const nome = (d.para_nome ?? "").trim().split(/\s+/)[0];
  return nome ? `Oi, ${esc(nome)}: ` : "";
}

/** Copy de cada tipo de notificação: sobrelinha, título e chamada. */
function copy(tipo: TipoNotificacao, d: DadosNotificacao) {
  switch (tipo) {
    case "etapa_atribuida":
      return {
        eyebrow: "Nova responsabilidade",
        titulo: `Etapa ${d.numero} é sua`,
        cor: MARCA.laranja,
        corpo: `Você ficou responsável por uma etapa do projeto <strong>${esc(d.projeto)}</strong>.`,
        acao: "Abrir a etapa",
      };
    case "comentario_novo":
      return {
        eyebrow: "Novo comentário",
        titulo: `${esc(d.autor)} comentou na etapa ${d.numero}`,
        cor: MARCA.agua,
        corpo: `<em style="color:${MARCA.texto}">“${esc(d.corpo)}”</em>`,
        acao: "Responder na Central",
      };
    case "etapa_concluida":
      return {
        eyebrow: "Entrega registrada",
        titulo: `Etapa ${d.numero} concluída`,
        cor: "#35C07E",
        corpo: `A etapa foi marcada como concluída em <strong>${esc(d.projeto)}</strong>.`,
        acao: "Ver o projeto",
      };
    case "prazo_proximo": {
      const dias = Number(d.dias ?? 0);
      // 7 dias é aviso, 3 é lembrete, 1 é véspera — o tom acompanha
      const tons: Record<number, string> = { 7: "#4ED6C0", 3: "#F6C445", 1: "#FF8A4C" };
      return {
        eyebrow: dias >= 7 ? "Uma semana pela frente" : dias <= 1 ? "É amanhã" : "Reta final",
        titulo: dias <= 1
          ? `Etapa ${d.numero} vence amanhã`
          : `Faltam ${dias} dias para a etapa ${d.numero}`,
        cor: tons[dias] ?? "#F6C445",
        corpo: `${saudacao(d)}entrega prevista para <strong>${dataBR(d.data_entrega)}</strong> ` +
               `no projeto ${esc(d.projeto)}.`,
        acao: "Abrir a etapa",
      };
    }
    case "prazo_projeto": {
      const dias = Number(d.dias ?? 0);
      const tons: Record<number, string> = { 7: "#4ED6C0", 3: "#F6C445", 1: "#FF8A4C" };
      return {
        eyebrow: "Término do projeto",
        titulo: dias <= 1
          ? `${esc(d.projeto)} termina amanhã`
          : `Faltam ${dias} dias para encerrar ${esc(d.projeto)}`,
        cor: tons[dias] ?? "#F6C445",
        corpo: `${saudacao(d)}o término está previsto para <strong>${dataBR(d.data_entrega)}</strong>. ` +
               "Vale conferir se as etapas em aberto ainda cabem no prazo.",
        acao: "Ver o projeto",
      };
    }
    case "prazo_vencido":
      return {
        eyebrow: "Fora do prazo",
        titulo: `Etapa ${d.numero} está atrasada`,
        cor: MARCA.alerta,
        corpo: `O prazo era <strong>${dataBR(d.data_entrega)}</strong>. Registre o andamento ou repactue a data.`,
        acao: "Resolver agora",
      };
    default:
      return {
        eyebrow: "Central de Inovação",
        titulo: "Atualização",
        cor: MARCA.laranja,
        corpo: "",
        acao: "Abrir a Central",
      };
  }
}

/** Monta o HTML do e-mail. Tabelas + estilo inline: é o que sobrevive nos clientes. */
export function montarEmail(
  tipo: TipoNotificacao,
  dados: DadosNotificacao,
  urlApp: string,
): { html: string; texto: string } {
  const c = copy(tipo, dados);
  const link = dados.projeto_id
    ? `${urlApp.replace(/\/$/, "")}/#/projeto/${dados.projeto_id}`
    : urlApp;

  const linhas: Array<[string, string]> = [];
  if (dados.projeto) linhas.push(["Projeto", esc(dados.projeto)]);
  if (dados.descricao) linhas.push(["Etapa", esc(dados.descricao)]);
  if (dados.responsavel) linhas.push(["Responsável", esc(dados.responsavel)]);
  if (dados.data_entrega) linhas.push(["Entrega", dataBR(dados.data_entrega)]);

  const tabela = linhas.map(([k, v]) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${MARCA.linha};color:${MARCA.suave};
                 font:500 11px/1.4 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.08em;
                 text-transform:uppercase;width:120px;vertical-align:top">${k}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${MARCA.linha};color:${MARCA.texto};
                 font:400 14px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${v}</td>
    </tr>`).join("");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.titulo)}</title></head>
<body style="margin:0;padding:24px 12px;background:${MARCA.tinta}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${MARCA.painel};border:1px solid ${MARCA.linha};border-radius:14px;overflow:hidden">
      <tr><td style="height:3px;background:${c.cor};line-height:3px;font-size:0">&nbsp;</td></tr>
      <tr><td style="padding:26px 28px 8px">
        <div style="color:${MARCA.suave};font:600 10px/1 'IBM Plex Mono',ui-monospace,monospace;
                    letter-spacing:.18em;text-transform:uppercase">Central de Inovação · Adecon</div>
        <div style="color:${c.cor};font:600 11px/1 'IBM Plex Mono',ui-monospace,monospace;
                    letter-spacing:.14em;text-transform:uppercase;margin-top:16px">${esc(c.eyebrow)}</div>
        <h1 style="margin:8px 0 0;color:${MARCA.texto};
                   font:700 24px/1.25 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${esc(c.titulo)}</h1>
        <p style="margin:12px 0 0;color:${MARCA.suave};
                  font:400 15px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${c.corpo}</p>
      </td></tr>
      <tr><td style="padding:18px 28px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tabela}</table>
      </td></tr>
      <tr><td style="padding:24px 28px 30px">
        <a href="${esc(link)}"
           style="display:inline-block;background:${MARCA.laranja};color:#0B1017;text-decoration:none;
                  padding:12px 22px;border-radius:9px;
                  font:600 14px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${esc(c.acao)}</a>
      </td></tr>
    </table>
    <p style="margin:16px 4px 0;color:#5A6A7C;
              font:400 12px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      Você recebe este aviso porque se inscreveu para acompanhar prazos na Central de
      Inovação, ou porque está como responsável por uma etapa.
      Para mudar isso, abra a Central e vá em <strong>Conexão → Avisos por e-mail</strong>.
    </p>
  </td></tr>
</table>
</body></html>`;

  const texto = [
    c.eyebrow.toUpperCase(),
    c.titulo,
    "",
    c.corpo.replace(/<[^>]+>/g, ""),
    "",
    ...linhas.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, "")}`),
    "",
    link,
  ].join("\n");

  return { html, texto };
}

/** Envia um e-mail pela API do Resend. */
export async function enviarPeloResend(opts: {
  apiKey: string;
  de: string;
  para: string;
  assunto: string;
  html: string;
  texto: string;
}): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.de,
      to: [opts.para],
      subject: opts.assunto,
      html: opts.html,
      text: opts.texto,
    }),
  });

  if (!r.ok) {
    return { ok: false, erro: `Resend ${r.status}: ${await r.text()}` };
  }
  const json = await r.json().catch(() => ({}));
  return { ok: true, id: json?.id };
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
