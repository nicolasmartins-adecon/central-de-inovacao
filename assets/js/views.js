/* =============================================================================
   TELAS
   Cada função devolve um nó de DOM. O roteador (app.js) troca o conteúdo.
   ========================================================================== */

window.CI = window.CI || {};

CI.views = (function () {
  const U = CI.ui;
  const { h, ic, svgEl, chip, anel, campo, entrada, area, selecao } = U;
  const db = CI.db;

  const TOM_PRIO = { Alta: "var(--crit)", "Média": "var(--warn)", Baixa: "var(--d-agua)" };
  const TOM_STATUS = {
    "Planejado": "var(--muted)", "Em andamento": "var(--accent)",
    "Em risco": "var(--crit)", "Concluído": "var(--ok)", "Pausado": "var(--faint)"
  };
  const TIPOS = ["Projeto Interno", "Iniciativa", "Ponto de Atenção", "Processo", "Ferramenta"];
  const PRIORIDADES = ["Alta", "Média", "Baixa"];
  const STATUS = ["Planejado", "Em andamento", "Em risco", "Concluído", "Pausado"];
  const COLUNAS_QUADRO = ["Iniciativas", "Projetos Internos", "Pontos de Atenção", "Processos", "Ferramentas"];

  /* ---- cálculos compartilhados ------------------------------------------ */

  function estat(projetoId) {
    const etapas = db.etapasDe(projetoId);
    const feitas = etapas.filter(e => e.concluida).length;
    const atrasadas = etapas.filter(e => !e.concluida && e.data_entrega && U.diasAte(e.data_entrega) < 0).length;
    const pendentes = etapas.filter(e => !e.concluida && e.data_entrega);
    pendentes.sort((a, b) => String(a.data_entrega).localeCompare(String(b.data_entrega)));
    return {
      total: etapas.length, feitas, atrasadas,
      pct: etapas.length ? Math.round((feitas / etapas.length) * 100) : 0,
      proxima: pendentes[0] || null
    };
  }

  // A cor guardada é a cor de marca; corVisivel() só ajusta a luminosidade
  // para o tema em uso, de modo que o preto da Presidência não suma no escuro.
  function corBrutaDiretoria(id) {
    return db.diretoria(id)?.cor || "#7B8B9F";
  }

  function corDiretoria(id) {
    return U.corVisivel(corBrutaDiretoria(id));
  }

  function corProjeto(p) {
    return U.corVisivel(p && p.cor ? p.cor : corBrutaDiretoria(p && p.diretoria_id));
  }

  function nomeDiretoria(id) {
    return db.diretoria(id)?.nome || "Sem diretoria";
  }

  /* Presidência e Diretorias em Conexão aparecem e funcionam como qualquer
     outra diretoria; só não entram quando o número é o assunto. */
  const diretoriasContaveis = () => db.dados.diretorias.filter(d => d.conta_no_total !== false);

  /* "das seis diretorias" — o texto acompanha o cadastro, sem número na mão. */
  const EXTENSO = ["nenhuma", "uma", "duas", "três", "quatro", "cinco", "seis",
                   "sete", "oito", "nove", "dez", "onze", "doze"];
  function fraseDiretorias(n) {
    if (n === 1) return "da diretoria";
    return `das ${EXTENSO[n] || n} diretorias`;
  }

  /* ---- ações compartilhadas ---------------------------------------------
     Uma ação é UMA linha no banco. `diretoria_id` é a diretoria responsável e
     `diretorias_apoio` guarda as demais envolvidas. Ela aparece no quadro de
     todas, mas os indicadores contam a linha — nunca as participações.
     ---------------------------------------------------------------------- */

  function diretoriasDe(reg) {
    const ids = [];
    if (reg && reg.diretoria_id) ids.push(reg.diretoria_id);
    ((reg && reg.diretorias_apoio) || []).forEach(id => {
      if (id && !ids.includes(id)) ids.push(id);
    });
    return ids;
  }

  const participa = (reg, dirId) => diretoriasDe(reg).includes(dirId);

  /* ---- avisos por e-mail ------------------------------------------------
     Cada pessoa cadastra o próprio e-mail e escolhe o que acompanhar.
     projeto_id nulo = quer saber de todos os projetos internos.
     ---------------------------------------------------------------------- */

  const normEmail = e => String(e || "").trim().toLowerCase();

  const inscricoesDe = email => db.dados.inscricoes
    .filter(i => normEmail(i.email) === normEmail(email));

  const seguidoresDe = projetoId => db.dados.inscricoes
    .filter(i => i.ativo !== false && (i.projeto_id === projetoId || !i.projeto_id));

  function segueProjeto(email, projetoId) {
    if (!normEmail(email)) return false;
    return inscricoesDe(email).some(i => !i.projeto_id || i.projeto_id === projetoId);
  }

  /** Acerta as inscrições de um e-mail para exatamente a seleção pedida. */
  async function salvarInscricoes(email, nome, todos, ids) {
    const e = normEmail(email);
    const atuais = inscricoesDe(e);
    const desejadas = todos ? [null] : (ids || []).slice();

    for (const i of atuais) {
      const alvo = i.projeto_id || null;
      if (!desejadas.some(d => (d || null) === alvo)) await db.excluir("inscricoes", i.id);
    }
    for (const d of desejadas) {
      const ja = atuais.find(i => (i.projeto_id || null) === (d || null));
      if (ja) {
        if ((ja.nome || "") !== nome) await db.atualizar("inscricoes", ja.id, { nome });
      } else {
        await db.criar("inscricoes", { email: e, nome, projeto_id: d, ativo: true });
      }
    }
  }
  const compartilhada = reg => diretoriasDe(reg).length > 1;

  /** Siglas das outras diretorias envolvidas, para marcar o que é conjunto. */
  function selosCompartilhado(reg, exceto) {
    const outras = diretoriasDe(reg).filter(id => id !== exceto).map(id => db.diretoria(id)).filter(Boolean);
    if (!outras.length) return null;
    const mostrar = outras.slice(0, 4);
    return h("span.selos",
      h("span.selos-rot", "+"),
      ...mostrar.map(d => h("span.selo", {
        estilo: { background: U.corVisivel(d.cor), color: U.corTexto(d.cor) },
        title: d.nome
      }, d.sigla || d.nome.slice(0, 3))),
      outras.length > mostrar.length ? h("span.selos-rot", `+${outras.length - mostrar.length}`) : null
    );
  }

  /** Grade de botõezinhos para escolher as diretorias envolvidas. */
  function seletorDiretorias(iniciais, principalInicial) {
    let escolhidas = new Set((iniciais || []).filter(Boolean));
    let principal = principalInicial;
    const caixa = h("div.multi-dir");

    function pintar() {
      U.limpar(caixa);
      db.dados.diretorias.forEach(d => {
        const ehPrincipal = d.id === principal;
        const ativa = ehPrincipal || escolhidas.has(d.id);
        const b = h("button.dir-toggle" + (ativa ? ".ativa" : "") + (ehPrincipal ? ".principal" : ""), {
          type: "button",
          title: ehPrincipal ? `${d.nome} — responsável, sempre incluída` : d.nome,
          estilo: ativa ? { "--tom": U.corVisivel(d.cor) } : {},
          onclick: () => {
            if (ehPrincipal) return;
            escolhidas.has(d.id) ? escolhidas.delete(d.id) : escolhidas.add(d.id);
            pintar();
          }
        }, h("i.ponto-dir", { estilo: { background: U.corVisivel(d.cor) } }), d.sigla || d.nome);
        caixa.appendChild(b);
      });
    }
    pintar();

    return {
      el: caixa,
      sincronizar(novoPrincipal) { principal = novoPrincipal; escolhidas.delete(novoPrincipal); pintar(); },
      valor() { return [...escolhidas].filter(id => id !== principal); }
    };
  }

  function chipPrazo(etapa) {
    if (etapa.concluida) return chip("Concluída", "ok");
    if (!etapa.data_entrega) return chip("Sem data");
    const d = U.diasAte(etapa.data_entrega);
    if (d < 0) return chip(`${Math.abs(d)} d de atraso`, "crit");
    if (d === 0) return chip("Vence hoje", "warn");
    if (d <= 7) return chip(`Em ${d} d`, "warn");
    return chip(U.dataBR(etapa.data_entrega));
  }

  function etapaAtrasada(e) {
    return !e.concluida && e.data_entrega && U.diasAte(e.data_entrega) < 0;
  }

  /* ---- gráfico de barras horizontais ------------------------------------ */

  function barras(dados, opcoes = {}) {
    if (!dados.length) return U.vazio("pulso", "Sem dados ainda", "Cadastre projetos para ver a distribuição.");
    const max = Math.max(1, ...dados.map(d => d.valor));
    return h("div", { estilo: { display: "flex", flexDirection: "column", gap: "10px" } },
      ...dados.map(d => h("div", { estilo: { display: "grid", gridTemplateColumns: "minmax(88px,150px) 1fr auto", gap: "10px", alignItems: "center" } },
        h("span.truncar", { estilo: { fontSize: "12.5px", color: "var(--txt-2)" }, title: d.rotulo }, d.rotulo),
        h("div", { estilo: { height: "8px", borderRadius: "99px", background: "var(--raise-2)", overflow: "hidden" } },
          h("i", {
            estilo: {
              display: "block", height: "100%", borderRadius: "99px",
              background: d.tom || "var(--accent)",
              width: Math.round((d.valor / max) * 100) + "%",
              transition: "width .7s cubic-bezier(.22,1,.36,1)"
            }
          })
        ),
        h("span.dado", { estilo: { fontSize: "12px", color: "var(--txt)", minWidth: "22px", textAlign: "right" } },
          opcoes.sufixo ? d.valor + opcoes.sufixo : d.valor)
      ))
    );
  }

  /* =========================================================================
     PAINEL
     ====================================================================== */

  function vPainel() {
    const projetos = db.dados.projetos;
    const internos = projetos.filter(p => p.tipo === "Projeto Interno");
    const etapas = db.dados.etapas;
    const feitas = etapas.filter(e => e.concluida).length;
    const atrasadas = etapas.filter(etapaAtrasada);
    const impl = db.dados.implementacoes;
    const implementados = impl.filter(i => i.status === "Implementado").length;
    const tip = impl.length ? Math.round((implementados / impl.length) * 100) : 0;
    const concluidos = internos.filter(p => p.status === "Concluído").length;

    const kpis = h("div.grade.g-kpi.surge",
      kpi({
        nome: "Projetos internos", desc: `${concluidos} com objetivo atingido`,
        valor: internos.length, pct: internos.length ? (concluidos / internos.length) * 100 : 0,
        tom: "var(--accent)"
      }),
      kpi({
        nome: "Etapas concluídas", desc: `${feitas} de ${etapas.length} etapas cadastradas`,
        valor: etapas.length ? Math.round((feitas / etapas.length) * 100) : 0, sufixo: "%",
        pct: etapas.length ? (feitas / etapas.length) * 100 : 0, tom: "var(--ok)"
      }),
      kpi({
        nome: "Entregas fora do prazo", desc: atrasadas.length ? "Precisam de repactuação" : "Nenhuma pendência vencida",
        valor: atrasadas.length,
        pct: etapas.length ? (atrasadas.length / etapas.length) * 100 : 0,
        tom: atrasadas.length ? "var(--crit)" : "var(--ok)"
      }),
      kpi({
        nome: "TIP", desc: `${implementados} de ${impl.length} processos e ferramentas`,
        valor: tip, sufixo: "%", pct: tip, tom: "var(--d-agua)"
      })
    );

    /* carteira */
    const ordenados = internos.slice().sort((a, b) => {
      const pa = PRIORIDADES.indexOf(a.prioridade), pb = PRIORIDADES.indexOf(b.prioridade);
      if (pa !== pb) return pa - pb;
      return String(a.inicio || "9").localeCompare(String(b.inicio || "9"));
    });

    const carteira = h("section.painel",
      h("div.painel-hd",
        h("h2", "Carteira de projetos internos"),
        h("div.acoes",
          h("button.btn.btn-p", { type: "button", onclick: () => (location.hash = "#/projetos") }, "Ver todos", ic("setaDir"))
        )
      ),
      h("div.painel-bd",
        ordenados.length
          ? h("div", { estilo: { display: "flex", flexDirection: "column", gap: "3px" } },
              ...ordenados.slice(0, 8).map(p => {
                const s = estat(p.id);
                return h("button", {
                  type: "button",
                  estilo: {
                    display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(46px,110px) 54px", gap: "12px",
                    alignItems: "center", padding: "10px 8px", background: "none", border: 0,
                    borderRadius: "8px", cursor: "pointer", textAlign: "left", width: "100%"
                  },
                  onmouseenter: e => (e.currentTarget.style.background = "var(--panel-2)"),
                  onmouseleave: e => (e.currentTarget.style.background = "none"),
                  onclick: () => (location.hash = "#/projeto/" + p.id)
                },
                  h("div", { estilo: { minWidth: 0 } },
                    h("div", { estilo: { display: "flex", alignItems: "center", gap: "8px" } },
                      h("i", { estilo: { width: "3px", height: "14px", borderRadius: "3px", background: TOM_PRIO[p.prioridade], flex: "none" } }),
                      h("span.truncar", { estilo: { fontSize: "13.5px", fontWeight: 500 } }, p.nome)
                    ),
                    h("div", { estilo: { font: "400 11px/1.4 var(--f-dado)", color: "var(--muted)", marginTop: "3px", paddingLeft: "11px" } },
                      nomeDiretoria(p.diretoria_id) + (s.total ? ` · ${s.feitas}/${s.total} etapas` : " · sem etapas"))
                  ),
                  h("div.progresso", h("i", { estilo: { width: s.pct + "%", "--tom": corDiretoria(p.diretoria_id) } })),
                  h("span.dado", { estilo: { fontSize: "12px", textAlign: "right", color: s.atrasadas ? "var(--crit)" : "var(--txt-2)" } },
                    s.atrasadas ? `${s.atrasadas} atras.` : s.pct + "%")
                );
              })
            )
          : U.vazio("camadas", "Nenhum projeto ainda", "Crie o primeiro projeto interno para começar a acompanhar as etapas.",
              h("button.btn.btn-primario", { type: "button", onclick: () => modalProjeto() }, ic("mais"), "Novo projeto"))
      )
    );

    /* próximas entregas */
    const proximas = db.dados.etapas
      .filter(e => !e.concluida && e.data_entrega)
      .sort((a, b) => String(a.data_entrega).localeCompare(String(b.data_entrega)))
      .slice(0, 7);

    const entregas = h("section.painel",
      h("div.painel-hd", h("h2", "Próximas entregas"),
        h("div.acoes", chip(`${atrasadas.length} fora do prazo`, atrasadas.length ? "crit" : "ok"))),
      h("div.painel-bd.sem-pad",
        proximas.length
          ? h("div", ...proximas.map(e => {
              const p = db.projeto(e.projeto_id);
              return h("button", {
                type: "button",
                estilo: {
                  display: "flex", gap: "10px", alignItems: "center", width: "100%",
                  padding: "11px 16px", background: "none", border: 0,
                  borderBottom: "1px solid var(--line-soft)", cursor: "pointer", textAlign: "left"
                },
                onmouseenter: ev => (ev.currentTarget.style.background = "var(--panel-2)"),
                onmouseleave: ev => (ev.currentTarget.style.background = "none"),
                onclick: () => { location.hash = "#/projeto/" + e.projeto_id; setTimeout(() => gavetaEtapa(e.id), 90); }
              },
                h("div", { estilo: { minWidth: 0, flex: "1 1 auto" } },
                  h("div.truncar", { estilo: { fontSize: "13px" } }, e.descricao || "Etapa sem descrição"),
                  h("div", { estilo: { font: "400 11px/1.4 var(--f-dado)", color: "var(--muted)", marginTop: "2px" } },
                    `${p?.nome || "—"} · etapa ${e.numero}`)
                ),
                chipPrazo(e)
              );
            }))
          : U.vazio("check", "Nada no radar", "Nenhuma etapa em aberto com data definida.")
      )
    );

    /* distribuição por diretoria */
    const porDiretoria = db.dados.diretorias
      .map(d => ({
        rotulo: d.nome,
        valor: projetos.filter(p => participa(p, d.id)).length,
        tom: U.corVisivel(d.cor)
      }))
      .filter(d => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);

    const conjuntas = projetos.filter(compartilhada).length;

    const distribuicao = h("section.painel",
      h("div.painel-hd", h("h2", "Carga por diretoria"),
        h("div.acoes", h("span.rotulo", "participações"))),
      h("div.painel-bd",
        barras(porDiretoria),
        h("p.discreto", { estilo: { fontSize: "11.5px", marginTop: "12px", lineHeight: 1.55 } },
          `${projetos.length} ações no total` +
          (conjuntas ? `, sendo ${conjuntas} tocadas por mais de uma diretoria. ` +
                       "A soma das barras é maior porque uma ação conjunta aparece em cada diretoria envolvida — " +
                       "nos indicadores ela continua valendo uma."
                     : "."))
      )
    );

    /* movimentação */
    const movimento = db.dados.comentarios.slice()
      .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
      .slice(0, 5);

    const recente = h("section.painel",
      h("div.painel-hd", h("h2", "Movimentação recente")),
      h("div.painel-bd",
        movimento.length
          ? h("div.conversa", ...movimento.map(c => {
              const e = db.dados.etapas.find(x => x.id === c.etapa_id);
              const p = e ? db.projeto(e.projeto_id) : null;
              return h("div.comentario",
                h("div.avatar", U.iniciais(c.autor_nome)),
                h("div.comentario-corpo",
                  h("div.comentario-cab", h("b", c.autor_nome), h("time", U.relativo(c.criado_em))),
                  h("div", { estilo: { font: "400 11px/1.4 var(--f-dado)", color: "var(--faint)", marginTop: "2px" } },
                    p ? `${p.nome} · etapa ${e.numero}` : ""),
                  h("div.comentario-txt", c.corpo)
                )
              );
            }))
          : U.vazio("balao", "Sem comentários", "As conversas das etapas aparecem aqui.")
      )
    );

    return h("div.view",
      kpis,
      h("div.grade.g-2.surge", { estilo: { marginTop: "14px" } }, carteira, entregas),
      h("div.grade.g-2.surge", { estilo: { marginTop: "14px" } }, distribuicao, recente)
    );
  }

  function kpi({ nome, desc, valor, sufixo, pct, tom }) {
    return h("article.kpi", { estilo: { "--tom": tom } },
      h("div.kpi-txt",
        h("div.kpi-nome", nome),
        h("div.kpi-desc", desc),
        h("div.kpi-valor", String(valor), sufixo ? h("small", sufixo) : null)
      ),
      anel(pct, tom)
    );
  }

  /* =========================================================================
     CRONOGRAMA
     ====================================================================== */

  const SEM_POR_MES = 5;
  const TOTAL_SEM = 12 * SEM_POR_MES;
  let anoCrono = (window.CI_CONFIG && window.CI_CONFIG.ANO_CICLO) || new Date().getFullYear();
  let filtroCronoDir = "";

  function colunaDe(iso, ano) {
    const d = U.paraData(iso);
    if (!d) return null;
    if (d.getFullYear() < ano) return 0;
    if (d.getFullYear() > ano) return TOTAL_SEM - 1;
    const semana = Math.min(Math.ceil(d.getDate() / 7), SEM_POR_MES);
    return d.getMonth() * SEM_POR_MES + (semana - 1);
  }

  function somaDias(iso, dias) {
    const d = U.paraData(iso);
    if (!d) return iso;
    d.setDate(d.getDate() + dias);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }

  function vCronograma() {
    const anos = new Set([anoCrono, new Date().getFullYear()]);
    db.dados.projetos.forEach(p => {
      [p.inicio, p.termino].forEach(v => { const d = U.paraData(v); if (d) anos.add(d.getFullYear()); });
    });
    const listaAnos = [...anos].sort();

    let projetos = db.dados.projetos.filter(p => p.inicio || p.termino);
    if (filtroCronoDir) projetos = projetos.filter(p => participa(p, filtroCronoDir));
    projetos.sort((a, b) => {
      const pa = PRIORIDADES.indexOf(a.prioridade), pb = PRIORIDADES.indexOf(b.prioridade);
      if (pa !== pb) return pa - pb;
      return String(a.inicio || "9").localeCompare(String(b.inicio || "9"));
    });

    const semData = db.dados.projetos.filter(p => !p.inicio && !p.termino);

    const grade = h("div.crono", { estilo: { "--semanas": TOTAL_SEM, "--cel": "26px" } });

    /* cabeçalho */
    const cabeca = h("div.crono-cabeca",
      h("div.crono-canto", h("span.rotulo", `Ciclo ${anoCrono}`))
    );
    for (let t = 0; t < 4; t++) {
      cabeca.appendChild(h("div.crono-h.tri", {
        estilo: { gridColumn: `${2 + t * 15} / span 15` }
      }, `${t + 1}º trimestre`));
    }
    for (let m = 0; m < 12; m++) {
      cabeca.appendChild(h("div.crono-h.mes", {
        estilo: { gridColumn: `${2 + m * SEM_POR_MES} / span ${SEM_POR_MES}` }
      }, U.MESES_C[m]));
    }
    for (let s = 0; s < TOTAL_SEM; s++) {
      const fimMes = (s + 1) % SEM_POR_MES === 0;
      const fimTri = (s + 1) % 15 === 0;
      cabeca.appendChild(h("div.crono-h.sem" + (fimTri ? ".fim-tri" : fimMes ? ".fim-mes" : ""), String((s % SEM_POR_MES) + 1)));
    }
    grade.appendChild(cabeca);

    /* linhas */
    projetos.forEach(p => {
      const s = estat(p.id);
      const linha = h("div.crono-linha");

      linha.appendChild(h("div.crono-proj", {
        onclick: () => (location.hash = "#/projeto/" + p.id),
        title: p.nome
      },
        h("i.barra-prio", { estilo: { background: TOM_PRIO[p.prioridade] } }),
        h("div", { estilo: { minWidth: 0 } },
          h("div.nome.truncar", p.nome),
          h("div.sub", `${p.prioridade} · ${s.total ? s.pct + "%" : "sem etapas"}`)
        )
      ));

      const faixa = h("div.crono-faixa");

      /* A barra é o pedaço do projeto que cai DENTRO do ciclo mostrado.
         Com só uma das duas datas preenchidas ela vira uma barra de uma
         semana — antes o projeto simplesmente sumia da grade e sobrava uma
         linha vazia, sem explicação. `colunaDe` já apara o que passa do ano,
         então um projeto que atravessa dezembro aparece nos dois ciclos. */
      const dataA = p.inicio || p.termino;
      const dataB = p.termino || p.inicio;
      const dA = U.paraData(dataA), dB = U.paraData(dataB);
      const [de, ate] = (dA && dB && dA > dB) ? [dataB, dataA] : [dataA, dataB];
      const dDe = U.paraData(de), dAte = U.paraData(ate);

      const ci = colunaDe(de, anoCrono);
      const cf = colunaDe(ate, anoCrono);
      const noAno = dDe && dAte &&
                    dDe.getFullYear() <= anoCrono && dAte.getFullYear() >= anoCrono;

      if (ci !== null && cf !== null && noAno) {
        const ini = Math.min(ci, cf), fim = Math.max(ci, cf);
        const tomBarra = corProjeto(p);
        const barra = h("div.crono-barra", {
          estilo: {
            "--tom": tomBarra,
            left: `calc(${ini} * var(--cel, 26px) + 2px)`,
            width: `calc(${fim - ini + 1} * var(--cel, 26px) - 4px)`
          },
          title: `${p.nome}\n${U.dataBR(p.inicio)} → ${U.dataBR(p.termino)}\nArraste para deslocar; puxe as bordas para reprogramar.`,
          tabindex: 0
        },
          h("i.preenchido", { estilo: { width: s.pct + "%", background: U.veu(tomBarra) } }),
          h("span.rotulo-barra", { estilo: { color: U.corTexto(tomBarra) } }, p.nome),
          h("i.puxador.esq"), h("i.puxador.dir")
        );
        ligarArrasto(barra, p);
        faixa.appendChild(barra);
      } else if (dDe) {
        /* Tem data, mas em outro ciclo. Em vez de uma faixa vazia, um atalho
           que diz onde o projeto está e leva até lá. */
        const alvo = (dAte && dAte.getFullYear() < anoCrono ? dAte : dDe).getFullYear();
        faixa.appendChild(h("button.crono-fora", {
          type: "button",
          title: `${p.nome} está no ciclo ${alvo}. Clique para ir até lá.`,
          onclick: () => { anoCrono = alvo; CI.app.recarregarVista(); }
        }, alvo < anoCrono ? `◂ ciclo ${alvo}` : `ciclo ${alvo} ▸`));
      }

      linha.appendChild(faixa);
      grade.appendChild(linha);
    });

    /* linha do hoje */
    const hoje = new Date();
    if (hoje.getFullYear() === anoCrono && projetos.length) {
      const col = hoje.getMonth() * SEM_POR_MES + (Math.min(Math.ceil(hoje.getDate() / 7), SEM_POR_MES) - 1);
      grade.appendChild(h("i.crono-hoje", {
        estilo: { left: `calc(236px + ${col} * var(--cel, 26px) + var(--cel, 26px) / 2)` }
      }));
    }

    const quadro = h("div.crono-quadro",
      h("div.crono-rolagem", grade),
      h("div.crono-legenda",
        h("span", h("i.amostra", { estilo: { background: "var(--crit)" } }), "Prioridade alta"),
        h("span", h("i.amostra", { estilo: { background: "var(--warn)" } }), "Média"),
        h("span", h("i.amostra", { estilo: { background: "var(--d-agua)" } }), "Baixa"),
        h("span", { estilo: { marginLeft: "auto", color: "var(--faint)" } },
          "A parte escura da barra é o percentual de etapas concluídas. Arraste a barra para deslocar o projeto; puxe as bordas para reprogramar.")
      )
    );

    return h("div.view",
      h("div", { estilo: { display: "flex", flexWrap: "wrap", gap: "9px", alignItems: "center", marginBottom: "14px" } },
        selecao(listaAnos.map(a => [String(a), "Ciclo " + a]), {
          value: String(anoCrono),
          estilo: { width: "auto", minWidth: "130px" },
          onchange: e => { anoCrono = Number(e.target.value); CI.app.recarregarVista(); }
        }),
        selecao([["", "Todas as diretorias"], ...db.dados.diretorias.map(d => [d.id, d.nome])], {
          value: filtroCronoDir,
          estilo: { width: "auto", minWidth: "180px" },
          onchange: e => { filtroCronoDir = e.target.value; CI.app.recarregarVista(); }
        }),
        h("span.discreto", { estilo: { fontSize: "12.5px", marginLeft: "auto" } },
          `${projetos.length} projeto(s) na linha do tempo`),
        h("button.btn.btn-primario", { type: "button", onclick: () => modalProjeto() }, ic("mais"), "Novo projeto")
      ),
      quadro,
      semData.length
        ? h("section.painel", { estilo: { marginTop: "14px" } },
            h("div.painel-hd", h("h2", "Fora da linha do tempo"),
              h("div.acoes", h("span.rotulo", "sem datas definidas"))),
            h("div.painel-bd",
              h("div", { estilo: { display: "flex", flexWrap: "wrap", gap: "8px" } },
                ...semData.map(p => h("button.btn.btn-p", {
                  type: "button", onclick: () => modalProjeto(p)
                }, h("i", { estilo: { width: "6px", height: "6px", borderRadius: "50%", background: corDiretoria(p.diretoria_id) } }), p.nome, ic("lapis")))
              ),
              h("p.discreto", { estilo: { fontSize: "12px", marginTop: "12px" } },
                "Defina início e término para que apareçam no cronograma.")
            )
          )
        : null
    );
  }

  /** Arrastar a barra inteira ou redimensionar pelas bordas. */
  function ligarArrasto(barra, projeto) {
    let modo = null, x0 = 0, cel = 26, deslocado = 0, base = null;

    barra.addEventListener("pointerdown", ev => {
      if (ev.button !== 0) return;
      const alvo = ev.target;
      modo = alvo.classList.contains("puxador")
        ? (alvo.classList.contains("esq") ? "inicio" : "fim")
        : "mover";
      x0 = ev.clientX;
      cel = parseFloat(getComputedStyle(barra.parentElement).getPropertyValue("--cel")) || 26;
      base = { inicio: projeto.inicio, termino: projeto.termino, left: barra.offsetLeft, width: barra.offsetWidth };
      deslocado = 0;
      barra.classList.add("arrastando");
      barra.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      ev.stopPropagation();
    });

    barra.addEventListener("pointermove", ev => {
      if (!modo) return;
      const passos = Math.round((ev.clientX - x0) / cel);
      if (passos === deslocado) return;
      deslocado = passos;
      if (modo === "mover") barra.style.left = (base.left + passos * cel) + "px";
      if (modo === "fim") barra.style.width = Math.max(cel - 4, base.width + passos * cel) + "px";
      if (modo === "inicio") {
        const larg = Math.max(cel - 4, base.width - passos * cel);
        barra.style.left = (base.left + (base.width - larg)) + "px";
        barra.style.width = larg + "px";
      }
    });

    const soltar = async ev => {
      if (!modo) return;
      const m = modo; modo = null;
      barra.classList.remove("arrastando");
      try { barra.releasePointerCapture(ev.pointerId); } catch (_) {}
      if (!deslocado) { CI.app.recarregarVista(); return; }

      const dias = deslocado * 7;
      const mudancas = {};
      if (m === "mover") {
        if (base.inicio) mudancas.inicio = somaDias(base.inicio, dias);
        if (base.termino) mudancas.termino = somaDias(base.termino, dias);
      } else if (m === "inicio") {
        mudancas.inicio = somaDias(base.inicio || base.termino, dias);
        if (base.termino && mudancas.inicio > base.termino) mudancas.inicio = base.termino;
      } else {
        mudancas.termino = somaDias(base.termino || base.inicio, dias);
        if (base.inicio && mudancas.termino < base.inicio) mudancas.termino = base.inicio;
      }

      try {
        await db.atualizar("projetos", projeto.id, mudancas);
        U.aviso(`${projeto.nome}: ${U.dataBR(mudancas.inicio || projeto.inicio)} → ${U.dataBR(mudancas.termino || projeto.termino)}`, "ok");
      } catch (e) {
        U.aviso("Não deu para salvar: " + e.message, "erro");
      }
      CI.app.recarregarVista();
    };

    barra.addEventListener("pointerup", soltar);
    barra.addEventListener("pointercancel", soltar);
    barra.addEventListener("dblclick", ev => { ev.stopPropagation(); modalProjeto(projeto); });
  }

  /* =========================================================================
     PROJETOS
     ====================================================================== */

  const filtros = { diretoria: "", tipo: "", prioridade: "", busca: "" };

  function vProjetos() {
    let lista = db.dados.projetos.slice();
    if (filtros.diretoria) lista = lista.filter(p => participa(p, filtros.diretoria));
    if (filtros.tipo) lista = lista.filter(p => p.tipo === filtros.tipo);
    if (filtros.prioridade) lista = lista.filter(p => p.prioridade === filtros.prioridade);
    if (filtros.busca) {
      const q = filtros.busca.toLowerCase();
      lista = lista.filter(p =>
        (p.nome || "").toLowerCase().includes(q) ||
        (p.objetivo || "").toLowerCase().includes(q) ||
        nomeDiretoria(p.diretoria_id).toLowerCase().includes(q));
    }
    lista.sort((a, b) => {
      const pa = PRIORIDADES.indexOf(a.prioridade), pb = PRIORIDADES.indexOf(b.prioridade);
      if (pa !== pb) return pa - pb;
      return (a.nome || "").localeCompare(b.nome || "");
    });

    const barraFiltros = h("div", { estilo: { display: "flex", flexWrap: "wrap", gap: "9px", alignItems: "center", marginBottom: "14px" } },
      selecao([["", "Todas as diretorias"], ...db.dados.diretorias.map(d => [d.id, d.nome])], {
        value: filtros.diretoria, estilo: { width: "auto", minWidth: "175px" },
        onchange: e => { filtros.diretoria = e.target.value; CI.app.recarregarVista(); }
      }),
      selecao([["", "Todos os tipos"], ...TIPOS], {
        value: filtros.tipo, estilo: { width: "auto", minWidth: "155px" },
        onchange: e => { filtros.tipo = e.target.value; CI.app.recarregarVista(); }
      }),
      selecao([["", "Qualquer prioridade"], ...PRIORIDADES], {
        value: filtros.prioridade, estilo: { width: "auto", minWidth: "160px" },
        onchange: e => { filtros.prioridade = e.target.value; CI.app.recarregarVista(); }
      }),
      (filtros.diretoria || filtros.tipo || filtros.prioridade || filtros.busca)
        ? h("button.btn.btn-fantasma.btn-p", {
            type: "button",
            onclick: () => { filtros.diretoria = filtros.tipo = filtros.prioridade = filtros.busca = ""; CI.app.recarregarVista(); }
          }, ic("x"), "Limpar")
        : null,
      h("span.discreto", { estilo: { fontSize: "12.5px", marginLeft: "auto" } }, `${lista.length} de ${db.dados.projetos.length}`),
      h("button.btn.btn-primario", { type: "button", onclick: () => modalProjeto() }, ic("mais"), "Novo projeto")
    );

    return h("div.view",
      barraFiltros,
      lista.length
        ? h("div.grade.g-3.surge", ...lista.map(cartaoProjeto))
        : U.vazio("caixa", "Nenhum projeto com esses filtros",
            "Ajuste os filtros acima ou crie um projeto novo.",
            h("button.btn.btn-primario", { type: "button", onclick: () => modalProjeto() }, ic("mais"), "Novo projeto"))
    );
  }

  function cartaoProjeto(p) {
    const s = estat(p.id);
    const cor = corProjeto(p);
    return h("button.cartao", { type: "button", onclick: () => (location.hash = "#/projeto/" + p.id) },
      h("div.cartao-topo",
        p.codigo ? h("span.indice", p.codigo) : null,
        h("h3", p.nome),
        h("i", { estilo: { width: "8px", height: "8px", borderRadius: "50%", background: cor, flex: "none", marginTop: "5px" } })
      ),
      p.objetivo ? h("p.objetivo", p.objetivo) : h("p.objetivo.discreto", { estilo: { fontStyle: "italic" } }, "Objetivo ainda não descrito."),
      h("div.cartao-meta",
        chip(p.prioridade, null, TOM_PRIO[p.prioridade]),
        chip(p.status, null, TOM_STATUS[p.status]),
        p.tipo !== "Projeto Interno" ? chip(p.tipo) : null,
        s.atrasadas ? chip(`${s.atrasadas} atrasada(s)`, "crit") : null
      ),
      h("div.progresso", h("i", { estilo: { width: s.pct + "%", "--tom": cor } })),
      h("div.cartao-pe",
        h("span", nomeDiretoria(p.diretoria_id)),
        selosCompartilhado(p, p.diretoria_id),
        h("span.direita", s.total ? `${s.feitas}/${s.total} etapas` : "sem etapas")
      )
    );
  }

  /* =========================================================================
     CONSOLE DO PROJETO
     ====================================================================== */

  let mostrarConcluidas = true;

  function vProjeto(id) {
    const p = db.projeto(id);
    if (!p) {
      return h("div.view", U.vazio("alerta", "Projeto não encontrado",
        "Ele pode ter sido removido ou o link está desatualizado.",
        h("button.btn", { type: "button", onclick: () => (location.hash = "#/projetos") }, ic("setaEsq"), "Voltar para projetos")));
    }

    const s = estat(p.id);
    const cor = corProjeto(p);
    let etapas = db.etapasDe(p.id);
    if (!mostrarConcluidas) etapas = etapas.filter(e => !e.concluida);

    const cabecalho = h("div", { estilo: { display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-start", marginBottom: "16px" } },
      h("button.btn.btn-fantasma.btn-icone", { type: "button", "aria-label": "Voltar", onclick: () => history.back() }, ic("setaEsq")),
      h("div", { estilo: { minWidth: 0, flex: "1 1 320px" } },
        h("div", { estilo: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" } },
          h("i", { estilo: { width: "9px", height: "9px", borderRadius: "50%", background: cor } }),
          h("span.rotulo", `${p.tipo} · ${nomeDiretoria(p.diretoria_id)}`)
        ),
        h("h1", { estilo: { fontSize: "26px", lineHeight: "1.15" } }, p.nome),
        h("div", { estilo: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" } },
          chip(p.prioridade, null, TOM_PRIO[p.prioridade]),
          chip(p.status, null, TOM_STATUS[p.status]),
          p.inicio || p.termino ? chip(`${U.dataBR(p.inicio)} → ${U.dataBR(p.termino)}`) : chip("Sem datas", "warn"),
          s.atrasadas ? chip(`${s.atrasadas} fora do prazo`, "crit") : null
        )
      ),
      h("div", { estilo: { display: "flex", gap: "7px", alignItems: "center", flexWrap: "wrap" } },
        botaoSeguir(p),
        h("button.btn", { type: "button", onclick: () => modalProjeto(p) }, ic("lapis"), "Editar"),
        h("button.btn.btn-primario", { type: "button", onclick: () => modalEtapa(p.id) }, ic("mais"), "Nova etapa")
      )
    );

    const vitais = h("section.painel",
      h("div.painel-hd", h("h2", "Ficha do projeto")),
      h("div.painel-bd",
        h("div", { estilo: { display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" } },
          anel(s.pct, cor, 68, 7),
          h("div",
            h("div", { estilo: { font: "800 19px/1 var(--f-display)", letterSpacing: "-.02em" } },
              `${s.feitas}/${s.total}`),
            h("div.rotulo", { estilo: { marginTop: "5px" } }, "etapas concluídas"),
            s.proxima
              ? h("div", { estilo: { fontSize: "11.5px", color: "var(--muted)", marginTop: "7px" } },
                  "Próxima: " + U.dataBR(s.proxima.data_entrega))
              : null
          )
        ),
        h("dl.vitais",
          compartilhada(p)
            ? h("div.vital",
                h("dt", "Em conjunto"),
                h("dd",
                  h("div", { estilo: { display: "flex", flexWrap: "wrap", gap: "5px" } },
                    ...diretoriasDe(p).map(id => {
                      const dd = db.diretoria(id);
                      return dd ? h("span.selo", {
                        estilo: { background: U.corVisivel(dd.cor), color: U.corTexto(dd.cor) },
                        title: dd.nome
                      }, dd.sigla || dd.nome) : null;
                    })),
                  h("span.discreto", { estilo: { display: "block", fontSize: "11px", marginTop: "6px" } },
                    "Aparece no quadro das " + diretoriasDe(p).length +
                    " diretorias e conta uma vez só nos indicadores.")))
            : null,
          vital("Objetivo", p.objetivo),
          vital("Equipe", p.equipe),
          vital("Responsável", p.responsavel),
          vital("Professor apoiador", p.professor_apoiador),
          vital("Metodologia", p.metodologia),
          vital("Início", p.inicio ? U.dataExtenso(p.inicio) : ""),
          vital("Término", p.termino ? U.dataExtenso(p.termino) : "")
        ),
        h("div", { estilo: { display: "flex", gap: "7px", marginTop: "14px", flexWrap: "wrap" } },
          h("button.btn.btn-p", { type: "button", onclick: () => exportarProjeto(p) }, ic("baixar"), "Exportar CSV"),
          h("button.btn.btn-p.btn-perigo", {
            type: "button",
            onclick: async () => {
              const ok = await U.confirmar("Excluir projeto",
                `“${p.nome}” e suas ${s.total} etapas serão removidos. Não dá para desfazer.`, "Excluir");
              if (!ok) return;
              try { await db.excluir("projetos", p.id); U.aviso("Projeto excluído", "ok"); location.hash = "#/projetos"; }
              catch (e) { U.aviso(e.message, "erro"); }
            }
          }, ic("lixeira"), "Excluir")
        )
      )
    );

    const trilha = h("section.painel",
      h("div.painel-hd",
        h("h2", "Etapas"),
        h("div.acoes",
          h("label", { estilo: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--muted)", cursor: "pointer" } },
            h("input", {
              type: "checkbox", checked: mostrarConcluidas,
              onchange: e => { mostrarConcluidas = e.target.checked; CI.app.recarregarVista(); }
            }), "mostrar concluídas"),
          h("button.btn.btn-p", { type: "button", onclick: () => modalEtapa(p.id) }, ic("mais"), "Etapa")
        )
      ),
      etapas.length > 1
        ? h("p.discreto", {
            estilo: { fontSize: "11.5px", padding: "9px 16px", borderBottom: "1px solid var(--line-soft)" }
          }, "Arraste pela alça à esquerda para reordenar. A numeração se ajusta sozinha.")
        : null,
      h("div.painel-bd.sem-pad",
        etapas.length
          ? trilhaOrdenavel(p, etapas)
          : U.vazio("cronograma", "Nenhuma etapa ainda",
              "Quebre o projeto em entregas com responsável e data. É isso que alimenta o cronograma e os avisos por e-mail.",
              h("button.btn.btn-primario", { type: "button", onclick: () => modalEtapa(p.id) }, ic("mais"), "Criar primeira etapa"))
      )
    );

    return h("div.view", cabecalho, h("div.console", vitais, trilha));
  }

  /** Um clique para receber (ou parar de receber) os avisos deste projeto. */
  function botaoSeguir(p) {
    const meu = normEmail(db.perfil.email);
    const segue = segueProjeto(meu, p.id);
    const geral = meu && inscricoesDe(meu).some(i => !i.projeto_id);
    const quantos = seguidoresDe(p.id).length;

    return h("button.btn" + (segue ? "" : ""), {
      type: "button",
      title: geral
        ? "Você acompanha todos os projetos internos. Ajuste em Conexão → Avisos por e-mail."
        : segue ? "Parar de receber avisos deste projeto" : "Receber avisos de prazo deste projeto",
      estilo: segue ? { borderColor: "var(--accent-line)", color: "var(--accent)" } : {},
      onclick: async () => {
        if (!meu) {
          U.aviso("Cadastre seu e-mail em Conexão → Avisos por e-mail.", "alerta");
          location.hash = "#/config";
          return;
        }
        if (geral) {
          U.aviso("Você acompanha todos os projetos internos. Ajuste em Conexão.", "info");
          location.hash = "#/config";
          return;
        }
        try {
          if (segue) {
            for (const i of inscricoesDe(meu).filter(x => x.projeto_id === p.id)) {
              await db.excluir("inscricoes", i.id);
            }
            U.aviso("Você não recebe mais avisos deste projeto", "ok");
          } else {
            await db.criar("inscricoes", {
              email: meu, nome: db.perfil.nome || "", projeto_id: p.id, ativo: true
            });
            U.aviso("Pronto: avisos 7, 3 e 1 dia antes, às 13h30", "ok");
          }
          CI.app.recarregarVista();
        } catch (err) { U.aviso(err.message, "erro"); }
      }
    }, ic("correio"), segue ? "Recebendo avisos" : "Receber avisos",
       quantos ? h("span.dado", { estilo: { fontSize: "11px", color: "var(--muted)" } }, String(quantos)) : null);
  }

  function vital(rotulo, valor) {
    return h("div.vital",
      h("dt", rotulo),
      h("dd", valor ? String(valor) : h("span.discreto", { estilo: { fontStyle: "italic" } }, "não informado"))
    );
  }

  function linhaEtapa(e, p) {
    const nComentarios = db.comentariosDe(e.id).length;
    const atrasada = etapaAtrasada(e);
    return h("div.etapa" + (e.concluida ? ".feita" : "") + (atrasada ? ".atrasada" : ""), {
      dataset: { id: e.id },
      onclick: ev => {
        if (ev.target.closest(".marcador") || ev.target.closest(".etapa-puxador")) return;
        gavetaEtapa(e.id);
      }
    },
      h("button.etapa-puxador", {
        type: "button",
        "aria-label": `Mover a etapa ${e.numero}. Use as setas para cima e para baixo.`,
        title: "Arraste para reordenar (ou use as setas do teclado)",
        onkeydown: ev => {
          if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
          ev.preventDefault();
          moverEtapaTeclado(e, ev.key === "ArrowUp" ? -1 : 1);
        }
      }, ic("arrastar")),
      h("div.etapa-no",
        h("button.marcador", {
          type: "button",
          "aria-label": e.concluida ? "Reabrir etapa" : "Concluir etapa",
          title: e.concluida ? "Reabrir etapa" : "Marcar como concluída",
          onclick: async ev => {
            ev.stopPropagation();
            await alternarEtapa(e);
          }
        }, e.concluida ? ic("check") : String(e.numero))
      ),
      h("div.etapa-corpo",
        h("div.etapa-desc", e.descricao || "Etapa sem descrição"),
        h("div.etapa-meta",
          e.responsavel ? chip(e.responsavel, null, "var(--d-peri)") : chip("Sem responsável", "warn"),
          chipPrazo(e),
          e.arquivo_url ? chip("Arquivo") : null,
          e.observacao ? chip("Com observação") : null
        )
      ),
      h("div.etapa-lado",
        h("span.sinal-com" + (nComentarios ? ".tem" : ""), ic("balao"), String(nComentarios)),
        ic("setaDir")
      )
    );
  }

  /* ---- reordenação da trilha -------------------------------------------
     Arrastar move o nó de verdade no DOM; ao soltar, a nova sequência é
     gravada. Quando as concluídas estão escondidas, a lista completa é
     remontada mantendo cada etapa oculta ancorada à visível que a precedia.
     ---------------------------------------------------------------------- */

  function trilhaOrdenavel(projeto, etapasVisiveis) {
    const trilha = h("div.trilha", ...etapasVisiveis.map(e => linhaEtapa(e, projeto)));
    ligarReordenacao(trilha, projeto.id);
    return trilha;
  }

  function ordemCompleta(projetoId, idsVisiveis) {
    const todas = db.etapasDe(projetoId).map(e => e.id);
    const visivel = new Set(idsVisiveis);
    const cabeca = [];
    const reboque = new Map();      // id visível -> ocultas que vinham logo depois
    let atual = null;
    todas.forEach(id => {
      if (visivel.has(id)) { atual = id; reboque.set(id, []); }
      else if (atual === null) cabeca.push(id);
      else reboque.get(atual).push(id);
    });
    const saida = [...cabeca];
    idsVisiveis.forEach(id => {
      saida.push(id);
      (reboque.get(id) || []).forEach(o => saida.push(o));
    });
    return saida;
  }

  async function gravarOrdem(projetoId, trilha) {
    const visiveis = [...trilha.querySelectorAll(".etapa")].map(el => el.dataset.id);
    try {
      const n = await db.reordenarEtapas(projetoId, ordemCompleta(projetoId, visiveis));
      if (n) U.aviso("Ordem das etapas atualizada", "ok");
    } catch (err) {
      U.aviso("Não deu para salvar a ordem: " + err.message, "erro");
    }
    CI.app.recarregarVista();
  }

  function ligarReordenacao(trilha, projetoId) {
    let linha = null, rolador = null, autoRolagem = 0;

    trilha.addEventListener("pointerdown", ev => {
      const alca = ev.target.closest(".etapa-puxador");
      if (!alca || ev.button !== 0) return;
      linha = alca.closest(".etapa");
      if (!linha) return;
      rolador = trilha.closest(".conteudo");
      linha.classList.add("movendo");
      trilha.classList.add("reordenando");
      linha.style.pointerEvents = "none";   // libera elementFromPoint
      alca.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });

    trilha.addEventListener("pointermove", ev => {
      if (!linha) return;
      ev.preventDefault();

      const sob = document.elementFromPoint(ev.clientX, ev.clientY);
      const alvo = sob && sob.closest(".etapa");
      if (alvo && alvo !== linha && alvo.parentElement === trilha) {
        const meio = alvo.getBoundingClientRect().top + alvo.offsetHeight / 2;
        trilha.insertBefore(linha, ev.clientY < meio ? alvo : alvo.nextSibling);
      }

      // rola sozinho perto das bordas
      if (rolador) {
        const r = rolador.getBoundingClientRect();
        if (ev.clientY < r.top + 70) autoRolagem = -14;
        else if (ev.clientY > r.bottom - 70) autoRolagem = 14;
        else autoRolagem = 0;
        if (autoRolagem) rolador.scrollTop += autoRolagem;
      }
    });

    const soltar = () => {
      if (!linha) return;
      linha.style.pointerEvents = "";
      linha.classList.remove("movendo");
      trilha.classList.remove("reordenando");
      linha = null; autoRolagem = 0;
      gravarOrdem(projetoId, trilha);
    };

    trilha.addEventListener("pointerup", soltar);
    trilha.addEventListener("pointercancel", soltar);
  }

  /** Setas do teclado sobre a alça: acessível e bom para ajuste fino. */
  async function moverEtapaTeclado(etapa, passo) {
    const visiveis = db.etapasDe(etapa.projeto_id)
      .filter(e => mostrarConcluidas || !e.concluida)
      .map(e => e.id);
    const i = visiveis.indexOf(etapa.id);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= visiveis.length) return;
    visiveis.splice(j, 0, visiveis.splice(i, 1)[0]);
    try {
      await db.reordenarEtapas(etapa.projeto_id, ordemCompleta(etapa.projeto_id, visiveis));
      CI.app.recarregarVista();
      setTimeout(() => {
        const alvo = document.querySelector(`.etapa[data-id="${etapa.id}"] .etapa-puxador`);
        alvo && alvo.focus();
      }, 70);
    } catch (err) { U.aviso(err.message, "erro"); }
  }

  async function alternarEtapa(e) {
    try {
      const novo = !e.concluida;
      await db.atualizar("etapas", e.id, {
        concluida: novo,
        concluida_em: novo ? new Date().toISOString() : null
      });
      U.aviso(novo ? `Etapa ${e.numero} concluída` : `Etapa ${e.numero} reaberta`, novo ? "ok" : "info");
    } catch (err) { U.aviso(err.message, "erro"); }
  }

  /* =========================================================================
     GAVETA DA ETAPA — detalhe, campos e conversa
     ====================================================================== */

  function gavetaEtapa(etapaId) {
    const e = db.dados.etapas.find(x => x.id === etapaId);
    if (!e) return;
    const p = db.projeto(e.projeto_id);

    const salvar = async (campoNome, valor) => {
      if (String(e[campoNome] ?? "") === String(valor ?? "")) return;
      try {
        await db.atualizar("etapas", e.id, { [campoNome]: valor });
        e[campoNome] = valor;
        U.aviso("Salvo", "ok");
        if (campoNome === "responsavel_email" && valor) db.dispararEmails();
      } catch (err) { U.aviso("Não salvou: " + err.message, "erro"); }
    };

    const conversa = h("div.conversa");
    const compositor = h("textarea.entrada", {
      placeholder: "Escreva um comentário… (Ctrl+Enter envia)",
      rows: 3,
      onkeydown: ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") enviar(); }
    });

    function pintarConversa() {
      U.limpar(conversa);
      const lista = db.comentariosDe(e.id);
      if (!lista.length) {
        conversa.appendChild(h("p.discreto", { estilo: { fontSize: "12.5px" } },
          "Ainda não há comentários nesta etapa. Registre decisões, bloqueios e combinados aqui."));
        return;
      }
      lista.forEach(c => {
        conversa.appendChild(h("div.comentario",
          h("div.avatar", U.iniciais(c.autor_nome)),
          h("div.comentario-corpo",
            h("div.comentario-cab", h("b", c.autor_nome), h("time", U.relativo(c.criado_em))),
            h("div.comentario-txt", c.corpo)
          ),
          h("button.btn.btn-fantasma.btn-icone.btn-p.apagar", {
            type: "button", "aria-label": "Apagar comentário",
            onclick: async () => {
              const ok = await U.confirmar("Apagar comentário", "O comentário será removido para todo mundo.", "Apagar");
              if (!ok) return;
              try { await db.excluir("comentarios", c.id); pintarConversa(); U.aviso("Comentário apagado", "ok"); }
              catch (err) { U.aviso(err.message, "erro"); }
            }
          }, ic("lixeira"))
        ));
      });
    }

    async function enviar() {
      const texto = compositor.value.trim();
      if (!texto) { compositor.focus(); return; }
      compositor.disabled = true;
      try {
        await db.criar("comentarios", {
          etapa_id: e.id,
          projeto_id: e.projeto_id,
          autor_nome: db.perfil.nome || "Membro",
          autor_email: db.perfil.email || null,
          autor_id: db.usuario?.id || null,
          corpo: texto
        });
        compositor.value = "";
        pintarConversa();
        U.aviso("Comentário publicado", "ok");
        db.dispararEmails();
      } catch (err) {
        U.aviso("Não enviou: " + err.message, "erro");
      } finally {
        compositor.disabled = false;
        compositor.focus();
      }
    }

    pintarConversa();

    const corpo = [
      h("div.gaveta-secao",
        h("div", { estilo: { display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "14px" } },
          chipPrazo(e),
          chip(p?.nome || "—", null, p ? corProjeto(p) : null),
          h("button.btn.btn-p", {
            type: "button",
            onclick: async () => { await alternarEtapa(e); U.fecharGaveta(); }
          }, ic(e.concluida ? "recarregar" : "check"), e.concluida ? "Reabrir" : "Concluir")
        ),
        h("div.linha-campos",
          campo("Responsável", entrada({
            value: e.responsavel || "", placeholder: "Nome ou cargo",
            onchange: ev => salvar("responsavel", ev.target.value)
          })),
          campo("Data de entrega", entrada({
            type: "date", value: (e.data_entrega || "").slice(0, 10),
            onchange: ev => salvar("data_entrega", ev.target.value || null)
          }))
        ),
        h("div", { estilo: { marginTop: "12px" } },
          campo("E-mail do responsável", entrada({
            type: "email", value: e.responsavel_email || "", placeholder: "nome@adecon.com.br",
            onchange: ev => salvar("responsavel_email", ev.target.value)
          }), "Recebe aviso de atribuição, lembrete de prazo e novos comentários."))
      ),

      h("div.gaveta-secao",
        h("span.rotulo", "Observação da execução"),
        area({
          value: e.observacao || "", rows: 3,
          placeholder: "Como a etapa foi executada, o que travou, o que mudou…",
          onchange: ev => salvar("observacao", ev.target.value)
        })
      ),

      h("div.gaveta-secao",
        h("span.rotulo", "Anotações de reunião"),
        area({
          value: e.anotacoes || "", rows: 3,
          placeholder: "Pauta, encaminhamentos, responsáveis…",
          onchange: ev => salvar("anotacoes", ev.target.value)
        })
      ),

      h("div.gaveta-secao",
        h("span.rotulo", "Arquivo"),
        h("div", { estilo: { display: "flex", gap: "8px" } },
          entrada({
            value: e.arquivo_url || "", placeholder: "Link do Drive, Notion, relatório…",
            onchange: ev => salvar("arquivo_url", ev.target.value)
          }),
          e.arquivo_url
            ? h("a.btn.btn-icone", { href: e.arquivo_url, target: "_blank", rel: "noopener", "aria-label": "Abrir arquivo" }, ic("externo"))
            : null
        )
      ),

      h("div.gaveta-secao",
        h("span.rotulo", `Conversa (${db.comentariosDe(e.id).length})`),
        conversa,
        h("div.compositor",
          compositor,
          h("div.rodape",
            h("span.dica", `Comentando como ${db.perfil.nome || "Membro"}`),
            h("button.btn.btn-primario", { type: "button", onclick: enviar }, ic("balao"), "Comentar")
          )
        )
      )
    ];

    U.abrirGaveta({
      rotulo: `Etapa ${e.numero} · ${p?.nome || ""}`,
      titulo: e.descricao || "Etapa sem descrição",
      acoesCabecalho: [
        h("button.btn.btn-fantasma.btn-icone", {
          type: "button", "aria-label": "Editar etapa",
          onclick: () => { U.fecharGaveta(); modalEtapa(e.projeto_id, e); }
        }, ic("lapis"))
      ],
      corpo
    });
  }

  /* =========================================================================
     MODAIS DE CRIAÇÃO / EDIÇÃO
     ====================================================================== */

  function modalProjeto(projeto, padroes) {
    const editando = Boolean(projeto);
    const p = projeto || Object.assign({
      nome: "", diretoria_id: db.dados.diretorias[0]?.id || null, tipo: "Projeto Interno",
      prioridade: "Média", status: "Planejado", objetivo: "", equipe: "", responsavel: "",
      professor_apoiador: "", metodologia: "", inicio: "", termino: "", codigo: "", cor: "",
      diretorias_apoio: []
    }, padroes || {});

    const campos = {};
    const cp = (chave, rotulo, controle, dica) => { campos[chave] = controle; return campo(rotulo, controle, dica); };
    const seletor = seletorDiretorias(p.diretorias_apoio || [], p.diretoria_id);

    const corpo = [
      cp("nome", "Nome do projeto", entrada({ value: p.nome, placeholder: "HACKADECON", required: true })),
      h("div.linha-campos",
        cp("diretoria_id", "Diretoria responsável",
           selecao(db.dados.diretorias.map(d => [d.id, d.nome]), {
             value: p.diretoria_id,
             onchange: e => seletor.sincronizar(e.target.value)
           })),
        cp("tipo", "Classificação", selecao(TIPOS, { value: p.tipo }))
      ),
      campo("Também é tocado por", seletor.el,
            "Clique nas diretorias que participam. A ação aparece no quadro de todas e continua contando como uma só."),
      h("div.linha-campos",
        cp("prioridade", "Prioridade", selecao(PRIORIDADES, { value: p.prioridade })),
        cp("status", "Status", selecao(STATUS, { value: p.status })),
        cp("codigo", "Código", entrada({ value: p.codigo || "", placeholder: "1.0" }))
      ),
      cp("objetivo", "Objetivo", area({ value: p.objetivo || "", rows: 3, placeholder: "O que este projeto garante para a empresa?" })),
      h("div.linha-campos",
        cp("equipe", "Equipe", entrada({ value: p.equipe || "", placeholder: "Diretores, gerentes e assessores" })),
        cp("responsavel", "Responsável", entrada({ value: p.responsavel || "", placeholder: "Gerente de Inovação" }))
      ),
      h("div.linha-campos",
        cp("professor_apoiador", "Professor apoiador", entrada({ value: p.professor_apoiador || "" })),
        cp("metodologia", "Metodologia", entrada({ value: p.metodologia || "", placeholder: "SCRUM, PDCA…" }))
      ),
      h("div.linha-campos",
        cp("inicio", "Início", entrada({ type: "date", value: (p.inicio || "").slice(0, 10) })),
        cp("termino", "Término", entrada({ type: "date", value: (p.termino || "").slice(0, 10) }))
      )
    ];

    U.abrirModal({
      sub: editando ? "Editar" : "Novo registro",
      titulo: editando ? p.nome : "Novo projeto interno",
      corpo,
      acoes: [
        h("button.btn", { type: "button", onclick: () => U.fecharModal() }, "Cancelar"),
        h("button.btn.btn-primario", {
          type: "button",
          onclick: async () => {
            const dados = {};
            for (const [k, el] of Object.entries(campos)) dados[k] = el.value || (k.match(/inicio|termino/) ? null : "");
            if (!dados.nome.trim()) { U.aviso("Dê um nome ao projeto.", "alerta"); campos.nome.focus(); return; }
            dados.diretorias_apoio = seletor.valor();
            try {
              if (editando) {
                await db.atualizar("projetos", p.id, dados);
                U.aviso("Projeto atualizado", "ok");
              } else {
                const novo = await db.criar("projetos", dados);
                U.aviso("Projeto criado", "ok");
                location.hash = "#/projeto/" + novo.id;
              }
              U.fecharModal();
              CI.app.recarregarVista();
            } catch (err) { U.aviso("Não salvou: " + err.message, "erro"); }
          }
        }, ic("check"), editando ? "Salvar" : "Criar projeto")
      ]
    });
  }

  function modalEtapa(projetoId, etapa) {
    const editando = Boolean(etapa);
    const existentes = db.etapasDe(projetoId);
    const e = etapa || {
      numero: existentes.length + 1, descricao: "", responsavel: "",
      responsavel_email: "", data_entrega: ""
    };

    const fNumero = entrada({ type: "number", step: "0.5", value: e.numero, estilo: { maxWidth: "110px" } });
    const fDesc = area({ value: e.descricao || "", rows: 3, placeholder: "Reunião geral com todos os diretores para falar sobre o projeto" });
    const fResp = entrada({ value: e.responsavel || "", placeholder: "Gerente de Inovação" });
    const fEmail = entrada({ type: "email", value: e.responsavel_email || "", placeholder: "nome@adecon.com.br" });
    const fData = entrada({ type: "date", value: (e.data_entrega || "").slice(0, 10) });

    U.abrirModal({
      sub: editando ? "Editar etapa" : "Nova etapa",
      titulo: db.projeto(projetoId)?.nome || "Projeto",
      largura: 560,
      corpo: [
        h("div.linha-campos",
          campo("Nº", fNumero),
          campo("Data de entrega", fData)
        ),
        campo("Descrição", fDesc),
        h("div.linha-campos",
          campo("Responsável", fResp),
          campo("E-mail do responsável", fEmail, "Recebe o aviso automático.")
        )
      ],
      acoes: [
        editando
          ? h("button.btn.btn-perigo.esquerda", {
              type: "button",
              onclick: async () => {
                const ok = await U.confirmar("Excluir etapa", `A etapa ${e.numero} e seus comentários serão removidos.`, "Excluir");
                if (!ok) return;
                try { await db.excluir("etapas", e.id); U.fecharModal(); CI.app.recarregarVista(); U.aviso("Etapa excluída", "ok"); }
                catch (err) { U.aviso(err.message, "erro"); }
              }
            }, ic("lixeira"), "Excluir")
          : null,
        h("button.btn", { type: "button", onclick: () => U.fecharModal() }, "Cancelar"),
        h("button.btn.btn-primario", {
          type: "button",
          onclick: async () => {
            if (!fDesc.value.trim()) { U.aviso("Descreva a etapa.", "alerta"); fDesc.focus(); return; }
            const dados = {
              projeto_id: projetoId,
              numero: Number(fNumero.value) || existentes.length + 1,
              descricao: fDesc.value.trim(),
              responsavel: fResp.value.trim(),
              responsavel_email: fEmail.value.trim() || null,
              data_entrega: fData.value || null,
              ordem: editando ? (e.ordem ?? 0) : existentes.length
            };
            try {
              if (editando) { await db.atualizar("etapas", e.id, dados); U.aviso("Etapa atualizada", "ok"); }
              else { await db.criar("etapas", Object.assign({ concluida: false }, dados)); U.aviso("Etapa criada", "ok"); }
              if (dados.responsavel_email) db.dispararEmails();
              U.fecharModal();
              CI.app.recarregarVista();
            } catch (err) { U.aviso("Não salvou: " + err.message, "erro"); }
          }
        }, ic("check"), editando ? "Salvar" : "Adicionar etapa")
      ]
    });
  }

  /* =========================================================================
     DIRETORIAS — o quadro de cinco colunas
     ====================================================================== */

  let dirAberta = "";

  function vDiretorias() {
    const lista = dirAberta
      ? db.dados.diretorias.filter(d => d.id === dirAberta)
      : db.dados.diretorias.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    return h("div.view",
      h("div", { estilo: { display: "flex", flexWrap: "wrap", gap: "9px", alignItems: "center", marginBottom: "14px" } },
        selecao([["", "Todas as diretorias"], ...db.dados.diretorias.map(d => [d.id, d.nome])], {
          value: dirAberta, estilo: { width: "auto", minWidth: "200px" },
          onchange: e => { dirAberta = e.target.value; CI.app.recarregarVista(); }
        }),
        h("span.discreto", { estilo: { fontSize: "12.5px", marginLeft: "auto", textAlign: "right", maxWidth: "48ch" } },
          "Uma ação tocada por várias diretorias aparece no quadro de cada uma, marcada como apoio, e conta uma vez só nos indicadores.")
      ),
      h("div", { estilo: { display: "flex", flexDirection: "column", gap: "14px" } },
        ...lista.map(quadroDiretoria))
    );
  }

  /* Cada coluna do quadro vem das entidades de verdade: projetos (por tipo) e
     implementações (ferramenta ou processo). Uma ação conjunta aparece aqui em
     todas as diretorias envolvidas, mas existe uma única vez no banco. */

  function itemDoQuadro(o) {
    const el = h("div.item-quadro" + (o.apoio ? ".apoio" : ""), { estilo: { "--tom": o.tom } },
      o.abrir
        ? h("button.item-abrir", { type: "button", onclick: o.abrir }, o.titulo)
        : h("span", { estilo: { fontWeight: 500 } }, o.titulo),
      o.selos || null,
      o.sub ? h("span.quem", o.sub) : null,
      o.apoio ? h("span.quem", { estilo: { color: "var(--faint)" } }, "apoio · lidera " + o.lidera) : null,
      o.remover
        ? h("button.remover", { type: "button", "aria-label": "Remover item", onclick: o.remover }, ic("x"))
        : null
    );
    return el;
  }

  function quadroDiretoria(d) {
    const tom = U.corVisivel(d.cor);
    const acoes = db.dados.projetos.filter(p => participa(p, d.id));
    const impls = db.dados.implementacoes.filter(i => participa(i, d.id));
    // itens antigos que só espelhavam um projeto agora vêm da entidade;
    // aqui ficam apenas as anotações livres do quadro
    const avulsos = db.dados.itens_diretoria.filter(i => i.diretoria_id === d.id && !i.projeto_id);
    const conjuntas = [...acoes, ...impls].filter(compartilhada).length;

    const deProjeto = p => itemDoQuadro({
      titulo: p.nome, tom,
      sub: p.diretoria_id === d.id ? (p.responsavel || "") : "",
      apoio: p.diretoria_id !== d.id,
      lidera: nomeDiretoria(p.diretoria_id),
      selos: selosCompartilhado(p, d.id),
      abrir: () => (location.hash = "#/projeto/" + p.id)
    });

    const deImplementacao = i => itemDoQuadro({
      titulo: i.nome, tom,
      sub: i.diretoria_id === d.id ? i.status : "",
      apoio: i.diretoria_id !== d.id,
      lidera: nomeDiretoria(i.diretoria_id),
      selos: selosCompartilhado(i, d.id),
      abrir: () => (location.hash = "#/implementacao")
    });

    const deAvulso = i => itemDoQuadro({
      titulo: i.titulo, tom, sub: i.responsavel || "",
      remover: async () => {
        const ok = await U.confirmar("Remover item", `“${i.titulo}” sai do quadro da ${d.nome}.`, "Remover");
        if (!ok) return;
        try { await db.excluir("itens_diretoria", i.id); U.aviso("Item removido", "ok"); }
        catch (err) { U.aviso(err.message, "erro"); }
      }
    });

    const conteudo = {
      "Iniciativas":       acoes.filter(p => p.tipo === "Iniciativa").map(deProjeto),
      "Projetos Internos": acoes.filter(p => p.tipo === "Projeto Interno").map(deProjeto),
      "Pontos de Atenção": acoes.filter(p => p.tipo === "Ponto de Atenção").map(deProjeto),
      "Processos":         impls.filter(i => i.tipo === "Processo").map(deImplementacao),
      "Ferramentas":       impls.filter(i => i.tipo === "Ferramenta").map(deImplementacao)
    };
    avulsos.forEach(i => { (conteudo[i.coluna] || (conteudo[i.coluna] = [])).push(deAvulso(i)); });

    const criar = {
      "Iniciativas":       () => modalProjeto(null, { tipo: "Iniciativa", diretoria_id: d.id }),
      "Projetos Internos": () => modalProjeto(null, { tipo: "Projeto Interno", diretoria_id: d.id }),
      "Pontos de Atenção": () => modalProjeto(null, { tipo: "Ponto de Atenção", diretoria_id: d.id }),
      "Processos":         () => modalImplementacao("Processo", d.id),
      "Ferramentas":       () => modalImplementacao("Ferramenta", d.id)
    };

    const colunas = h("div.colunas");
    COLUNAS_QUADRO.forEach(nomeColuna => {
      const itens = conteudo[nomeColuna] || [];
      colunas.appendChild(h("div.coluna",
        h("div.coluna-hd",
          h("span.rotulo", nomeColuna),
          h("span.cont", String(itens.length))
        ),
        ...itens,
        h("button.add-item", { type: "button", onclick: criar[nomeColuna] }, ic("mais"), "Adicionar")
      ));
    });

    return h("section.painel",
      h("div.diretoria-cab",
        h("span.diretoria-sigla", {
          estilo: { background: tom, color: U.corTexto(d.cor) }
        }, d.sigla || "—"),
        h("div", { estilo: { minWidth: 0, flex: "1 1 auto" } },
          h("h2", { estilo: { fontSize: "16px" } }, d.nome),
          h("div.rotulo", { estilo: { marginTop: "4px" } }, d.composicao || ""),
          d.pergunta_norteadora ? h("p.pergunta", { estilo: { marginTop: "10px" } }, d.pergunta_norteadora) : null
        ),
        h("div", { estilo: { display: "flex", flexDirection: "column", gap: "5px", alignItems: "flex-end" } },
          chip(`${acoes.length + impls.length} ações`),
          conjuntas ? chip(`${conjuntas} em conjunto`, "acc") : null)
      ),
      colunas
    );
  }

  /* =========================================================================
     IMPLEMENTAÇÃO
     ====================================================================== */

  const STATUS_IMPL = ["Proposto", "Em teste", "Implementado", "Descartado"];
  const TOM_IMPL = { Proposto: "var(--muted)", "Em teste": "var(--warn)", Implementado: "var(--ok)", Descartado: "var(--faint)" };

  function vImplementacao() {
    const todos = db.dados.implementacoes;
    const feitos = todos.filter(i => i.status === "Implementado").length;
    const tip = todos.length ? Math.round((feitos / todos.length) * 100) : 0;

    const tabela = tipo => {
      const linhas = todos.filter(i => i.tipo === tipo);
      return h("section.painel",
        h("div.painel-hd",
          h("h2", tipo === "Ferramenta" ? "Ferramentas" : "Processos"),
          h("div.acoes",
            chip(`${linhas.filter(i => i.status === "Implementado").length}/${linhas.length} implementados`,
              linhas.length && linhas.every(i => i.status === "Implementado") ? "ok" : null),
            h("button.btn.btn-p", { type: "button", onclick: () => modalImplementacao(tipo) }, ic("mais"), "Adicionar")
          )
        ),
        h("div.painel-bd.sem-pad",
          linhas.length
            ? h("div.tabela-rolagem", h("table.tabela",
                h("thead", h("tr",
                  h("th", tipo), h("th", "Responsável"), h("th", "Diretoria"),
                  h("th", "Status"), h("th", "Relatório"), h("th", "")
                )),
                h("tbody", ...linhas.map(i => h("tr",
                  h("td", h("span", { estilo: { fontWeight: 500 } }, i.nome)),
                  h("td.discreto", i.responsavel || "—"),
                  h("td.discreto", nomeDiretoria(i.diretoria_id)),
                  h("td", selecao(STATUS_IMPL, {
                    value: i.status,
                    estilo: { width: "auto", minWidth: "130px", padding: "5px 26px 5px 9px", fontSize: "12px",
                              backgroundPosition: "calc(100% - 13px) 13px, calc(100% - 8px) 13px" },
                    onchange: async ev => {
                      try {
                        await db.atualizar("implementacoes", i.id, {
                          status: ev.target.value,
                          data_implementacao: ev.target.value === "Implementado" ? U.hojeISO() : null
                        });
                        U.aviso("Status atualizado", "ok");
                      } catch (err) { U.aviso(err.message, "erro"); }
                    }
                  })),
                  h("td", i.relatorio_url
                    ? h("a", { href: i.relatorio_url, target: "_blank", rel: "noopener", estilo: { fontSize: "12px" } }, "abrir")
                    : h("span.discreto", "—")),
                  h("td", { estilo: { textAlign: "right" } },
                    h("button.btn.btn-fantasma.btn-icone.btn-p", {
                      type: "button", "aria-label": "Remover",
                      onclick: async () => {
                        const ok = await U.confirmar("Remover", `“${i.nome}” sai da lista.`, "Remover");
                        if (!ok) return;
                        try { await db.excluir("implementacoes", i.id); U.aviso("Removido", "ok"); }
                        catch (err) { U.aviso(err.message, "erro"); }
                      }
                    }, ic("lixeira")))
                )))
              ))
            : U.vazio("tomada", `Nenhuma ${tipo.toLowerCase()} registrada`,
                "Cada item aqui entra no cálculo do TIP.",
                h("button.btn.btn-primario", { type: "button", onclick: () => modalImplementacao(tipo) }, ic("mais"), "Adicionar"))
        )
      );
    };

    return h("div.view",
      h("div.grade.g-kpi.surge", { estilo: { marginBottom: "14px" } },
        kpi({ nome: "TIP", desc: "Taxa de implementação de processos e ferramentas",
              valor: tip, sufixo: "%", pct: tip, tom: "var(--d-agua)" }),
        kpi({ nome: "Implementados", desc: "Itens já em uso na empresa",
              valor: feitos, pct: todos.length ? (feitos / todos.length) * 100 : 0, tom: "var(--ok)" }),
        kpi({ nome: "Em teste", desc: "Rodando em piloto",
              valor: todos.filter(i => i.status === "Em teste").length,
              pct: todos.length ? (todos.filter(i => i.status === "Em teste").length / todos.length) * 100 : 0,
              tom: "var(--warn)" }),
        kpi({ nome: "Propostos", desc: "Aguardando validação",
              valor: todos.filter(i => i.status === "Proposto").length,
              pct: todos.length ? (todos.filter(i => i.status === "Proposto").length / todos.length) * 100 : 0,
              tom: "var(--muted)" })
      ),
      h("div", { estilo: { display: "flex", flexDirection: "column", gap: "14px" } },
        tabela("Ferramenta"), tabela("Processo"))
    );
  }

  function modalImplementacao(tipo, diretoriaPadrao) {
    const fNome = entrada({ placeholder: tipo === "Ferramenta" ? "Notion, CRM, automação…" : "Repasse semanal, onboarding…" });
    const fResp = entrada({ placeholder: "Quem conduz" });
    const fDir = selecao([["", "Sem diretoria"], ...db.dados.diretorias.map(d => [d.id, d.nome])], {
      value: diretoriaPadrao || "",
      onchange: e => seletor.sincronizar(e.target.value)
    });
    const seletor = seletorDiretorias([], diretoriaPadrao || "");
    const fStatus = selecao(STATUS_IMPL, { value: "Proposto" });
    const fRel = entrada({ placeholder: "Link do relatório (opcional)" });

    U.abrirModal({
      sub: tipo, titulo: `Nova ${tipo.toLowerCase()}`, largura: 520,
      corpo: [
        campo("Nome", fNome),
        h("div.linha-campos", campo("Responsável", fResp), campo("Diretoria responsável", fDir)),
        campo("Também vale para", seletor.el,
              "Uma ferramenta ou processo compartilhado entra no quadro de cada diretoria e conta uma vez no TIP."),
        h("div.linha-campos", campo("Status", fStatus), campo("Relatório", fRel))
      ],
      acoes: [
        h("button.btn", { type: "button", onclick: () => U.fecharModal() }, "Cancelar"),
        h("button.btn.btn-primario", {
          type: "button",
          onclick: async () => {
            if (!fNome.value.trim()) { U.aviso("Informe o nome.", "alerta"); fNome.focus(); return; }
            try {
              await db.criar("implementacoes", {
                tipo, nome: fNome.value.trim(),
                responsavel: fResp.value.trim() || null,
                diretoria_id: fDir.value || null,
                diretorias_apoio: seletor.valor(),
                status: fStatus.value,
                relatorio_url: fRel.value.trim() || null,
                data_implementacao: fStatus.value === "Implementado" ? U.hojeISO() : null
              });
              U.fecharModal(); U.aviso("Registrado", "ok");
            } catch (err) { U.aviso("Não salvou: " + err.message, "erro"); }
          }
        }, ic("check"), "Adicionar")
      ]
    });
  }

  /* =========================================================================
     INDICADORES
     ====================================================================== */

  function vIndicadores() {
    const impl = db.dados.implementacoes;
    const implementados = impl.filter(i => i.status === "Implementado").length;
    const tip = impl.length ? Math.round((implementados / impl.length) * 100) : 0;

    const av = db.dados.avaliacoes;
    const somaNotas = av.reduce((s, a) => s + Number(a.nota || 0), 0);
    const somaMax = av.reduce((s, a) => s + Number(a.nota_maxima || 10), 0);
    const isd = somaMax ? Math.round((somaNotas / somaMax) * 100) : 0;

    const internos = db.dados.projetos.filter(p => p.tipo === "Projeto Interno");
    const atingidos = internos.filter(p => p.status === "Concluído").length;
    const inov = internos.length ? Math.round((atingidos / internos.length) * 100) : 0;

    const cartao = (titulo, formula, valor, detalhe, tom) => h("section.painel",
      h("div.painel-hd", h("h2", titulo)),
      h("div.painel-bd", { estilo: { display: "flex", gap: "16px", alignItems: "center" } },
        anel(valor, tom, 86, 8),
        h("div", { estilo: { minWidth: 0 } },
          h("div", { estilo: { font: "800 34px/1 var(--f-display)", letterSpacing: "-.035em", fontVariantNumeric: "tabular-nums" } },
            valor + "%"),
          h("div.rotulo", { estilo: { marginTop: "7px" } }, formula),
          h("p.discreto", { estilo: { fontSize: "12.5px", marginTop: "7px", lineHeight: 1.5 } }, detalhe)
        )
      )
    );

    /* etapas por diretoria */
    const porDir = db.dados.diretorias.map(d => {
      const ids = db.dados.projetos.filter(p => participa(p, d.id)).map(p => p.id);
      const es = db.dados.etapas.filter(e => ids.includes(e.projeto_id));
      return { rotulo: d.nome, valor: es.filter(e => e.concluida).length, total: es.length, tom: U.corVisivel(d.cor) };
    }).filter(x => x.total > 0);

    const porStatus = STATUS.map(s => ({
      rotulo: s,
      valor: db.dados.projetos.filter(p => p.status === s).length,
      tom: TOM_STATUS[s]
    })).filter(x => x.valor > 0);

    /* lançamento de nota (ISD) */
    const fDir = selecao(db.dados.diretorias.map(d => [d.id, d.nome]), { value: db.dados.diretorias[0]?.id });
    const fNota = entrada({ type: "number", min: "0", max: "10", step: "0.5", value: "8", estilo: { maxWidth: "110px" } });

    return h("div.view",
      h("div.grade.surge", { estilo: { gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))" } },
        cartao("TIP", "implementados ÷ propostos", tip,
          `${implementados} de ${impl.length} processos e ferramentas já em uso. ` +
          "Os compartilhados contam uma vez.", "var(--d-agua)"),
        cartao("ISD", "notas recebidas ÷ notas máximas", isd,
          av.length ? `${av.length} avaliação(ões) registradas.` : "Ainda sem avaliações lançadas.", "var(--d-peri)"),
        cartao("Inovação", "objetivos atingidos ÷ projetos definidos", inov,
          `${atingidos} de ${internos.length} projetos internos concluídos.`, "var(--accent)")
      ),
      h("div.grade.g-2.surge", { estilo: { marginTop: "14px" } },
        h("section.painel",
          h("div.painel-hd", h("h2", "Etapas concluídas por diretoria"),
            h("div.acoes", h("span.rotulo", "concluídas / total"))),
          h("div.painel-bd",
            porDir.length
              ? h("div", { estilo: { display: "flex", flexDirection: "column", gap: "11px" } },
                  ...porDir.map(d => h("div",
                    h("div", { estilo: { display: "flex", justifyContent: "space-between", marginBottom: "5px" } },
                      h("span", { estilo: { fontSize: "12.5px", color: "var(--txt-2)" } }, d.rotulo),
                      h("span.dado", { estilo: { fontSize: "11.5px", color: "var(--muted)" } }, `${d.valor}/${d.total}`)
                    ),
                    h("div.progresso", h("i", { estilo: { width: Math.round((d.valor / d.total) * 100) + "%", "--tom": d.tom } }))
                  ))
                )
              : U.vazio("pulso", "Sem etapas cadastradas", "Adicione etapas aos projetos para acompanhar a execução.")
          ,
            h("p.discreto", { estilo: { fontSize: "11.5px", marginTop: "13px", lineHeight: 1.55 } },
              "Projetos conjuntos entram na barra de cada diretoria envolvida, porque as etapas são executadas por todas. " +
              "Nos três indicadores acima cada ação vale uma só.")
          )
        ),
        h("section.painel",
          h("div.painel-hd", h("h2", "Situação dos projetos")),
          h("div.painel-bd", barras(porStatus))
        )
      ),
      h("section.painel.surge", { estilo: { marginTop: "14px" } },
        h("div.painel-hd", h("h2", "Satisfação das diretorias (ISD)"),
          h("div.acoes", h("span.rotulo", "base do indicador"))),
        h("div.painel-bd",
          h("div", { estilo: { display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-end", marginBottom: av.length ? "16px" : "0" } },
            campo("Diretoria", fDir),
            campo("Nota (0 a 10)", fNota),
            h("button.btn.btn-primario", {
              type: "button",
              onclick: async () => {
                const nota = Number(fNota.value);
                if (Number.isNaN(nota) || nota < 0 || nota > 10) { U.aviso("Informe uma nota entre 0 e 10.", "alerta"); return; }
                try {
                  await db.criar("avaliacoes", {
                    diretoria_id: fDir.value, nota, nota_maxima: 10,
                    competencia: U.hojeISO().slice(0, 8) + "01"
                  });
                  U.aviso("Nota lançada", "ok");
                  CI.app.recarregarVista();
                } catch (err) { U.aviso(err.message, "erro"); }
              }
            }, ic("mais"), "Lançar nota")
          ),
          av.length
            ? h("div.tabela-rolagem", h("table.tabela", { estilo: { minWidth: "440px" } },
                h("thead", h("tr", h("th", "Diretoria"), h("th", "Nota"), h("th", "Competência"), h("th", ""))),
                h("tbody", ...av.slice().reverse().map(a => h("tr",
                  h("td", nomeDiretoria(a.diretoria_id)),
                  h("td.dado", `${a.nota} / ${a.nota_maxima || 10}`),
                  h("td.discreto", U.dataBR(a.competencia)),
                  h("td", { estilo: { textAlign: "right" } },
                    h("button.btn.btn-fantasma.btn-icone.btn-p", {
                      type: "button", "aria-label": "Remover nota",
                      onclick: async () => {
                        try { await db.excluir("avaliacoes", a.id); CI.app.recarregarVista(); }
                        catch (err) { U.aviso(err.message, "erro"); }
                      }
                    }, ic("lixeira")))
                )))
              ))
            : h("p.discreto", { estilo: { fontSize: "12.5px" } },
                "Lance as notas do formulário de satisfação para o ISD sair do zero.")
        )
      )
    );
  }

  /* =========================================================================
     CONFIGURAÇÃO
     ====================================================================== */

  function painelAvisos() {
    const internos = db.dados.projetos.filter(p => p.tipo === "Projeto Interno");
    const fNome = entrada({ value: db.perfil.nome || "", placeholder: "Seu nome" });
    const fEmail = entrada({ type: "email", value: db.perfil.email || "", placeholder: "voce@adecon.com.br" });

    let minhas = inscricoesDe(fEmail.value);
    let todos = minhas.some(i => !i.projeto_id);
    let escolhidos = new Set(minhas.filter(i => i.projeto_id).map(i => i.projeto_id));

    /* Os botões são criados uma vez e só mudam de estado. Recriá-los a cada
       alteração fazia o navegador descartar o clique seguinte, porque o nó
       sumia entre o apertar e o soltar do mouse. */
    const alternarTodos = h("button.dir-toggle", {
      type: "button", estilo: { "--tom": "var(--accent)" },
      onclick: () => { todos = !todos; atualizar(); }
    }, h("i.ponto-dir", { estilo: { background: "var(--accent)" } }), "Todos os projetos internos");

    const botoes = internos.map(p => {
      const cor = corProjeto(p);
      return {
        p,
        el: h("button.dir-toggle", {
          type: "button", title: p.nome, estilo: { "--tom": cor },
          onclick: () => {
            escolhidos.has(p.id) ? escolhidos.delete(p.id) : escolhidos.add(p.id);
            atualizar();
          }
        }, h("i.ponto-dir", { estilo: { background: cor } }), p.nome)
      };
    });
    const lista = h("div.multi-dir", ...botoes.map(b => b.el));

    function atualizar() {
      alternarTodos.classList.toggle("ativa", todos);
      botoes.forEach(({ p, el }) => {
        el.classList.toggle("ativa", todos || escolhidos.has(p.id));
        el.disabled = todos;
      });
    }

    let emailCarregado = normEmail(fEmail.value);
    fEmail.addEventListener("change", () => {
      const e = normEmail(fEmail.value);
      if (e === emailCarregado) return;
      emailCarregado = e;
      minhas = inscricoesDe(e);
      todos = minhas.some(i => !i.projeto_id);
      escolhidos = new Set(minhas.filter(i => i.projeto_id).map(i => i.projeto_id));
      atualizar();
    });
    atualizar();

    const inscritos = db.dados.inscricoes.slice()
      .sort((a, b) => normEmail(a.email).localeCompare(normEmail(b.email)));

    return h("section.painel",
      h("div.painel-hd",
        h("h2", "Avisos por e-mail"),
        h("div.acoes", chip(`${new Set(db.dados.inscricoes.map(i => normEmail(i.email))).size} inscritos`))),
      h("div.painel-bd", { estilo: { display: "grid", gap: "14px" } },
        h("p.discreto", { estilo: { fontSize: "12.5px", lineHeight: 1.6 } },
          "Cadastre seu e-mail para ser avisado quando o prazo estiver chegando. ",
          "Os avisos saem ", h("strong", { estilo: { color: "var(--txt-2)" } }, "7 dias, 3 dias e 1 dia antes"),
          ", sempre às ", h("strong", { estilo: { color: "var(--txt-2)" } }, "13h30"),
          ", tanto para as etapas quanto para o término do projeto."),

        h("div.linha-campos", campo("Nome", fNome), campo("E-mail", fEmail)),
        campo("O que você quer acompanhar", h("div", { estilo: { display: "grid", gap: "8px" } },
          h("div.multi-dir", alternarTodos), lista),
          "Marque \u201ctodos\u201d para receber de qualquer projeto interno, inclusive os criados depois — " +
          "ou escolha um a um."),

        h("div", { estilo: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          h("button.btn.btn-primario", {
            type: "button",
            onclick: async () => {
              const email = normEmail(fEmail.value);
              if (!email.includes("@")) { U.aviso("Informe um e-mail válido.", "alerta"); fEmail.focus(); return; }
              if (!todos && !escolhidos.size) { U.aviso("Escolha ao menos um projeto — ou marque todos.", "alerta"); return; }
              try {
                await salvarInscricoes(email, fNome.value.trim(), todos, [...escolhidos]);
                db.salvarPerfil({ nome: fNome.value.trim(), email });
                U.aviso("Avisos configurados para " + email, "ok");
                CI.app.recarregarVista();
              } catch (err) { U.aviso("Não salvou: " + err.message, "erro"); }
            }
          }, ic("correio"), "Salvar meus avisos"),
          minhas.length ? h("button.btn.btn-perigo", {
            type: "button",
            onclick: async () => {
              const ok = await U.confirmar("Cancelar avisos",
                `${normEmail(fEmail.value)} deixa de receber qualquer aviso de prazo.`, "Cancelar avisos");
              if (!ok) return;
              for (const i of inscricoesDe(fEmail.value)) await db.excluir("inscricoes", i.id);
              U.aviso("Inscrições removidas", "ok");
              CI.app.recarregarVista();
            }
          }, ic("x"), "Cancelar meus avisos") : null
        ),

        db.motor === "local"
          ? h("p", { estilo: { fontSize: "12px", color: "var(--warn)", lineHeight: 1.55 } },
              "Em modo local a inscrição fica só neste navegador e nenhum e-mail é enviado. ",
              "Conecte o Supabase e publique as Edge Functions para os avisos saírem de verdade.")
          : null,

        inscritos.length
          ? h("div",
              h("span.rotulo", { estilo: { display: "block", marginBottom: "9px" } }, "quem já está inscrito"),
              h("div.tabela-rolagem", h("table.tabela", { estilo: { minWidth: "420px" } },
                h("thead", h("tr", h("th", "Pessoa"), h("th", "Acompanha"), h("th", ""))),
                h("tbody", ...inscritos.map(i => h("tr",
                  h("td",
                    h("div", { estilo: { fontWeight: 500 } }, i.nome || "—"),
                    h("div.dado", { estilo: { fontSize: "11px", color: "var(--muted)" } }, i.email)),
                  h("td", i.projeto_id
                    ? (db.projeto(i.projeto_id)?.nome || "projeto removido")
                    : chip("Todos os projetos internos", "acc")),
                  h("td", { estilo: { textAlign: "right" } },
                    h("button.btn.btn-fantasma.btn-icone.btn-p", {
                      type: "button", "aria-label": "Remover inscrição",
                      onclick: async () => {
                        try { await db.excluir("inscricoes", i.id); CI.app.recarregarVista(); }
                        catch (err) { U.aviso(err.message, "erro"); }
                      }
                    }, ic("lixeira")))
                )))
              )))
          : null
      )
    );
  }

  function vConfig() {
    const con = db.conexao();
    const fUrl = entrada({ value: con.url, placeholder: "https://xxxxxxxx.supabase.co" });
    const fChave = entrada({ value: con.chave, placeholder: "eyJhbGciOi… (chave anon / publishable)" });
    const fNome = entrada({ value: db.perfil.nome || "", placeholder: "Como você assina os comentários" });
    const fEmail = entrada({ type: "email", value: db.perfil.email || "", placeholder: "voce@adecon.com.br" });

    const painelConexao = h("section.painel",
      h("div.painel-hd", h("h2", "Conexão com o Supabase"),
        h("div.acoes", chip(db.mensagemEstado,
          db.estado === "online" ? "ok" : db.estado === "erro" ? "crit" : null))),
      h("div.painel-bd", { estilo: { display: "grid", gap: "13px" } },
        h("p.discreto", { estilo: { fontSize: "12.5px", lineHeight: 1.6 } },
          "Sem estas chaves o painel roda em modo local: tudo fica só neste navegador. ",
          "Com elas, os dados passam a ser do banco e todo mundo vê a mesma coisa em tempo real. ",
          "A chave anon é pública por natureza — quem protege os dados são as políticas de RLS do schema."),
        campo("URL do projeto", fUrl),
        campo("Chave anon", fChave),
        h("div", { estilo: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          h("button.btn.btn-primario", {
            type: "button",
            onclick: async () => {
              db.salvarConexao(fUrl.value, fChave.value);
              U.aviso("Conexão salva. Recarregando…", "ok");
              setTimeout(() => location.reload(), 700);
            }
          }, ic("plugue"), "Salvar e conectar"),
          con.url ? h("button.btn", {
            type: "button",
            onclick: async () => {
              db.salvarConexao("", "");
              U.aviso("Voltando ao modo local…", "info");
              setTimeout(() => location.reload(), 700);
            }
          }, ic("recarregar"), "Desconectar") : null,
          h("button.btn", {
            type: "button",
            onclick: async () => {
              const r = await db.dispararEmails();
              U.aviso(r?.pulado ? "Disponível apenas com Supabase conectado."
                : r?.erro ? "Falhou: " + r.erro
                : `Fila processada: ${r.enviadas ?? 0} e-mail(s).`,
                r?.erro ? "erro" : "ok");
            }
          }, ic("correio"), "Enviar fila de e-mails agora")
        ),
        db.motor === "supabase" && !db.usuario
          ? h("p", { estilo: { fontSize: "12.5px", color: "var(--warn)" } },
              "Conectado, mas sem sessão. Entre com seu e-mail para ler e gravar no banco.")
          : null
      )
    );

    const painelPerfil = h("section.painel",
      h("div.painel-hd", h("h2", "Seu perfil")),
      h("div.painel-bd", { estilo: { display: "grid", gap: "13px" } },
        h("div.linha-campos", campo("Nome", fNome), campo("E-mail", fEmail)),
        h("div", h("button.btn.btn-primario", {
          type: "button",
          onclick: () => { db.salvarPerfil({ nome: fNome.value.trim(), email: fEmail.value.trim() }); U.aviso("Perfil salvo", "ok"); }
        }, ic("check"), "Salvar perfil")),
        db.usuario
          ? h("div", h("button.btn", { type: "button", onclick: () => db.sair() }, ic("sair"), "Sair da conta"))
          : null
      )
    );

    const painelDados = h("section.painel",
      h("div.painel-hd", h("h2", "Dados")),
      h("div.painel-bd", { estilo: { display: "grid", gap: "13px" } },
        h("p.discreto", { estilo: { fontSize: "12.5px", lineHeight: 1.6 } },
          "O arquivo JSON serve de backup e também para migrar do modo local para o Supabase."),
        h("div", { estilo: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          h("button.btn", { type: "button", onclick: exportarJSON }, ic("baixar"), "Exportar JSON"),
          h("button.btn", { type: "button", onclick: importarJSON }, ic("arquivo"), "Importar JSON"),
          h("button.btn", { type: "button", onclick: () => exportarCSVGeral() }, ic("baixar"), "Exportar etapas (CSV)"),
          db.motor === "local" ? h("button.btn", {
            type: "button",
            onclick: async () => {
              const ok = await U.confirmar("Restaurar exemplo",
                "Os dados atuais deste navegador serão substituídos pelos dados da planilha.", "Restaurar", false);
              if (ok) { db.restaurarExemplo(); U.aviso("Dados de exemplo restaurados", "ok"); CI.app.recarregarVista(); }
            }
          }, ic("recarregar"), "Restaurar exemplo") : null,
          db.motor === "local" ? h("button.btn.btn-perigo", {
            type: "button",
            onclick: async () => {
              const ok = await U.confirmar("Limpar tudo", "Todos os dados deste navegador serão apagados.", "Limpar");
              if (ok) { db.limparTudo(); U.aviso("Tudo limpo", "ok"); CI.app.recarregarVista(); }
            }
          }, ic("lixeira"), "Limpar tudo") : null
        )
      )
    );

    const painelEmail = h("section.painel",
      h("div.painel-hd", h("h2", "E-mails automáticos")),
      h("div.painel-bd",
        h("p.discreto", { estilo: { fontSize: "12.5px", lineHeight: 1.65, marginBottom: "12px" } },
          "O banco enfileira um e-mail sempre que uma etapa ganha responsável, alguém comenta ou um prazo se aproxima. ",
          "Uma Edge Function esvazia a fila pelo Resend."),
        h("ul", { estilo: { margin: 0, paddingLeft: "18px", color: "var(--txt-2)", fontSize: "12.5px", lineHeight: 1.9 } },
          h("li", "Etapa atribuída — chega para o responsável na hora."),
          h("li", "Novo comentário — chega para o responsável da etapa."),
          h("li", "Prazo em 3 dias e no dia — enviado às 8h em dias úteis."),
          h("li", "Prazo vencido — enviado até a etapa ser concluída ou repactuada.")
        ),
        h("p.discreto", { estilo: { fontSize: "12px", marginTop: "12px" } },
          "Configure RESEND_API_KEY, EMAIL_REMETENTE e URL_APP nos secrets das Edge Functions. O passo a passo está no README do repositório.")
      )
    );

    return h("div.view",
      h("div.grade.g-2.surge",
        h("div", { estilo: { display: "flex", flexDirection: "column", gap: "14px" } }, painelConexao, painelDados),
        h("div", { estilo: { display: "flex", flexDirection: "column", gap: "14px" } }, painelPerfil, painelEmail)
      ),
      h("div.surge", { estilo: { marginTop: "14px" } }, painelAvisos())
    );
  }

  /* =========================================================================
     EXPORTAÇÃO
     ====================================================================== */

  function baixar(nome, conteudo, tipo) {
    try {
      const blob = new Blob([conteudo], { type: tipo });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      U.aviso("Arquivo gerado: " + nome, "ok");
    } catch (_) {
      U.aviso("O navegador bloqueou o download aqui. Tente pelo site publicado.", "alerta");
    }
  }

  function csvLinha(campos) {
    return campos.map(c => {
      const s = String(c ?? "");
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(";");
  }

  function exportarProjeto(p) {
    const linhas = [csvLinha(["Etapa", "Descrição", "Responsável", "E-mail", "Data de entrega", "Dentro do prazo", "Concluída", "Observação", "Anotações", "Arquivo"])];
    db.etapasDe(p.id).forEach(e => {
      const dentro = e.concluida
        ? (!e.data_entrega || !e.concluida_em || e.concluida_em.slice(0, 10) <= e.data_entrega)
        : (!e.data_entrega || U.diasAte(e.data_entrega) >= 0);
      linhas.push(csvLinha([e.numero, e.descricao, e.responsavel, e.responsavel_email,
        e.data_entrega ? U.dataBR(e.data_entrega) : "", dentro ? "SIM" : "NÃO",
        e.concluida ? "SIM" : "NÃO", e.observacao, e.anotacoes, e.arquivo_url]));
    });
    baixar(`${p.nome.replace(/[^\w\-]+/g, "_")}.csv`, "﻿" + linhas.join("\n"), "text/csv;charset=utf-8");
  }

  function exportarCSVGeral() {
    const linhas = [csvLinha(["Projeto", "Diretoria", "Prioridade", "Etapa", "Descrição", "Responsável", "Data de entrega", "Concluída"])];
    db.dados.projetos.forEach(p => db.etapasDe(p.id).forEach(e => {
      linhas.push(csvLinha([p.nome, nomeDiretoria(p.diretoria_id), p.prioridade, e.numero,
        e.descricao, e.responsavel, e.data_entrega ? U.dataBR(e.data_entrega) : "", e.concluida ? "SIM" : "NÃO"]));
    }));
    baixar("central-inovacao-etapas.csv", "﻿" + linhas.join("\n"), "text/csv;charset=utf-8");
  }

  function exportarJSON() {
    baixar("central-inovacao.json", JSON.stringify(db.dados, null, 2), "application/json");
  }

  function importarJSON() {
    const input = h("input", { type: "file", accept: "application/json,.json", estilo: { display: "none" } });
    input.addEventListener("change", async () => {
      const arquivo = input.files?.[0];
      if (!arquivo) return;
      try {
        const bruto = JSON.parse(await arquivo.text());
        if (db.motor === "local") {
          db.TABELAS.forEach(t => { if (Array.isArray(bruto[t])) db.dados[t] = bruto[t]; });
          try { localStorage.setItem("ci:dados:v2", JSON.stringify(db.dados)); } catch (_) {}
          db.emitir();
          U.aviso("Dados importados", "ok");
        } else {
          let n = 0;
          for (const tabela of db.TABELAS) {
            for (const linha of (bruto[tabela] || [])) {
              const copia = Object.assign({}, linha); delete copia.id; delete copia.criado_em;
              try { await db.criar(tabela, copia); n++; } catch (_) {}
            }
          }
          U.aviso(`${n} registro(s) enviados ao Supabase`, "ok");
        }
        CI.app.recarregarVista();
      } catch (err) { U.aviso("Arquivo inválido: " + err.message, "erro"); }
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }

  /* ---- busca global ------------------------------------------------------ */

  function buscaGlobal(termo) {
    const q = termo.trim().toLowerCase();
    if (!q) return [];
    const res = [];
    db.dados.projetos.forEach(p => {
      if ((p.nome || "").toLowerCase().includes(q) || (p.objetivo || "").toLowerCase().includes(q)) {
        res.push({ tipo: "Projeto", titulo: p.nome, sub: nomeDiretoria(p.diretoria_id), ir: () => (location.hash = "#/projeto/" + p.id) });
      }
    });
    db.dados.etapas.forEach(e => {
      if ((e.descricao || "").toLowerCase().includes(q) || (e.responsavel || "").toLowerCase().includes(q)) {
        const p = db.projeto(e.projeto_id);
        res.push({
          tipo: "Etapa", titulo: e.descricao, sub: `${p?.nome || ""} · etapa ${e.numero}`,
          ir: () => { location.hash = "#/projeto/" + e.projeto_id; setTimeout(() => gavetaEtapa(e.id), 90); }
        });
      }
    });
    return res.slice(0, 12);
  }

  /* =========================================================================
     PÁGINA INICIAL — a rede das diretorias
     As oito áreas (diretorias, presidência e conexões) giram devagar num anel
     visto de perfil, ligadas a um
     núcleo central. A cada 2,5 s uma conexão se acende entre duas delas e um
     pulso percorre o traçado: é uma ação conjunta nascendo. Volta completa em
     20 s, tudo calculado a partir do tempo — o laço fecha sem emenda.
     ====================================================================== */

  const DUR_CICLO = 20000;

  const sat01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
  const saiCubica   = t => 1 - Math.pow(1 - t, 3);
  const entraCubica = t => t * t * t;
  const suave       = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function comAlfa(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function palcoAnimado() {
    const cv = h("canvas", {
      role: "img",
      "aria-label": "Animação: as diretorias da Adecon, a presidência e as conexões dispostas " +
                    "em um anel que gira devagar, ligadas a um núcleo central. Conexões se " +
                    "acendem entre elas, representando as ações tocadas em conjunto.",
      estilo: { display: "block", width: "100%" }
    });
    const ctx = cv.getContext("2d");

    const raiz = getComputedStyle(document.documentElement);
    const tok = (n, alt) => (raiz.getPropertyValue(n).trim() || alt);
    const C = {
      acento: tok("--accent", "#FF5A1F"),
      linha:  tok("--line", "#1E2A38"),
      suave:  tok("--line-soft", "#16202C"),
      fraco:  tok("--faint", "#57677A"),
      muted:  tok("--muted", "#7B8B9F"),
      txt:    tok("--txt", "#E7EDF4"),
      painel: tok("--panel", "#0D1219")
    };

    /* as oito diretorias, na ordem do quadro */
    const NOS = [
      { sigla: "PRES",  cor: "#14161A" },
      { sigla: "JF",    cor: "#0FA34F" },
      { sigla: "GP",    cor: "#F2C200" },
      { sigla: "COM",   cor: "#F5871F" },
      { sigla: "MKT",   cor: "#B79CF0" },
      { sigla: "PROJ",  cor: "#2563EB" },
      { sigla: "TOP",   cor: "#5B21B6" },
      { sigla: "CONEX", cor: "#06B6D4" }
    ].map(n => Object.assign(n, { tom: U.corVisivel(n.cor) }));

    /* as conexões que se acendem, uma a cada 2,5 s — as reais do ciclo */
    const LIGACOES = [
      [7, 3], [7, 4], [2, 0], [7, 5], [1, 7], [6, 7], [7, 2], [5, 6]
    ];
    const PASSO = DUR_CICLO / LIGACOES.length;
    const DURA = 1750;      // quanto tempo cada conexão fica visível

    /* Geometria em pixels de CSS: o anel cresce com o espaço disponível, mas
       traços e letras continuam no tamanho certo — o palco fica maior de
       verdade, em vez de virar um zoom do desenho pequeno. */
    let G = { w: 720, h: 320, cx: 360, cy: 160, rx: 286, ry: 104, k: 1 };

    function medir() {
      const w = Math.max(320, Math.round(cv.clientWidth || 720));
      const alt = Math.round(Math.max(290, Math.min(560, w * 0.44)));
      const estreito = w < 620;
      return {
        w, h: alt,
        cx: w / 2, cy: alt / 2,
        rx: Math.max(96, w / 2 - (estreito ? 46 : 78)),
        ry: Math.max(54, alt / 2 - (estreito ? 40 : 58)),
        k: Math.min(1.5, Math.max(0.9, w / 820))
      };
    }

    const posicao = (i, giro) => {
      const a = -Math.PI / 2 + (i / NOS.length) * Math.PI * 2 + giro;
      return {
        x: G.cx + G.rx * Math.cos(a),
        y: G.cy + G.ry * Math.sin(a),
        // quem está na frente do anel aparece maior e mais nítido
        frente: (Math.sin(a) + 1) / 2,
        a
      };
    };

    /** Curva que passa por dentro do anel, entre dois nós. */
    function pontoDaCurva(p0, p1, u) {
      const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
      const cx = mx + (G.cx - mx) * .62, cy = my + (G.cy - my) * .62;
      const v = 1 - u;
      return {
        x: v * v * p0.x + 2 * v * u * cx + u * u * p1.x,
        y: v * v * p0.y + 2 * v * u * cy + u * u * p1.y
      };
    }

    function desenharCena(t) {
      const { w: LW, h: LH, cx: CX, cy: CY, rx: RX, ry: RY, k } = G;
      ctx.clearRect(0, 0, LW, LH);
      const giro = (t / DUR_CICLO) * Math.PI * 2;
      const pontos = NOS.map((_, i) => posicao(i, giro));

      /* trilho do anel */
      ctx.strokeStyle = C.linha;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(CX, CY, RX, RY, 0, 0, Math.PI * 2);
      ctx.stroke();

      /* raios até o núcleo */
      pontos.forEach((p, i) => {
        ctx.strokeStyle = comAlfa(NOS[i].tom, .08 + p.frente * .13);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });

      /* conexões acesas */
      const brilho = new Array(NOS.length).fill(0);
      LIGACOES.forEach(([a, b], k) => {
        // a mesma conexão reaparece no ciclo seguinte: cobre a virada sem corte
        [0, -DUR_CICLO].forEach(deslocamento => {
          const inicio = k * PASSO + deslocamento;
          const u = (t - inicio) / DURA;
          if (u < 0 || u > 1) return;

          const p0 = pontos[a], p1 = pontos[b];
          const traco = saiCubica(sat01(u / .42));            // desenha
          const some = u > .72 ? 1 - (u - .72) / .28 : 1;     // apaga
          const nitidez = Math.min(p0.frente, p1.frente) * .5 + .5;

          const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
          grad.addColorStop(0, comAlfa(NOS[a].tom, .85 * some * nitidez));
          grad.addColorStop(1, comAlfa(NOS[b].tom, .85 * some * nitidez));
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5 * k;
          ctx.lineCap = "round";
          ctx.beginPath();
          const passos = 40;
          for (let s = 0; s <= passos * traco; s++) {
            const q = pontoDaCurva(p0, p1, s / passos);
            s === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
          }
          ctx.stroke();

          // o pulso que percorre a conexão
          const pu = sat01((u - .18) / .44);
          if (pu > 0 && pu < 1) {
            const q = pontoDaCurva(p0, p1, suave(pu));
            const raioHalo = 9 * k;
            const halo = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, raioHalo);
            halo.addColorStop(0, comAlfa(C.acento, .55 * some));
            halo.addColorStop(1, comAlfa(C.acento, 0));
            ctx.fillStyle = halo;
            ctx.beginPath(); ctx.arc(q.x, q.y, raioHalo, 0, 7); ctx.fill();
            ctx.fillStyle = comAlfa(C.acento, some);
            ctx.beginPath(); ctx.arc(q.x, q.y, 2.3 * k, 0, 7); ctx.fill();
          }

          brilho[a] = Math.max(brilho[a], saiCubica(sat01(u / .2)) * some);
          brilho[b] = Math.max(brilho[b], saiCubica(sat01((u - .5) / .18)) * some);

          // anel de chegada
          const ru = sat01((u - .6) / .3);
          if (ru > 0 && ru < 1) {
            ctx.strokeStyle = comAlfa(NOS[b].tom, (1 - ru) * .7);
            ctx.lineWidth = 1.4 * k;
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, (7 + ru * 16) * k, 0, 7);
            ctx.stroke();
          }
        });
      });

      /* núcleo */
      // o período precisa dividir DUR_CICLO, senão a volta completa não fecha
      const respira = .5 + .5 * Math.sin((2 * Math.PI * t) / (DUR_CICLO / 2));
      const rNucleo = 46 * k;
      const halo = ctx.createRadialGradient(CX, CY, 0, CX, CY, rNucleo);
      halo.addColorStop(0, comAlfa(C.acento, .12 + respira * .05));
      halo.addColorStop(1, comAlfa(C.acento, 0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(CX, CY, rNucleo, 0, 7); ctx.fill();

      ctx.strokeStyle = comAlfa(C.acento, .22 + respira * .12);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(CX, CY, (27 + respira * 1.5) * k, 0, 7); ctx.stroke();

      ctx.fillStyle = C.painel;
      ctx.beginPath(); ctx.arc(CX, CY, 19 * k, 0, 7); ctx.fill();
      ctx.strokeStyle = comAlfa(C.acento, .55);
      ctx.lineWidth = 1.4 * k;
      ctx.beginPath(); ctx.arc(CX, CY, 19 * k, 0, 7); ctx.stroke();

      ctx.fillStyle = C.txt;
      ctx.font = `600 ${(8 * k).toFixed(1)}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ADECON", CX, CY - 3 * k);
      ctx.fillStyle = comAlfa(C.acento, .9);
      ctx.font = `600 ${(6.5 * k).toFixed(1)}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.fillText("INOVAÇÃO", CX, CY + 7 * k);

      /* nós — os de trás primeiro, para a profundidade ficar correta */
      NOS.map((n, i) => ({ n, i, p: pontos[i] }))
         .sort((a, b) => a.p.frente - b.p.frente)
         .forEach(({ n, i, p }) => {
        const f = p.frente, b = brilho[i];
        const r = (6.6 + f * 3.6 + b * 3) * k;

        if (b > .02) {
          const rg = 26 * k;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rg);
          g.addColorStop(0, comAlfa(n.tom, .32 * b));
          g.addColorStop(1, comAlfa(n.tom, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, rg, 0, 7); ctx.fill();
        }

        ctx.fillStyle = comAlfa(n.tom, .42 + f * .45 + b * .13);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();

        ctx.fillStyle = C.painel;
        ctx.beginPath(); ctx.arc(p.x, p.y, r - 2.9 * k, 0, 7); ctx.fill();
        ctx.fillStyle = comAlfa(n.tom, .6 + f * .4);
        ctx.beginPath(); ctx.arc(p.x, p.y, r - 5 * k, 0, 7); ctx.fill();

        const lx = CX + (RX + 26 * k) * Math.cos(p.a);
        const ly = CY + (RY + 19 * k) * Math.sin(p.a);
        ctx.font = `600 ${((8.4 + f * 1.6) * k).toFixed(1)}px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.fillStyle = comAlfa(b > .3 ? n.tom : C.muted, .35 + f * .45 + b * .2);
        ctx.fillText(n.sigla, lx, ly);
      });
    }

    /* --- dimensionamento e laço ------------------------------------------- */

    function ajustar() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const g = medir();
      const mudou = g.w !== G.w || g.h !== G.h;
      G = g;
      const alvoW = Math.round(g.w * dpr), alvoH = Math.round(g.h * dpr);
      if (cv.width !== alvoW || cv.height !== alvoH) {
        cv.width = alvoW; cv.height = alvoH;
        cv.style.height = g.h + "px";
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return mudou;
    }

    /* Com "reduzir movimento" ligado no sistema, a cena abre parada num quadro
       com conexões acesas — e o botão fica em destaque para quem quiser ver. */
    const pedeQuieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let escolha = null;
    try { escolha = localStorage.getItem("ci:animacao"); } catch (_) {}
    let rodando = escolha ? escolha === "rodando" : !pedeQuieto;

    const botao = h("button.palco-play", { type: "button" });
    function pintarBotao() {
      U.limpar(botao);
      botao.appendChild(ic(rodando ? "pausa" : "tocar"));
      botao.appendChild(h("span", rodando ? "Pausar" : "Reproduzir"));
      botao.setAttribute("aria-label", rodando ? "Pausar a animação" : "Reproduzir a animação");
      botao.classList.toggle("destaque", !rodando);
    }
    botao.addEventListener("click", () => {
      rodando = !rodando;
      try { localStorage.setItem("ci:animacao", rodando ? "rodando" : "parado"); } catch (_) {}
      pintarBotao();
    });
    pintarBotao();

    let tCena = 1200;
    let anterior = performance.now();
    let jaApareceu = false;
    let precisaPintar = true;

    function quadro(agora) {
      if (cv.isConnected) jaApareceu = true;
      else if (jaApareceu) return;
      const dt = Math.min(agora - anterior, 50);
      anterior = agora;
      const redimensionou = ajustar();
      if (rodando) { tCena = (tCena + dt) % DUR_CICLO; precisaPintar = true; }
      if (precisaPintar || redimensionou) {
        desenharCena(tCena);
        precisaPintar = rodando;
      }
      requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);

    cv.__cena = desenharCena;
    return h("div", { estilo: { position: "relative" } }, cv, botao);
  }

  function vInicio() {
    const projetos = db.dados.projetos;
    const internos = projetos.filter(p => p.tipo === "Projeto Interno");
    const etapas = db.dados.etapas;
    const feitas = etapas.filter(e => e.concluida).length;

    const numero = (valor, rotulo) => h("div.inicio-num",
      h("b", String(valor)), h("span.rotulo", rotulo));

    return h("div.view",
      h("section.inicio",
        h("div.inicio-cabeca",
          h("span.rotulo", `${(window.CI_CONFIG || {}).EMPRESA || "Adecon"} · ciclo ${(window.CI_CONFIG || {}).ANO_CICLO || new Date().getFullYear()}`),
          h("h1", "Central de ", h("em", "Inovação")),
          h("p.inicio-lema", "Uma empresa que se planeja em voz alta"),
          h("p.chamada",
            `Os projetos internos ${fraseDiretorias(diretoriasContaveis().length)} em um lugar só: `,
            "cronograma por semana, etapas com dono e prazo, comentários onde a decisão ",
            "acontece e os indicadores se atualizando conforme a execução anda.")
        ),

        h("div.palco",
          palcoAnimado(),
          h("div.palco-rodape",
            h("span.rotulo", "as diretorias, a presidência e as conexões"),
            h("span.rotulo", { estilo: { color: "var(--accent)" } }, "conexões ativas"))
        ),

        h("div.inicio-acoes",
          h("button.btn.btn-primario", {
            type: "button", onclick: () => (location.hash = "#/painel")
          }, ic("painel"), "Abrir o painel"),
          h("button.btn", {
            type: "button", onclick: () => (location.hash = "#/cronograma")
          }, ic("cronograma"), "Ver o cronograma"),
          h("button.btn.btn-fantasma", {
            type: "button", onclick: () => modalProjeto()
          }, ic("mais"), "Criar um projeto")
        ),

        h("div.inicio-nums",
          numero(internos.length, "projetos internos"),
          numero(diretoriasContaveis().length, "diretorias"),
          numero(etapas.length, "etapas mapeadas"),
          numero(etapas.length ? Math.round((feitas / etapas.length) * 100) + "%" : "0%", "já concluído")
        )
      )
    );
  }

  /* =========================================================================
     BRAINSTORM — o banco de ideias aberto à empresa
     A empresa inteira propõe e apoia no mural. O funil (atração, qualificação,
     fechamento) fica atrás de uma senha, porque é decisão da inovação.
     ====================================================================== */

  const SENHA_FUNIL = "5296";
  const TIPOS_IDEIA = ["Projeto Interno", "Ferramenta", "Processo", "Iniciativa", "Outro"];
  const ETAPAS_FUNIL = [
    { id: "atracao",      nome: "Atração",      desc: "tudo que chegou e está no ar",
      tom: "var(--nuvem)", lavagem: "var(--nuvem-wash)" },
    { id: "qualificacao", nome: "Qualificação", desc: "vale a pena? quem toca? quanto custa?",
      tom: "var(--warn)",  lavagem: "var(--warn-wash)" },
    { id: "fechamento",   nome: "Fechamento",   desc: "aprovada — daqui vira projeto",
      tom: "var(--ok)",    lavagem: "var(--ok-wash)" }
  ];
  const ETAPA = id => ETAPAS_FUNIL.find(e => e.id === id) || ETAPAS_FUNIL[0];

  let bsFiltro = "Todos";
  let bsOrdem = "recentes";
  let bsArquivadas = false;

  const ideiasVivas = () => db.dados.ideias.filter(i => !i.arquivada);
  const ideiasDaEtapa = id => ideiasVivas()
    .filter(i => (i.etapa || "atracao") === id)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) ||
                    String(b.criado_em).localeCompare(String(a.criado_em)));

  /** Identidade de quem apoia. Com Supabase é o e-mail; sem ele, um id do navegador. */
  function quemSou() {
    const e = String(db.usuario?.email || db.perfil?.email || "").trim().toLowerCase();
    if (e) return e;
    try {
      let a = localStorage.getItem("ci:anon");
      if (!a) { a = "anon-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("ci:anon", a); }
      return a;
    } catch (_) { return "anon"; }
  }

  const apoios = i => (Array.isArray(i.apoios) ? i.apoios : []);
  const apoiei = i => apoios(i).includes(quemSou());

  async function alternarApoio(i) {
    const eu = quemSou();
    const lista = apoios(i).slice();
    const j = lista.indexOf(eu);
    if (j >= 0) lista.splice(j, 1); else lista.push(eu);
    try { await db.atualizar("ideias", i.id, { apoios: lista }); }
    catch (err) { U.aviso("Não deu para registrar: " + err.message, "erro"); }
  }

  function funilAberto() {
    try { return localStorage.getItem("ci:funil") === "1"; } catch (_) { return false; }
  }
  function guardarFunil(aberto) {
    try { aberto ? localStorage.setItem("ci:funil", "1") : localStorage.removeItem("ci:funil"); } catch (_) {}
  }

  /* ---- a nuvem carregada ---------------------------------------------------
     Canvas sem moldura no topo da página. A nuvem respira, o ar em volta
     brilha e, em tempos marcados, um raio pisca — sempre mais de uma vez,
     porque raio de verdade tremeluz. Tudo é função do tempo dentro de um
     ciclo de 9 s, e todo termo periódico tem período que divide o ciclo:
     o laço fecha sem emenda.
     ---------------------------------------------------------------------- */

  const DUR_CEU = 9000;

  const PUFFS = [
    { x: -134, y:  18, r: 26, f: 1.7 },
    { x: -102, y:  -2, r: 35, f: 2.3 },
    { x:  -64, y: -20, r: 44, f: 1.1 },
    { x:  -14, y: -30, r: 51, f: 2.9 },
    { x:   36, y: -19, r: 44, f: 1.5 },
    { x:   80, y:  -3, r: 35, f: 2.1 },
    { x:  116, y:  16, r: 26, f: 2.7 },
    { x:  -90, y:  26, r: 29, f: 1.3 },
    { x:  -34, y:  31, r: 35, f: 2.5 },
    { x:   22, y:  31, r: 33, f: 1.9 },
    { x:   76, y:  27, r: 27, f: 3.1 }
  ];

  /* Cada piscada nasce em `de`, atravessa a nuvem por dentro até `x` e, quando
     não é `soDentro`, sai por baixo como raio de `comp` de comprimento. É assim
     num temporal de verdade: a maior parte das descargas nunca sai da nuvem —
     só acende ela por dentro. */
  const PISCADAS = [
    { t:  520, de:   34, x: -102, comp: 62, semente:  3, dur: 150 },
    { t:  730, de:   34, x: -102, comp: 62, semente:  3, dur:  95 },
    { t: 1650, de: -118, x:   88, comp:  0, semente:  7, dur: 190, soDentro: true },
    { t: 2450, de:  -74, x:   66, comp: 78, semente: 11, dur: 175 },
    { t: 2690, de:  -74, x:   66, comp: 78, semente: 11, dur:  80 },
    { t: 3600, de:  126, x:  -96, comp:  0, semente: 19, dur: 160, soDentro: true },
    { t: 4250, de:   96, x:  -20, comp: 54, semente: 27, dur: 105 },
    { t: 4410, de:   96, x:  -20, comp: 54, semente: 27, dur:  65 },
    { t: 4560, de:   96, x:  -20, comp: 54, semente: 27, dur: 135 },
    { t: 5500, de:  -20, x:  108, comp:  0, semente: 33, dur: 210, soDentro: true },
    { t: 6350, de:  -60, x:  122, comp: 70, semente: 41, dur: 165 },
    { t: 7850, de:   82, x:  -56, comp: 48, semente: 55, dur: 110 },
    { t: 8030, de:   82, x:  -56, comp: 48, semente: 55, dur:  70 }
  ];

  const fract = n => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };

  /** Envelope de uma piscada: acende seco, apaga em curva. */
  function forca(t, p) {
    const d = t - p.t;
    if (d < 0 || d > p.dur) return 0;
    const f = d / p.dur;
    return f < 0.18 ? 1 : Math.pow(1 - (f - 0.18) / 0.82, 2.2);
  }

  /** Filamento que corre DENTRO da nuvem, de um ponto a outro, torto no meio. */
  function filamento(semente, ax, ay, bx, by, s = 1) {
    const pts = [[ax, ay]];
    const n = 12;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const k = semente * 23.7 + i * 4.1;
      pts.push([
        ax + (bx - ax) * t + (fract(k) - 0.5) * 26 * s,
        ay + (by - ay) * t + (fract(k + 1.7) - 0.5) * 17 * s
      ]);
    }
    pts.push([bx, by]);
    return pts;
  }

  /** Traçado quebrado do raio, sempre igual para a mesma semente. */
  function tracado(semente, x0, y0, comp, s = 1) {
    const pts = [[x0, y0]];
    let x = x0;
    for (let i = 1; i <= 5; i++) {
      const k = semente * 17.3 + i * 5.7;
      x += ((fract(k) - 0.5) * 26 + (fract(k + 2.1) - 0.5) * 10) * s;
      pts.push([x, y0 + (comp * i) / 5]);
    }
    return pts;
  }

  let ceuNo = null;      // nó único: sobrevive ao redesenho da tela

  function ceuCarregado() {
    // O nó é reaproveitado para a animação não recomeçar a cada apoio dado.
    // Só se refaz quando o tema muda, porque as cores vêm dos tokens.
    const tema = U.temaEscuro() ? "escuro" : "claro";
    if (ceuNo && ceuNo.__vivo && ceuNo.__tema === tema) return ceuNo;
    if (ceuNo) ceuNo.__vivo = false;

    const cv = h("canvas", {
      role: "img",
      "aria-label": "Animação: uma nuvem carregada respirando devagar, com raios " +
                    "piscando por baixo dela — as ideias antes de virarem projeto.",
      estilo: { display: "block", width: "100%" }
    });
    const ctx = cv.getContext("2d");

    const raiz = getComputedStyle(document.documentElement);
    const tok = (n, alt) => (raiz.getPropertyValue(n).trim() || alt);
    const C = {
      topo:   tok("--nuvem-topo", "#5F81AE"),
      base:   tok("--nuvem-base", "#1A2942"),
      ar:     tok("--nuvem-ar", "rgba(94,155,224,.16)"),
      nucleo: tok("--raio-nucleo", "#F2F8FF"),
      halo:   tok("--raio-halo", "#7FC0FF"),
      // dentro da nuvem o raio CLAREIA o vapor: no tema claro isso é branco,
      // não o azul do núcleo, senão o filamento escureceria a nuvem
      difuso: tok("--raio-difusao", "#CFE6FF"),
      nuvem:  tok("--nuvem", "#5E9BE0")
    };

    /* Geometria em pixels de CSS, recalculada a cada quadro: a nuvem mantém um
       tamanho próprio em vez de esticar junto com a largura da tela. Em telas
       largas ela fica à direita, com o texto à esquerda; em telas estreitas vai
       para o meio e o texto desce para baixo dela. */
    let G = { w: 560, h: 300, s: 1, cx: 280, cy: 120 };

    function medir() {
      const w = Math.max(280, Math.round(cv.clientWidth || 560));
      const largo = w >= 860;
      const s = Math.min(1.45, Math.max(0.82, w / 1000));
      return { w, h: largo ? 300 : 240, s, cx: largo ? w * 0.66 : w * 0.5, cy: 30 + 81 * s };
    }

    function caminhoNuvem(t) {
      const th = (2 * Math.PI * t) / DUR_CEU;
      const deriva = Math.sin(th) * 6 * G.s;
      ctx.beginPath();
      PUFFS.forEach(p => {
        const x = G.cx + (p.x + Math.sin(th + p.f) * 3.4) * G.s + deriva;
        const y = G.cy + (p.y + Math.sin(th + p.f * 1.3) * 2.2) * G.s;
        const r = p.r * G.s * (1 + Math.sin(2 * th + p.f) * 0.032);
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, 7);
      });
      return deriva;
    }

    function linha(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

    function desenharRaio(pts, a, s = 1) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = comAlfa(C.halo, 0.24 * a);   ctx.lineWidth = 11 * s;  linha(pts);
      ctx.strokeStyle = comAlfa(C.halo, 0.70 * a);   ctx.lineWidth = 4.2 * s; linha(pts);
      ctx.strokeStyle = comAlfa(C.nucleo, 0.98 * a); ctx.lineWidth = 1.7 * s; linha(pts);
    }

    /* Dentro da nuvem o raio é visto através do vapor: o brilho espalha muito
       e o fio fica mais fraco do que o do lado de fora. */
    function desenharFilamento(pts, a, s = 1) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = comAlfa(C.difuso, 0.12 * a);  ctx.lineWidth = 34 * s;  linha(pts);
      ctx.strokeStyle = comAlfa(C.difuso, 0.22 * a);  ctx.lineWidth = 16 * s;  linha(pts);
      ctx.strokeStyle = comAlfa(C.halo, 0.34 * a);    ctx.lineWidth = 6 * s;   linha(pts);
      ctx.strokeStyle = comAlfa(C.nucleo, 0.58 * a);  ctx.lineWidth = 1.2 * s; linha(pts);
    }

    /* Por onde o filamento entra e sai, para o raio externo começar exatamente
       onde o de dentro termina. */
    function pernas(p, cx, cy, s, deriva) {
      return {
        ax: cx + p.de * s + deriva, ay: cy - 26 * s,
        bx: cx + p.x * s + deriva,  by: cy + (p.soDentro ? 24 : 44) * s
      };
    }

    /* Post-its minúsculos boiando em volta: são as ideias ainda soltas, sem
       lugar. Cada um tem fase, amplitude e balanço próprios — parece aleatório,
       mas é tudo função do tempo dentro do ciclo, então o laço fecha igual.
       As cores são as das diretorias, já ajustadas ao tema. */
    const CORES_IDEIA = (() => {
      const ds = (db.dados.diretorias || []).map(d => U.corVisivel(d.cor)).filter(Boolean);
      return ds.length >= 4
        ? ds
        : ["#F6C445", "#4ED6C0", "#FF8FA3", "#7C8CF8", "#C77DFF", "#5B9BFF"];
    })();

    const POSTITS = Array.from({ length: 14 }, (_, i) => {
      const r = k => fract(i * 12.9898 + k * 78.233 + 4.7);
      return {
        bx: (r(1) - 0.5) * 2,
        by: (r(2) - 0.5) * 2,
        tam: 4.5 + r(3) * 4,
        fase: r(4) * 6.2832,
        fase2: r(5) * 6.2832,
        ampX: 14 + r(6) * 26,
        ampY: 10 + r(7) * 20,
        // pouca inclinação: muito girado vira losango, e losango não é post-it
        incl: (r(8) - 0.5) * 0.44,
        bal: 0.08 + r(9) * 0.2,
        frente: r(10) > 0.5,
        alfa: 0.34 + r(11) * 0.38,
        cor: CORES_IDEIA[Math.floor(r(12) * CORES_IDEIA.length) % CORES_IDEIA.length]
      };
    });

    function postIt(p, i, th, s, cx, cy, brilho) {
      const x = cx + (p.bx * 218 + Math.sin(th + p.fase) * p.ampX) * s;
      const y = cy + (p.by * 96 + 10 + Math.sin(2 * th + p.fase2) * p.ampY) * s;
      const ang = p.incl + Math.sin(th + p.fase2) * p.bal;
      const lado = p.tam * s * (p.frente ? 1 : 0.8);
      const m = lado / 2;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = "rgba(0,0,0,.26)";
      ctx.fillRect(-m + 0.9 * s, -m + 1.2 * s, lado, lado);
      ctx.fillStyle = comAlfa(p.cor, p.alfa);
      ctx.fillRect(-m, -m, lado, lado);
      // faixa de cola no topo: é o que faz ler como post-it, e não como confete
      ctx.fillStyle = comAlfa("#FFFFFF", p.alfa * 0.4);
      ctx.fillRect(-m, -m, lado, lado * 0.3);
      // o relâmpago bate neles também
      if (brilho > 0.02) {
        ctx.fillStyle = comAlfa(C.nucleo, 0.3 * brilho * p.alfa);
        ctx.fillRect(-m, -m, lado, lado);
      }
      ctx.restore();
    }

    function desenharCena(t) {
      const { w, h, s, cx, cy } = G;
      ctx.clearRect(0, 0, w, h);

      const th = (2 * Math.PI * t) / DUR_CEU;
      const deriva = Math.sin(th) * 6 * s;

      /* o que está aceso agora */
      let brilho = 0, focoX = cx, focoY = cy + 52 * s;
      const acesos = [];
      PISCADAS.forEach(p => {
        const a = forca(t, p);
        if (a <= 0.002) return;
        acesos.push({ p, a });
        if (a > brilho) {
          brilho = a;
          focoX = cx + ((p.de + p.x) / 2) * s + deriva;
          focoY = cy + (p.soDentro ? 4 : 40) * s;
        }
      });

      /* ar carregado em volta */
      const ar = ctx.createRadialGradient(cx, cy + 10 * s, 10, cx, cy + 10 * s, 260 * s);
      ar.addColorStop(0, C.ar);
      ar.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ar;
      ctx.fillRect(0, 0, w, h);

      if (brilho > 0.01) {
        const g = ctx.createRadialGradient(focoX, focoY, 4, focoX, focoY, 190 * s);
        g.addColorStop(0, comAlfa(C.halo, 0.30 * brilho));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      /* os post-its que passam POR TRÁS da nuvem */
      POSTITS.forEach((p, i) => { if (!p.frente) postIt(p, i, th, s, cx, cy, brilho); });

      /* halo macio da silhueta — é o que dispensa qualquer borda */
      ctx.save();
      ctx.shadowColor = comAlfa(C.base, 0.5);
      ctx.shadowBlur = 24 * s;
      ctx.shadowOffsetY = 7 * s;
      ctx.fillStyle = comAlfa(C.base, 0.92);
      caminhoNuvem(t);
      ctx.fill();
      ctx.restore();

      /* corpo: claro em cima, pesado na barriga */
      ctx.save();
      caminhoNuvem(t);
      ctx.clip();

      const corpo = ctx.createLinearGradient(0, cy - 66 * s, 0, cy + 62 * s);
      corpo.addColorStop(0, C.topo);
      corpo.addColorStop(0.46, comAlfa(C.base, 0.86));
      corpo.addColorStop(1, C.base);
      ctx.fillStyle = corpo;
      ctx.fillRect(0, 0, w, h);

      /* topos iluminados */
      [[-64, -40, 34], [-14, -50, 40], [36, -39, 34], [80, -22, 26]].forEach(([dx, dy, rr], k) => {
        const x = cx + dx * s + deriva;
        const y = cy + (dy + Math.sin(th + k) * 2) * s;
        const r = rr * s;
        const g = ctx.createRadialGradient(x, y, 1, x, y, r);
        g.addColorStop(0, comAlfa(C.topo, 0.5));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });

      /* a barriga acende por dentro quando a descarga nasce */
      if (brilho > 0.01) {
        const g = ctx.createRadialGradient(focoX, focoY - 16 * s, 2, focoX, focoY - 16 * s, 130 * s);
        g.addColorStop(0, comAlfa(C.nucleo, 0.5 * brilho));
        g.addColorStop(0.4, comAlfa(C.halo, 0.28 * brilho));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      /* O RAIO POR DENTRO — ainda dentro do recorte, então ele corre pela nuvem
         e some ao encostar na silhueta, como se estivesse mesmo lá dentro. */
      acesos.forEach(({ p, a }) => {
        const { ax, ay, bx, by } = pernas(p, cx, cy, s, deriva);
        const pts = filamento(p.semente, ax, ay, bx, by, s);
        desenharFilamento(pts, a, s);
        // ramos curtos saindo do caminho principal
        [2, 5].forEach((k, j) => {
          const o = pts[k];
          desenharFilamento([
            o,
            [o[0] + (fract(p.semente + k) - 0.5) * 52 * s, o[1] + (j ? 22 : -20) * s],
            [o[0] + (fract(p.semente + k + 3) - 0.5) * 78 * s, o[1] + (j ? 38 : -32) * s]
          ], a * 0.55, s);
        });
      });
      ctx.restore();

      /* o que sai por baixo, começando onde o filamento terminou */
      acesos.forEach(({ p, a }) => {
        if (p.soDentro || !p.comp) return;
        const { bx, by } = pernas(p, cx, cy, s, deriva);
        const pts = tracado(p.semente, bx, by, p.comp * s, s);
        desenharRaio(pts, a, s);
        // uma bifurcação curta, para não parecer um traço só
        const b = pts[2];
        desenharRaio([
          b,
          [b[0] - (13 + fract(p.semente) * 9) * s, b[1] + 15 * s],
          [b[0] - (20 + fract(p.semente + 1) * 12) * s, b[1] + 30 * s]
        ], a * 0.7, s);
      });

      /* os post-its que passam NA FRENTE */
      POSTITS.forEach((p, i) => { if (p.frente) postIt(p, i, th, s, cx, cy, brilho); });
    }

    function ajustar() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const g = medir();
      const mudou = g.w !== G.w || g.h !== G.h;
      G = g;
      const alvoW = Math.round(g.w * dpr), alvoH = Math.round(g.h * dpr);
      if (cv.width !== alvoW || cv.height !== alvoH) {
        cv.width = alvoW; cv.height = alvoH;
        cv.style.height = g.h + "px";
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return mudou;
    }

    /* Com "reduzir movimento" no sistema a cena abre parada, e o botão fica em
       destaque. A escolha é a mesma da página inicial: quem já deu play, já deu. */
    const pedeQuieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let escolha = null;
    try { escolha = localStorage.getItem("ci:animacao"); } catch (_) {}
    let rodando = escolha ? escolha === "rodando" : !pedeQuieto;

    const botao = h("button.palco-play", { type: "button" });
    function pintarBotao() {
      U.limpar(botao);
      botao.appendChild(ic(rodando ? "pausa" : "tocar"));
      botao.appendChild(h("span", rodando ? "Pausar" : "Reproduzir"));
      botao.setAttribute("aria-label", rodando ? "Pausar a animação" : "Reproduzir a animação");
      botao.classList.toggle("destaque", !rodando);
    }
    botao.addEventListener("click", () => {
      rodando = !rodando;
      try { localStorage.setItem("ci:animacao", rodando ? "rodando" : "parado"); } catch (_) {}
      pintarBotao();
    });
    pintarBotao();

    const no = h("div.ceu",
      cv, botao,
      h("div.ceu-titulo",
        h("h1", "Brainstorm"),
        h("p", "O que você faria diferente na Adecon? Projeto, ferramenta, processo, " +
               "qualquer coisa. Escreve embaixo — ideia guardada na cabeça não vira nada.")
      )
    );
    no.__vivo = true;
    no.__tema = tema;

    let tCena = 0, anterior = performance.now(), ausente = 0, precisaPintar = true;

    function quadro(agora) {
      if (!no.__vivo) return;               // trocou o tema: este laço acabou
      if (!cv.isConnected) {
        // a tela foi trocada: espera um pouco antes de desistir do laço
        if (++ausente > 420) { no.__vivo = false; return; }
        anterior = agora;
        return requestAnimationFrame(quadro);
      }
      ausente = 0;

      /* fade pela rolagem: some conforme a página sobe, sem depender de evento */
      const rolador = cv.closest(".conteudo");
      let visivel = 1;
      if (rolador) {
        const alt = no.offsetHeight || 240;
        const p = Math.min(1, Math.max(0, rolador.scrollTop / (alt * 0.8)));
        visivel = 1 - p;
        no.style.setProperty("--fade", visivel.toFixed(3));
        no.style.setProperty("--desloc", (rolador.scrollTop * 0.18).toFixed(1) + "px");
      }

      const dt = Math.min(agora - anterior, 50);
      anterior = agora;
      const redimensionou = ajustar();
      const anda = rodando && visivel > 0.02;
      if (anda) { tCena = (tCena + dt) % DUR_CEU; precisaPintar = true; }
      if (precisaPintar || redimensionou) {
        desenharCena(tCena);
        precisaPintar = anda;
      }
      requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);

    cv.__cena = desenharCena;
    ceuNo = no;
    return no;
  }

  /* ---- mural --------------------------------------------------------------- */

  function botaoRaio(i) {
    const n = apoios(i).length;
    const meu = apoiei(i);
    const b = h("button.bs-raio", {
      type: "button",
      "aria-pressed": meu ? "true" : "false",
      title: meu ? "Tirar seu apoio" : "Apoiar esta ideia",
      onclick: () => alternarApoio(i)
    }, ic("raio"), h("span", String(n)));
    return b;
  }

  function cartaoIdeia(i, destravado) {
    const tom = i.diretoria_id ? corDiretoria(i.diretoria_id) : "var(--nuvem)";
    const et = ETAPA(i.etapa);
    return h("article.bs-cartao", { estilo: { "--tom": tom } },
      h("div.bs-topo",
        chip(i.tipo || "Outro", null, tom),
        destravado ? h("span.bs-selo-etapa", { estilo: { "--tom": et.tom } }, et.nome) : null,
        botaoRaio(i)
      ),
      h("h3", i.titulo),
      i.descricao ? h("p.corpo", i.descricao) : null,
      h("div.rodape",
        h("span.autoria",
          (i.autor || "anônimo") +
          (i.diretoria_id ? " · " + (db.diretoria(i.diretoria_id)?.sigla || "") : "") +
          " · " + U.relativo(i.criado_em))
      )
    );
  }

  function painelEnvio() {
    const fTitulo = entrada({
      class: "bs-titulo", placeholder: "Em uma frase: qual é a ideia?", maxlength: 160,
      onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }
    });
    const fDesc = area({ rows: 3, placeholder: "Opcional: como funcionaria, que problema resolve, por onde começar." });
    const fTipo = selecao(TIPOS_IDEIA, { value: "Iniciativa" });
    const fDir = selecao([["", "Não sei ainda"], ...db.dados.diretorias.map(d => [d.id, d.nome])], { value: "" });
    const fAutor = entrada({ value: db.perfil?.nome && db.perfil.nome !== "Você" ? db.perfil.nome : "", placeholder: "Seu nome" });

    async function enviar() {
      const titulo = fTitulo.value.trim();
      if (!titulo) { U.aviso("Escreva a ideia primeiro.", "alerta"); fTitulo.focus(); return; }
      const autor = fAutor.value.trim();
      try {
        await db.criar("ideias", {
          titulo,
          descricao: fDesc.value.trim() || null,
          tipo: fTipo.value,
          diretoria_id: fDir.value || null,
          autor: autor || null,
          email: String(db.usuario?.email || db.perfil?.email || "").trim() || null,
          etapa: "atracao",
          ordem: ideiasDaEtapa("atracao").length,
          apoios: [],
          arquivada: false
        });
        if (autor) db.salvarPerfil({ nome: autor });
        fTitulo.value = ""; fDesc.value = "";
        U.aviso("Ideia no ar", "ok", "raio");
        fTitulo.focus();
      } catch (err) { U.aviso("Não salvou: " + err.message, "erro"); }
    }

    return h("section.painel",
      h("div.painel-hd",
        h("h2", "Solte sua ideia"),
        h("div.acoes", chip(`${ideiasVivas().length} no mural`))
      ),
      h("div.painel-bd",
        h("div.bs-envio",
          fTitulo,
          fDesc,
          h("div.linha-campos",
            campo("Isto é", fTipo),
            campo("Diretoria", fDir),
            campo("Seu nome", fAutor)
          ),
          h("div.bs-envio-pe",
            h("span.dica", "Não precisa estar pronta. Toda ideia entra em Atração e a " +
                           "equipe de inovação cuida do resto."),
            h("button.btn.btn-primario", { type: "button", onclick: enviar }, ic("tempestade"), "Publicar ideia")
          )
        )
      )
    );
  }

  function painelMural(destravado) {
    const todas = ideiasVivas();
    const tipos = ["Todos", ...TIPOS_IDEIA.filter(t => todas.some(i => i.tipo === t))];
    if (!tipos.includes(bsFiltro)) bsFiltro = "Todos";

    let lista = bsFiltro === "Todos" ? todas.slice() : todas.filter(i => i.tipo === bsFiltro);
    lista.sort(bsOrdem === "apoios"
      ? (a, b) => apoios(b).length - apoios(a).length || String(b.criado_em).localeCompare(String(a.criado_em))
      : (a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));

    const filtros = tipos.map(t => h("button.bs-filtro", {
      type: "button", "aria-pressed": bsFiltro === t ? "true" : "false",
      onclick: () => { bsFiltro = t; CI.app.recarregarVista(); }
    }, t));

    const ordenar = h("button.bs-filtro", {
      type: "button",
      onclick: () => { bsOrdem = bsOrdem === "apoios" ? "recentes" : "apoios"; CI.app.recarregarVista(); }
    }, ic(bsOrdem === "apoios" ? "raio" : "relogio"),
       bsOrdem === "apoios" ? "Mais apoiadas" : "Mais recentes");

    return h("section.painel",
      h("div.painel-hd",
        h("h2", "No ar"),
        h("div.acoes", ordenar)
      ),
      h("div.painel-bd",
        h("div.bs-filtros", { estilo: { marginBottom: "13px" } }, ...filtros),
        lista.length
          ? h("div.bs-mural", ...lista.map(i => cartaoIdeia(i, destravado)))
          : U.vazio("tempestade", "O mural está limpo",
              "A primeira ideia da empresa começa no campo aí em cima.")
      )
    );
  }

  /* ---- funil --------------------------------------------------------------- */

  async function gravarFunil(grade) {
    const mudancas = [];
    grade.querySelectorAll(".funil-faixa").forEach(faixa => {
      const etapa = faixa.dataset.etapa;
      [...faixa.querySelectorAll(".funil-cartao")].forEach((el, n) => {
        mudancas.push({ id: el.dataset.id, etapa, ordem: n });
      });
    });
    try {
      const n = await db.moverIdeias(mudancas);
      if (n) U.aviso("Funil atualizado", "ok");
    } catch (err) {
      U.aviso("Não deu para salvar: " + err.message, "erro");
    }
    CI.app.recarregarVista();
  }

  function ligarFunil(grade) {
    let cartao = null, rolador = null;

    const faixas = () => [...grade.querySelectorAll(".funil-faixa")];

    grade.addEventListener("pointerdown", ev => {
      const alca = ev.target.closest(".funil-puxador");
      if (!alca || ev.button !== 0) return;
      cartao = alca.closest(".funil-cartao");
      if (!cartao) return;
      rolador = grade.closest(".conteudo");
      cartao.classList.add("movendo");
      grade.classList.add("reordenando");
      cartao.style.pointerEvents = "none";   // libera elementFromPoint
      alca.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });

    grade.addEventListener("pointermove", ev => {
      if (!cartao) return;
      ev.preventDefault();

      const sob = document.elementFromPoint(ev.clientX, ev.clientY);
      const faixa = sob && sob.closest(".funil-faixa");
      if (faixa) {
        faixas().forEach(f => f.classList.toggle("alvo", f === faixa));
        const lista = faixa.querySelector(".funil-lista");
        const alvo = sob.closest(".funil-cartao");
        if (alvo && alvo !== cartao && alvo.parentElement === lista) {
          const meio = alvo.getBoundingClientRect().top + alvo.offsetHeight / 2;
          lista.insertBefore(cartao, ev.clientY < meio ? alvo : alvo.nextSibling);
        } else if (!alvo && cartao.parentElement !== lista) {
          lista.appendChild(cartao);
        }
      }

      if (rolador) {
        const r = rolador.getBoundingClientRect();
        if (ev.clientY < r.top + 70) rolador.scrollTop -= 14;
        else if (ev.clientY > r.bottom - 70) rolador.scrollTop += 14;
      }
    });

    const soltar = () => {
      if (!cartao) return;
      cartao.style.pointerEvents = "";
      cartao.classList.remove("movendo");
      grade.classList.remove("reordenando");
      faixas().forEach(f => f.classList.remove("alvo"));
      cartao = null;
      gravarFunil(grade);
    };

    grade.addEventListener("pointerup", soltar);
    grade.addEventListener("pointercancel", soltar);
  }

  async function moverIdeiaEtapa(i, passo) {
    const idx = ETAPAS_FUNIL.findIndex(e => e.id === (i.etapa || "atracao"));
    const alvo = ETAPAS_FUNIL[idx + passo];
    if (!alvo) return;
    try {
      await db.moverIdeias([{ id: i.id, etapa: alvo.id, ordem: ideiasDaEtapa(alvo.id).length }]);
      U.aviso(`“${i.titulo.slice(0, 28)}${i.titulo.length > 28 ? "…" : ""}” → ${alvo.nome}`, "ok");
    } catch (err) { U.aviso(err.message, "erro"); }
  }

  function cartaoFunil(i, idx) {
    const tom = i.diretoria_id ? corDiretoria(i.diretoria_id) : "var(--nuvem)";
    const nApoios = apoios(i).length;

    return h("article.funil-cartao", { dataset: { id: i.id }, estilo: { "--tom": tom } },
      h("div", { estilo: { display: "flex", alignItems: "flex-start", gap: "6px" } },
        h("span.nome", { estilo: { flex: "1 1 auto", minWidth: 0 } }, i.titulo),
        h("button.funil-puxador", {
          type: "button", "aria-label": "Arrastar para outra etapa", title: "Arraste para mover",
          onkeydown: e => {
            if (e.key === "ArrowRight") { e.preventDefault(); moverIdeiaEtapa(i, 1); }
            if (e.key === "ArrowLeft") { e.preventDefault(); moverIdeiaEtapa(i, -1); }
          }
        }, ic("arrastar"))
      ),
      h("div.acoes",
        h("span.meta",
          (i.autor || "anônimo") + (nApoios ? ` · ${nApoios} ${nApoios === 1 ? "raio" : "raios"}` : "")),
        h("span.botoes",
          h("button.btn.btn-fantasma.btn-icone.btn-p", {
            type: "button", "aria-label": "Voltar uma etapa", title: "Voltar uma etapa",
            disabled: idx === 0, onclick: () => moverIdeiaEtapa(i, -1)
          }, ic("setaEsq")),
          h("button.btn.btn-fantasma.btn-icone.btn-p", {
            type: "button", "aria-label": "Avançar uma etapa", title: "Avançar uma etapa",
            disabled: idx === ETAPAS_FUNIL.length - 1, onclick: () => moverIdeiaEtapa(i, 1)
          }, ic("setaDir")),
          idx === ETAPAS_FUNIL.length - 1
            ? h("button.btn.btn-p", {
                type: "button", title: "Abrir o formulário de projeto já preenchido",
                onclick: () => modalProjeto(null, {
                  nome: i.titulo,
                  objetivo: i.descricao || "",
                  diretoria_id: i.diretoria_id || db.dados.diretorias[0]?.id || null,
                  tipo: TIPOS.includes(i.tipo) ? i.tipo : "Projeto Interno"
                })
              }, ic("mais"), "Virar projeto")
            : null,
          h("button.btn.btn-fantasma.btn-icone.btn-p", {
            type: "button", "aria-label": "Arquivar", title: "Arquivar (sai do mural, não se perde)",
            onclick: async () => {
              try {
                await db.atualizar("ideias", i.id, { arquivada: true });
                U.aviso("Arquivada", "info");
              } catch (err) { U.aviso(err.message, "erro"); }
            }
          }, ic("caixa"))
        )
      )
    );
  }

  function painelFunil() {
    if (!funilAberto()) {
      const fSenha = entrada({
        type: "password", inputmode: "numeric", maxlength: 8, autocomplete: "off",
        "aria-label": "Senha do funil",
        onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); tentar(); } }
      });
      function tentar() {
        if (fSenha.value.trim() !== SENHA_FUNIL) {
          U.aviso("Senha incorreta.", "erro");
          fSenha.value = ""; fSenha.focus();
          return;
        }
        guardarFunil(true);
        U.aviso("Funil destravado neste navegador", "ok");
        CI.app.recarregarVista();
      }
      return h("section.painel",
        h("div.painel-hd", h("h2", "Funil de ideias"), h("div.acoes", chip("restrito"))),
        h("div.painel-bd",
          h("div.bs-tranca",
            ic("cadeado"),
            h("h3", "O funil é da equipe de inovação"),
            h("p", "Aqui as ideias passam por atração, qualificação e fechamento. " +
                   "Quem publica no mural não precisa ver esta parte — e ela fica destravada " +
                   "neste navegador depois da primeira vez."),
            h("div.bs-tranca-form",
              fSenha,
              h("button.btn.btn-primario", { type: "button", onclick: tentar }, ic("destravar"), "Destravar")
            )
          )
        )
      );
    }

    const total = ideiasVivas().length;
    const arquivadas = db.dados.ideias.filter(i => i.arquivada);

    const grade = h("div.funil", ...ETAPAS_FUNIL.map((et, idx) => {
      const daEtapa = ideiasDaEtapa(et.id);
      return h("div.funil-faixa", {
        dataset: { etapa: et.id },
        estilo: { "--tom": et.tom, "--lavagem": et.lavagem }
      },
        h("div.funil-parede"),
        h("div.funil-miolo"),
        h("div.funil-hd",
          h("span.rotulo", et.nome),
          h("span.cont", `${daEtapa.length} ${daEtapa.length === 1 ? "ideia" : "ideias"}`),
          h("span.desc", et.desc)
        ),
        h("div.funil-lista", ...daEtapa.map(i => cartaoFunil(i, idx)))
      );
    }));
    ligarFunil(grade);

    const fecham = ideiasDaEtapa("fechamento").length;
    const conv = total ? Math.round((fecham / total) * 100) : 0;

    return h("section.painel",
      h("div.painel-hd",
        h("h2", "Funil de ideias"),
        h("div.acoes",
          chip(`${conv}% chegaram ao fechamento`, conv >= 30 ? "ok" : null),
          arquivadas.length
            ? h("button.btn.btn-fantasma.btn-p", {
                type: "button",
                onclick: () => { bsArquivadas = !bsArquivadas; CI.app.recarregarVista(); }
              }, ic("caixa"), `${arquivadas.length} arquivada${arquivadas.length > 1 ? "s" : ""}`)
            : null,
          h("button.btn.btn-fantasma.btn-p", {
            type: "button", title: "Esconder o funil neste navegador",
            onclick: () => { guardarFunil(false); U.aviso("Funil trancado", "info"); CI.app.recarregarVista(); }
          }, ic("cadeado"), "Trancar")
        )
      ),
      h("div.painel-bd.sem-pad", grade),
      bsArquivadas && arquivadas.length
        ? h("div.painel-bd", { estilo: { borderTop: "1px solid var(--line-soft)" } },
            h("div.rotulo", { estilo: { marginBottom: "9px" } }, "arquivadas"),
            h("div.bs-filtros", ...arquivadas.map(i => h("button.bs-filtro", {
              type: "button", title: "Devolver ao funil, em Atração",
              onclick: async () => {
                try {
                  await db.atualizar("ideias", i.id, { arquivada: false, etapa: "atracao" });
                  U.aviso("De volta ao mural", "ok");
                } catch (err) { U.aviso(err.message, "erro"); }
              }
            }, ic("recarregar"), i.titulo.slice(0, 40)))))
        : null
    );
  }

  function vBrainstorm() {
    const destravado = funilAberto();
    return h("div.view.view-brainstorm",
      ceuCarregado(),
      painelEnvio(),
      painelMural(destravado),
      painelFunil()
    );
  }

  return {
    vInicio, vPainel, vCronograma, vProjetos, vProjeto, vDiretorias, vImplementacao,
    vIndicadores, vConfig, vBrainstorm,
    modalProjeto, modalEtapa, gavetaEtapa, buscaGlobal
  };
})();
