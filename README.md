# Central de Inovação — Adecon

Painel web para calendarizar e acompanhar os projetos internos da empresa júnior.
Substitui a planilha: mesmas informações (diretorias, projetos, etapas, prazos,
observações, indicadores), só que interativo, multiusuário e com aviso por e-mail.

**Pilha:** HTML/CSS/JS puro (sem build) · GitHub Pages (hospedagem) ·
Supabase (banco, login e tempo real) · Resend (e-mails automáticos).

---

## Como funciona em duas velocidades

| | Modo local | Com Supabase |
|---|---|---|
| Onde ficam os dados | só no seu navegador | banco Postgres da empresa |
| Quem enxerga | você | todo mundo que tiver login |
| Tempo real | — | sim, muda na tela de todos |
| E-mails automáticos | — | sim, pelo Resend |
| Precisa configurar | nada | 15 minutos, uma vez |

Abrir o `index.html` já funciona: o painel carrega os dados da planilha como exemplo.
Assim você testa tudo antes de ligar o banco.

---

## Passo 1 — Colocar no ar (GitHub Pages)

1. Crie um repositório novo no GitHub, por exemplo `central-inovacao`.
2. Suba todos os arquivos desta pasta (arrastar para o navegador funciona:
   **Add file → Upload files**).
3. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Pronto. A cada `push` na branch `main` o site é republicado em
   `https://SEU-USUARIO.github.io/central-inovacao/`.

O workflow está em `.github/workflows/deploy.yml`.

---

## Passo 2 — Ligar o banco (Supabase)

### 2.1 Criar o projeto

