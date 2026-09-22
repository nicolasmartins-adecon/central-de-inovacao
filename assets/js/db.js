/* =============================================================================
   CAMADA DE DADOS
   Um único contrato (criar / atualizar / excluir / carregar) com dois motores:
     · local     — tudo no navegador. Roda sem servidor, serve de demonstração.
     · supabase  — Postgres real, multiusuário, com realtime e e-mails.
   As telas não sabem qual dos dois está ativo.
   ========================================================================== */

window.CI = window.CI || {};

CI.db = (function () {
  const CHAVE_DADOS   = "ci:dados:v2";
  const CHAVE_CONEXAO = "ci:conexao:v1";
  const CHAVE_PERFIL  = "ci:perfil:v1";

  const TABELAS = [
    "diretorias", "projetos", "etapas", "comentarios",
    "itens_diretoria", "implementacoes", "avaliacoes", "inscricoes"
  ];

  /* ---- armazenamento local tolerante a falha -------------------------- */
  const cofre = {
    ler(chave, alt) {
      try {
        const v = localStorage.getItem(chave);
        return v ? JSON.parse(v) : alt;
      } catch (_) { return alt; }
    },
    gravar(chave, valor) {
      try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
      catch (_) { return false; }
    },
    apagar(chave) { try { localStorage.removeItem(chave); } catch (_) {} }
  };

  function uid(prefixo) {
    const r = (crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)));
    return prefixo ? prefixo + "-" + r.slice(0, 8) : r;
  }

  function copiaSeed() {
    return JSON.parse(JSON.stringify(window.CI_SEED || {}));
  }

  function vazio() {
    const o = {};
    TABELAS.forEach(t => (o[t] = []));
    return o;
  }

  /* ---- estado ---------------------------------------------------------- */
  const api = {
    motor: "local",                 // "local" | "supabase"
    estado: "local",                // "local" | "conectando" | "online" | "erro"
    mensagemEstado: "Modo local",
    usuario: null,
    perfil: cofre.ler(CHAVE_PERFIL, { nome: "Você", email: "" }),
    dados: vazio(),
    sb: null,
    ouvintes: new Set()
  };

  api.assinar = function (fn) { api.ouvintes.add(fn); return () => api.ouvintes.delete(fn); };
  api.emitir = function () { api.ouvintes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); };

  /* ---- configuração de conexão ----------------------------------------- */
  api.conexaoConfigurada = function () {
    const c = api.conexao();
    return Boolean(c.url && c.chave);
  };

  api.conexao = function () {
    const salvo = cofre.ler(CHAVE_CONEXAO, null);
    const cfg = window.CI_CONFIG || {};
    return {
      url:   (salvo?.url   || cfg.SUPABASE_URL      || "").trim().replace(/\/$/, ""),
      chave: (salvo?.chave || cfg.SUPABASE_ANON_KEY || "").trim(),
      origem: salvo?.url ? "navegador" : (cfg.SUPABASE_URL ? "arquivo de configuração" : "nenhuma")
    };
  };

  api.salvarConexao = function (url, chave) {
    if (!url && !chave) { cofre.apagar(CHAVE_CONEXAO); return; }
    cofre.gravar(CHAVE_CONEXAO, { url: String(url || "").trim().replace(/\/$/, ""), chave: String(chave || "").trim() });
  };

  api.salvarPerfil = function (p) {
    api.perfil = Object.assign({}, api.perfil, p);
    cofre.gravar(CHAVE_PERFIL, api.perfil);
    api.emitir();
  };

  function baseFuncoes() {
    const cfg = window.CI_CONFIG || {};
    if (cfg.URL_FUNCOES) return cfg.URL_FUNCOES.replace(/\/$/, "");
    return api.conexao().url + "/functions/v1";
  }

  /* ---- inicialização ---------------------------------------------------- */
  api.iniciar = async function () {
    if (api.conexaoConfigurada() && window.supabase?.createClient) {
      api.estado = "conectando";
      api.mensagemEstado = "Conectando…";
      api.emitir();
      try {
        const { url, chave } = api.conexao();
        api.sb = window.supabase.createClient(url, chave, {
          auth: { persistSession: true, autoRefreshToken: true }
        });
        const { data } = await api.sb.auth.getSession();
        api.usuario = data?.session?.user ?? null;
        api.motor = "supabase";

        api.sb.auth.onAuthStateChange((_evt, sessao) => {
          api.usuario = sessao?.user ?? null;
          if (api.usuario) {
            api.perfil = Object.assign({}, api.perfil, {
              email: api.usuario.email,
              nome: api.usuario.user_metadata?.nome || api.perfil.nome || api.usuario.email.split("@")[0]
            });
            carregarSupabase().then(() => api.emitir());
          }
          api.emitir();
        });

        if (api.usuario) {
          await carregarSupabase();
          ligarRealtime();
          api.estado = "online";
          api.mensagemEstado = "Supabase conectado";
        } else {
          api.estado = "conectando";
          api.mensagemEstado = "Aguardando entrada";
        }
        api.emitir();
        return;
      } catch (e) {
        console.error("Supabase:", e);
        api.estado = "erro";
        api.mensagemEstado = "Falha ao conectar";
      }
    }

    // modo local
    api.motor = "local";
    api.estado = api.estado === "erro" ? "erro" : "local";
    if (api.estado === "local") api.mensagemEstado = "Modo local";
    const salvo = cofre.ler(CHAVE_DADOS, null);
    api.dados = salvo && salvo.projetos ? Object.assign(vazio(), salvo) : Object.assign(vazio(), copiaSeed());
    migrarDados();
    persistirLocal();
    api.emitir();
  };

  /* Cores e estrutura são definição do sistema, não dado do usuário: quando
     mudam no seed, atualizamos o que já estiver gravado neste navegador. */
  const VERSAO_DADOS = 4;
  function migrarDados() {
    if (api.dados.__versaoCores === VERSAO_DADOS) return;
    const seed = copiaSeed();

    // v2 — cores de marca das diretorias
    const cores = new Map((seed.diretorias || []).map(d => [d.id, d.cor]));
    (api.dados.diretorias || []).forEach(d => { if (cores.has(d.id)) d.cor = cores.get(d.id); });
    (api.dados.projetos || []).forEach(p => { p.cor = ""; });

    // v3 — ações que pertencem a mais de uma diretoria
    ["projetos", "implementacoes"].forEach(tabela => {
      const apoio = new Map((seed[tabela] || []).map(r => [r.id, r.diretorias_apoio || []]));
      (api.dados[tabela] || []).forEach(r => {
        if (!Array.isArray(r.diretorias_apoio)) r.diretorias_apoio = apoio.get(r.id) || [];
      });
    });

    // v4 — quais diretorias entram na contagem
    const conta = new Map((seed.diretorias || []).map(d => [d.id, d.conta_no_total !== false]));
    (api.dados.diretorias || []).forEach(d => {
      if (conta.has(d.id)) d.conta_no_total = conta.get(d.id);
    });

    api.dados.__versaoCores = VERSAO_DADOS;
  }

  function persistirLocal() {
    if (api.motor === "local") cofre.gravar(CHAVE_DADOS, api.dados);
  }

  api.restaurarExemplo = function () {
    api.dados = Object.assign(vazio(), copiaSeed());
    api.dados.__versaoCores = VERSAO_DADOS;
    persistirLocal();
    api.emitir();
  };

  api.limparTudo = function () {
    api.dados = vazio();
    persistirLocal();
    api.emitir();
  };

  /* ---- carga do Supabase ------------------------------------------------ */
  async function carregarSupabase() {
    const novo = vazio();
    for (const t of TABELAS) {
      const { data, error } = await api.sb.from(t).select("*");
      if (error) { console.warn("Leitura de", t, error.message); continue; }
      novo[t] = data || [];
    }
    api.dados = novo;
  }

  api.recarregar = async function () {
    if (api.motor === "supabase" && api.usuario) {
      await carregarSupabase();
      api.emitir();
    }
  };

  function ligarRealtime() {
    try {
      const canal = api.sb.channel("central-inovacao");
      ["projetos", "etapas", "comentarios", "itens_diretoria", "implementacoes"].forEach(tabela => {
        canal.on("postgres_changes", { event: "*", schema: "public", table: tabela }, payload => {
          aplicarMudanca(tabela, payload);
          api.emitir();
        });
      });
      canal.subscribe();
    } catch (e) { console.warn("Realtime indisponível:", e); }
  }

  function aplicarMudanca(tabela, payload) {
    const lista = api.dados[tabela] || (api.dados[tabela] = []);
    const { eventType, new: novo, old: velho } = payload;
    if (eventType === "INSERT") {
      if (!lista.some(r => r.id === novo.id)) lista.push(novo);
    } else if (eventType === "UPDATE") {
      const i = lista.findIndex(r => r.id === novo.id);
      if (i >= 0) lista[i] = novo; else lista.push(novo);
    } else if (eventType === "DELETE") {
      const i = lista.findIndex(r => r.id === velho.id);
      if (i >= 0) lista.splice(i, 1);
    }
  }

  /* ---- CRUD ------------------------------------------------------------- */

  api.criar = async function (tabela, registro) {
    const linha = Object.assign({ id: uid(tabela.slice(0, 3)), criado_em: new Date().toISOString() }, registro);

    if (api.motor === "supabase") {
      const envio = Object.assign({}, registro);
      delete envio.id;
      const { data, error } = await api.sb.from(tabela).insert(envio).select().single();
      if (error) throw new Error(error.message);
      const lista = api.dados[tabela] || (api.dados[tabela] = []);
      if (!lista.some(r => r.id === data.id)) lista.push(data);
      api.emitir();
      return data;
    }

    (api.dados[tabela] || (api.dados[tabela] = [])).push(linha);
    persistirLocal();
    api.emitir();
    return linha;
  };

  api.atualizar = async function (tabela, id, mudancas) {
    const lista = api.dados[tabela] || [];
    const i = lista.findIndex(r => r.id === id);

    if (api.motor === "supabase") {
      const anterior = i >= 0 ? Object.assign({}, lista[i]) : null;
      if (i >= 0) lista[i] = Object.assign({}, lista[i], mudancas);   // otimista
      api.emitir();
      const { data, error } = await api.sb.from(tabela).update(mudancas).eq("id", id).select().single();
      if (error) {
        if (i >= 0 && anterior) lista[i] = anterior;                  // desfaz
        api.emitir();
        throw new Error(error.message);
      }
      if (i >= 0) lista[i] = data;
      api.emitir();
      return data;
    }

    if (i < 0) return null;
    lista[i] = Object.assign({}, lista[i], mudancas);
    persistirLocal();
    api.emitir();
    return lista[i];
  };

  api.excluir = async function (tabela, id) {
    const lista = api.dados[tabela] || [];
    const i = lista.findIndex(r => r.id === id);
    const removido = i >= 0 ? lista[i] : null;
    if (i >= 0) lista.splice(i, 1);

    // remove filhos no modo local (no Supabase o ON DELETE CASCADE cuida disso)
    if (api.motor === "local") {
      if (tabela === "projetos") {
        const etapasFora = api.dados.etapas.filter(e => e.projeto_id === id).map(e => e.id);
        api.dados.etapas = api.dados.etapas.filter(e => e.projeto_id !== id);
        api.dados.comentarios = api.dados.comentarios.filter(c => !etapasFora.includes(c.etapa_id));
      }
      if (tabela === "etapas") {
        api.dados.comentarios = api.dados.comentarios.filter(c => c.etapa_id !== id);
      }
      persistirLocal();
      api.emitir();
      return removido;
    }

    api.emitir();
    const { error } = await api.sb.from(tabela).delete().eq("id", id);
    if (error) {
      if (removido) lista.splice(i, 0, removido);
      api.emitir();
      throw new Error(error.message);
    }
    return removido;
  };

  /**
   * Grava a nova sequência das etapas de um projeto.
   * `ids` é a lista COMPLETA das etapas na ordem desejada. Renumera 1..N para
   * que o número mostrado na trilha (e citado nos e-mails) siga a ordem real.
   * Não toca em responsável nem em data, então não dispara notificação.
   */
  api.reordenarEtapas = async function (projetoId, ids) {
    const mudancas = [];
    ids.forEach((id, i) => {
      const e = api.dados.etapas.find(x => x.id === id && x.projeto_id === projetoId);
      if (!e) return;
      if (e.ordem !== i || Number(e.numero) !== i + 1) mudancas.push({ id, ordem: i, numero: i + 1 });
    });
    if (!mudancas.length) return 0;

    const antes = mudancas.map(m => {
      const e = api.dados.etapas.find(x => x.id === m.id);
      return { id: m.id, ordem: e.ordem, numero: e.numero };
    });
    const aplicar = lista => lista.forEach(m => {
      const e = api.dados.etapas.find(x => x.id === m.id);
      if (e) { e.ordem = m.ordem; e.numero = m.numero; }
    });

    aplicar(mudancas);              // otimista: a tela responde na hora
    persistirLocal();
    api.emitir();

    if (api.motor === "supabase") {
      try {
        for (const m of mudancas) {
          const { error } = await api.sb.from("etapas")
            .update({ ordem: m.ordem, numero: m.numero }).eq("id", m.id);
          if (error) throw new Error(error.message);
        }
      } catch (e) {
        aplicar(antes);             // desfaz se o banco recusar
        api.emitir();
        throw e;
      }
    }
    return mudancas.length;
  };

  /* ---- autenticação ----------------------------------------------------- */

  api.entrarComLink = async function (email) {
    if (api.motor !== "supabase") throw new Error("Conecte o Supabase primeiro.");
    const { error } = await api.sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.href.split("#")[0] }
    });
    if (error) throw new Error(error.message);
  };

  api.entrarComSenha = async function (email, senha) {
    if (api.motor !== "supabase") throw new Error("Conecte o Supabase primeiro.");
    const { error } = await api.sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(error.message);
  };

  api.criarConta = async function (email, senha, nome) {
    if (api.motor !== "supabase") throw new Error("Conecte o Supabase primeiro.");
    const { error } = await api.sb.auth.signUp({
      email, password: senha,
      options: { data: { nome }, emailRedirectTo: location.href.split("#")[0] }
    });
    if (error) throw new Error(error.message);
  };

  api.sair = async function () {
    if (api.sb) await api.sb.auth.signOut();
    api.usuario = null;
    api.emitir();
  };

  /* ---- e-mails (Resend via Edge Function) -------------------------------- */

  /** Pede à Edge Function que esvazie a fila agora, sem esperar o cron. */
  api.dispararEmails = async function () {
    if (api.motor !== "supabase") return { pulado: true };
    if (!(window.CI_CONFIG || {}).DISPARAR_EMAIL_NA_HORA) return { pulado: true };
    try {
      const sessao = (await api.sb.auth.getSession()).data?.session;
      const r = await fetch(baseFuncoes() + "/enviar-notificacoes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + (sessao?.access_token || api.conexao().chave)
        },
        body: "{}"
      });
      return await r.json().catch(() => ({ ok: r.ok }));
    } catch (e) {
      console.warn("Envio imediato falhou; o agendamento cobre.", e);
      return { erro: String(e) };
    }
  };

  /* ---- consultas de conveniência ---------------------------------------- */

  api.projeto = id => api.dados.projetos.find(p => p.id === id) || null;
  api.diretoria = id => api.dados.diretorias.find(d => d.id === id) || null;

  api.etapasDe = id => api.dados.etapas
    .filter(e => e.projeto_id === id)
    .sort((a, b) => (a.ordem ?? a.numero ?? 0) - (b.ordem ?? b.numero ?? 0) || Number(a.numero) - Number(b.numero));

  api.comentariosDe = id => api.dados.comentarios
    .filter(c => c.etapa_id === id)
    .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));

  api.uid = uid;
  api.TABELAS = TABELAS;

  return api;
})();
