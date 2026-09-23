/* Configuração da Central de Inovação.
   A chave publishable (ou anon) é pública por natureza: quem protege
   os dados é o RLS do banco. A chave SECRET nunca entra aqui. */

window.CI_CONFIG = {
  SUPABASE_URL: "https://ljtczccbwbxbbwnnokix.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_LZ4BH5Fdpd2zn5KM_ECGXg_Vcwj6V7A",

  /* Base das Edge Functions. Em branco = <SUPABASE_URL>/functions/v1 */
  URL_FUNCOES: "",

  /* Envia o e-mail na hora do comentário / atribuição, sem esperar o cron. */
  DISPARAR_EMAIL_NA_HORA: true,

  EMPRESA: "Adecon",
  ANO_CICLO: 2027
};