1. Em [supabase.com](https://supabase.com) → **New project**.
   Região **South America (São Paulo)** deixa o painel mais rápido no Brasil.
2. Guarde a senha do banco.

### 2.2 Criar as tabelas

**SQL Editor → New query** → cole o conteúdo de `supabase/schema.sql` → **Run**.

Isso cria tabelas, views, políticas de segurança (RLS), tempo real, os gatilhos que
enfileiram e-mails e já insere as oito diretorias.
Rodar o arquivo mais de uma vez é seguro.

### 2.3 Pegar as chaves

**Settings → API**:

- `Project URL` → algo como `https://xxxxxxxx.supabase.co`
- `anon public` → a chave que começa com `eyJ...`

> A chave anon é pública por natureza — ela vai no navegador de qualquer jeito.
> Quem protege os dados são as políticas de RLS criadas pelo `schema.sql`:
> sem login, ninguém lê nem escreve nada.

### 2.4 Conectar

Duas formas, escolha uma:

**A. Pelo próprio painel (mais rápido).**
Abra o site → **Conexão** no menu → cole a URL e a chave → **Salvar e conectar**.
Fica gravado naquele navegador.

**B. Pelo GitHub (vale para todo mundo).**
Repositório → **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | `https://xxxxxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` |

O deploy grava o `assets/js/config.js` sozinho a cada publicação.

### 2.5 Liberar o login

**Authentication → URL Configuration**:

- *Site URL*: `https://SEU-USUARIO.github.io/central-inovacao/`
- *Redirect URLs*: a mesma URL.

O painel entra por link mágico no e-mail (ou senha, se você criar contas manualmente
em **Authentication → Users**).

### 2.6 Levar os dados da planilha para o banco

No modo local, **Conexão → Exportar JSON**. Depois conecte o Supabase, entre com seu
e-mail e use **Importar JSON**: os registros são enviados para o banco.

---

## Passo 3 — E-mails automáticos (Resend)

### 3.1 Conta e domínio

1. Crie a conta em [resend.com](https://resend.com).
2. **Domains → Add domain** com o domínio da Adecon e configure os registros DNS
   (SPF, DKIM). Sem domínio próprio dá para testar com `onboarding@resend.dev`,
   mas só chega no seu próprio e-mail.
3. **API Keys → Create** → guarde a chave `re_...`.

### 3.2 Publicar as Edge Functions

Com a [CLI do Supabase](https://supabase.com/docs/guides/cli) instalada:

```bash
supabase login
supabase link --project-ref SEU-PROJECT-REF
supabase functions deploy enviar-notificacoes
supabase functions deploy lembretes-prazos
```

Sem a CLI: **Edge Functions → Create function** no painel do Supabase e cole o
conteúdo de cada `index.ts` (o arquivo `_shared/email.ts` vai junto, no mesmo caminho).

### 3.3 Secrets das funções

**Edge Functions → Secrets** (ou `supabase secrets set`):

| Nome | Exemplo |
|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxxxxxx` |
| `EMAIL_REMETENTE` | `Central de Inovação <central@adecon.com.br>` |
| `URL_APP` | `https://SEU-USUARIO.github.io/central-inovacao` |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem por padrão.

### 3.4 Agendar

**Database → Extensions**: habilite `pg_cron` e `pg_net`.
Depois volte ao **SQL Editor**, abra o `schema.sql` na seção 7, tire os `--` do
bloco de agendamento, troque `SEU-PROJETO` e `SUA-SERVICE-ROLE-KEY` e rode.

Isso liga dois relógios:

- a cada 2 minutos, esvazia a fila de e-mails;
- **às 13h30 de Brasília, todos os dias**, procura prazos chegando.

O Brasil não tem mais horário de verão, então Brasília é UTC−3 o ano todo e o cron
fica em `30 16 * * *`.

### 3.5 O que é enviado

| Evento | Quando | Quem recebe |
|---|---|---|
| Etapa ganha responsável (ou muda de data) | na hora | responsável da etapa |
| Alguém comenta numa etapa | na hora | responsável da etapa |
| Prazo de uma etapa chegando | 7, 3 e 1 dia antes, às 13h30 | responsável **e** inscritos |
| Término de um projeto chegando | 7, 3 e 1 dia antes, às 13h30 | responsável **e** inscritos |
| Etapa vencida | todo dia às 13h30 | só o responsável |

Para testar sem esperar o relógio: **Conexão → Enviar fila de e-mails agora**.

### 3.6 Cada membro cadastra o próprio e-mail

Na Central, em **Conexão → Avisos por e-mail**, a pessoa põe nome e e-mail e escolhe o que
acompanhar: *todos os projetos internos* (inclusive os criados depois) ou projeto por
projeto. No console de cada projeto há o botão **Receber avisos**, que inscreve com um
clique e mostra quantas pessoas já acompanham aquele projeto.

Ninguém precisa ser administrador para isso — só abrir a Central. As inscrições ficam na
tabela `inscricoes`, e um índice parcial impede a mesma pessoa de se inscrever duas vezes
no mesmo projeto. O aviso de etapa vencida continua indo só para o responsável, para não
encher a caixa de quem apenas acompanha.

---

## O que dá para fazer no painel

- **Início** — a abertura do painel. As oito diretorias giram devagar num anel visto de
  perfil, ligadas ao núcleo da Central; a cada 2,5 s uma conexão se acende entre duas delas
  e um pulso percorre o traçado, representando uma ação tocada em conjunto. Volta completa
  em 20 s. É canvas desenhado à mão (`assets/js/views.js`, função `palcoAnimado`): sem
  biblioteca, sem arquivo de vídeo, e cada quadro é calculado a partir do tempo, então o
  laço fecha sem emenda. As cores são as das diretorias e a profundidade vem do anel —
  quem está atrás aparece menor e mais apagado. Para mudar quais conexões acendem e em que
  ordem, edite a lista `LIGACOES`. Há um botão de reproduzir/pausar no canto; se o sistema
  estiver com "reduzir movimento" ligado, a cena abre parada e o botão fica em destaque.
- **Painel** — indicadores do ciclo, carteira de projetos, próximas entregas e
  as conversas mais recentes.
- **Cronograma** — as 60 semanas do ano em grade. Arraste a barra para deslocar
  o projeto; puxe as bordas para reprogramar início ou término. Duplo clique abre
  a edição. A parte escura da barra é o percentual de etapas concluídas.
- **Projetos** — cartões com filtro por diretoria, tipo e prioridade.
- **Console do projeto** — a ficha (objetivo, equipe, metodologia, datas) ao lado da
  trilha de etapas. Clique no número para concluir; arraste pela alça de pontinhos à esquerda para reordenar (a numeração se reajusta sozinha, e as setas do teclado funcionam na alça); clique na etapa para abrir a gaveta
  com responsável, prazo, observação da execução, anotações de reunião, arquivo e a
  conversa. `Ctrl+Enter` envia o comentário.
- **Diretorias** — o quadro de cinco colunas de cada diretoria
  (iniciativas, projetos internos, pontos de atenção, processos, ferramentas). As colunas
  são montadas a partir dos projetos e das implementações de verdade, então nada precisa
  ser cadastrado duas vezes. O botão "Adicionar" de cada coluna já abre o formulário certo,
  com a diretoria preenchida.
- **Implementação** — ferramentas e processos com status; é a base do TIP.
- **Indicadores** — TIP, ISD e Inovação, com lançamento das notas de satisfação.
- **Conexão** — chaves, perfil, exportar/importar JSON e CSV, e o cadastro de
  **avisos por e-mail** (7, 3 e 1 dia antes do prazo, às 13h30).

Atalhos: `/` ou `Ctrl+K` abrem a busca, `Esc` fecha gaveta e modal.

---

## Estrutura

```
index.html                    página principal (GitHub Pages)
artifact.html                 mesma página sem <head>, para publicar como artefato
assets/css/app.css            todo o visual, em tokens de tema
assets/js/config.js           chaves e preferências (o Actions reescreve)
assets/js/seed.js             dados da planilha, usados no modo local
assets/js/db.js               camada de dados: local ou Supabase, mesma interface
assets/js/ui.js               DOM, ícones, avisos, modal, gaveta, datas
assets/js/views.js            as telas
assets/js/app.js              casca, navegação e arranque
supabase/schema.sql           tabelas, views, RLS, gatilhos, agendamentos
supabase/functions/           Edge Functions (Resend)
.github/workflows/deploy.yml  publicação automática
```

## Ações que valem para mais de uma diretoria

Um mesmo projeto interno, ferramenta ou processo costuma ser tocado por várias diretorias
— o HACKADECON, por exemplo, envolve todas. O sistema resolve isso sem duplicar registro:

- cada ação tem uma **diretoria responsável** (`diretoria_id`) e uma lista de **diretorias
  participantes** (`diretorias_apoio`), escolhidas por clique no formulário;
- ela aparece no quadro de **todas** as diretorias envolvidas — nas que apoiam vem marcada
  como *apoio*, dizendo quem lidera, com as siglas das demais ao lado;
- no banco continua sendo **uma linha**, então **TIP, ISD e Inovação nunca a contam duas
  vezes**. O denominador do TIP é o número de ferramentas e processos, não o de
  participações.

Onde a contagem é por participação, isso está dito na tela: em "Carga por diretoria", no
Painel, a soma das barras é maior que o total de ações, e o texto abaixo explica por quê.

No SQL, a view `vw_participacao` devolve uma linha por (ação, diretoria envolvida) para
montar quadros. Para contar, use sempre as tabelas de origem.

## A contagem de diretorias

A Presidência e as Diretorias em Conexão funcionam como qualquer outra diretoria — têm
quadro, pergunta norteadora, cor, recebem ações. Mas não entram quando o número é o
assunto: o contador do menu e o número na página inicial mostram **6**, não 8.

Isso é um dado, não uma regra no código: a coluna `conta_no_total` da tabela `diretorias`.
Para mudar, basta um `update` — ou inverter o valor de qualquer outra diretoria.

## Modelo de dados

```
diretorias ─┬─ projetos ── etapas ── comentarios
            │    └── diretorias_apoio[]  (participação, sem duplicar a ação)
            │    └── inscricoes          (quem quer ser avisado do prazo)
            ├─ itens_diretoria      (o quadro de 5 colunas)
            ├─ implementacoes       (TIP)
            └─ avaliacoes           (ISD)
perfis · notificacoes (fila de e-mail)
```

Os indicadores da planilha viraram a view `vw_indicadores`:

- **TIP** = implementados ÷ propostos, em `implementacoes`
- **ISD** = soma das notas ÷ soma das notas máximas, em `avaliacoes`
- **Inovação** = projetos internos concluídos ÷ projetos internos definidos

## Personalizar

- **Cores e tipografia** — bloco `:root` no início do `assets/css/app.css`.
  Tudo sai dali, inclusive o tema claro.
- **Nome da empresa e ano do ciclo** — `assets/js/config.js`.
- **Cor de cada diretoria** — coluna `cor` da tabela `diretorias`.
- **Texto dos e-mails** — função `copy()` em `supabase/functions/_shared/email.ts`.

## Quando algo não funciona

| Sintoma | Causa provável |
|---|---|
| Fica em "Modo local" mesmo com as chaves | URL sem `https://` ou chave incompleta. Confira em **Conexão**. |
| "Conectando…" e o portão de login não sai | e-mail ainda não confirmado, ou a URL não está em *Redirect URLs*. |
| Login funciona mas nada aparece | o `schema.sql` não rodou até o fim — rode de novo. |
| Não chega e-mail | `RESEND_API_KEY` ausente, domínio não verificado, ou a etapa está sem e-mail do responsável. Veja **Edge Functions → Logs**. |
| Erro ao apagar um projeto | por padrão só `admin` e `gestor` apagam projetos. Mude o `papel` na tabela `perfis`. |

---

Dados de exemplo transcritos da planilha *Central de Inovação*.
Ciclo de referência: 2027.
