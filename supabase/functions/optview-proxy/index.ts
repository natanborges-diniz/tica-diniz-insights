import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

const OPTVIEW_ERROR_CODES = {
  TIMEOUT: "OPTVIEW_TIMEOUT",
  UNAVAILABLE: "OPTVIEW_UNAVAILABLE",
  API_ERROR: "OPTVIEW_API_ERROR",
  CONFIG_ERROR: "OPTVIEW_CONFIG_ERROR",
} as const;

type SbClient = ReturnType<typeof createClient>;

function correlationId() {
  return crypto.randomUUID().slice(0, 8);
}

function escapeXml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(String(value).replace(",", "."));
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(2).replace(".", ",");
}

async function loadRuntimeConfig(sb: SbClient) {
  const { data } = await sb
    .from("fornecedor_configuracao")
    .select("ambiente, base_url_staging, base_url_production")
    .eq("fornecedor", "OPTVIEW")
    .eq("ativo", true)
    .maybeSingle();

  const ambiente = data?.ambiente || "staging";
  const baseUrl = ambiente === "production" ? data?.base_url_production : data?.base_url_staging;
  return { ambiente, baseUrl: baseUrl || null };
}

async function loadStoreConfig(sb: SbClient, codEmpresa: number) {
  const { data } = await sb
    .from("optview_empresa_config")
    .select("alias, codigo_cadastral_optview, login_site, senha_site, login_restrito")
    .eq("cod_empresa", codEmpresa)
    .eq("ativo", true)
    .maybeSingle();
  return data;
}

function buildXml(pedido: Record<string, any>, store: Record<string, any>) {
  const r = pedido.receita || {};
  const servicos = Array.isArray(pedido.servicos) ? pedido.servicos : [];

  const serviceItems = servicos.map((item: Record<string, unknown>) => `
      <ITEM>
        <FK_PRODUTO>${escapeXml(String(item.codigo || ""))}</FK_PRODUTO>
        <NR_QUANTIDADE>${escapeXml(String(item.quantidade || 1))}</NR_QUANTIDADE>
      </ITEM>`).join("");

  return `<LISTA_PEDIDO>
  <PEDIDO>
    <NR_SEUPEDIDO>${escapeXml(pedido.numeroOs)}</NR_SEUPEDIDO>
    <CD_CODIGOCADASTRAL>${escapeXml(pedido.codigoCadastral || store.codigo_cadastral_optview)}</CD_CODIGOCADASTRAL>
    <DS_OBSERVACAO>${escapeXml(pedido.observacao)}</DS_OBSERVACAO>
    <DS_LOGIN>${escapeXml(pedido.loginSite || store.login_site)}</DS_LOGIN>
    <DS_SENHASITE>${escapeXml(pedido.senhaSite || store.senha_site)}</DS_SENHASITE>
    <DS_LOGINRESTRITO>${escapeXml(pedido.loginRestrito || store.login_restrito)}</DS_LOGINRESTRITO>
    <RECEITA>
      <DS_NOMEPACIENTE>${escapeXml(pedido.paciente)}</DS_NOMEPACIENTE>
      <NR_ESFLONGEOD>${escapeXml(formatNumber(r.esfericoLongeOd))}</NR_ESFLONGEOD>
      <NR_ESFLONGEOE>${escapeXml(formatNumber(r.esfericoLongeOe))}</NR_ESFLONGEOE>
      <NR_CILOD>${escapeXml(formatNumber(r.cilindricoOd))}</NR_CILOD>
      <NR_CILOE>${escapeXml(formatNumber(r.cilindricoOe))}</NR_CILOE>
      <NR_ALTURAOD>${escapeXml(formatNumber(r.alturaOd))}</NR_ALTURAOD>
      <NR_ALTURAOE>${escapeXml(formatNumber(r.alturaOe))}</NR_ALTURAOE>
      <NR_EIXOOD>${escapeXml(r.eixoOd)}</NR_EIXOOD>
      <NR_EIXOOE>${escapeXml(r.eixoOe)}</NR_EIXOOE>
      <NR_DNPOD>${escapeXml(formatNumber(r.dnpOd))}</NR_DNPOD>
      <NR_DNPOE>${escapeXml(formatNumber(r.dnpOe))}</NR_DNPOE>
      <NR_DIAMETROOD>${escapeXml(formatNumber(r.diametroOd))}</NR_DIAMETROOD>
      <NR_DIAMETROOE>${escapeXml(formatNumber(r.diametroOe))}</NR_DIAMETROOE>
      <NR_ADICAOOD>${escapeXml(formatNumber(r.adicaoOd))}</NR_ADICAOOD>
      <NR_ADICAOOE>${escapeXml(formatNumber(r.adicaoOe))}</NR_ADICAOOE>
      <NR_PRISMAOD>${escapeXml(formatNumber(r.prismaOd))}</NR_PRISMAOD>
      <NR_PRISMAOE>${escapeXml(formatNumber(r.prismaOe))}</NR_PRISMAOE>
      <NR_ESFERAODP>${escapeXml(formatNumber(r.esfericoPertoOd))}</NR_ESFERAODP>
      <NR_ESFERAOEP>${escapeXml(formatNumber(r.esfericoPertoOe))}</NR_ESFERAOEP>
      <NR_DNPODP>${escapeXml(formatNumber(r.dnpPertoOd))}</NR_DNPODP>
      <NR_DNPOEP>${escapeXml(formatNumber(r.dnpPertoOe))}</NR_DNPOEP>
      <NR_CILODP>${escapeXml(formatNumber(r.cilindricoPertoOd))}</NR_CILODP>
      <NR_CILOEP>${escapeXml(formatNumber(r.cilindricoPertoOe))}</NR_CILOEP>
      <NR_EIXOODP>${escapeXml(r.eixoPertoOd)}</NR_EIXOODP>
      <NR_EIXOOEP>${escapeXml(r.eixoPertoOe)}</NR_EIXOOEP>
      <NR_PRISMAODP>${escapeXml(formatNumber(r.prismaPertoOd))}</NR_PRISMAODP>
      <NR_PRISMAOEP>${escapeXml(formatNumber(r.prismaPertoOe))}</NR_PRISMAOEP>
      <NR_CURVABASE>${escapeXml(formatNumber(r.curvaBase))}</NR_CURVABASE>
      <NR_DIAMETRO>${escapeXml(formatNumber(r.diametroArmacao))}</NR_DIAMETRO>
      <NR_DPA>${escapeXml(formatNumber(r.dpa))}</NR_DPA>
      <NR_DMA>${escapeXml(formatNumber(r.diagonalMaior))}</NR_DMA>
      <NR_MVA>${escapeXml(formatNumber(r.medidaVerticalAro))}</NR_MVA>
      <NR_MHA>${escapeXml(formatNumber(r.medidaHorizontalAro))}</NR_MHA>
      <FK_ARMACAO>${escapeXml(r.codigoTipoArmacao)}</FK_ARMACAO>
      <NR_PONTE>${escapeXml(formatNumber(r.ponte))}</NR_PONTE>
      <FK_ARO>${escapeXml(r.codigoModeloAro)}</FK_ARO>
      <TG_ENVARO>${r.enviarArmacao ? "S" : "N"}</TG_ENVARO>
      <NR_ANGPANTOSCOPICOOD>${escapeXml(formatNumber(r.anguloPantoscopicoOd))}</NR_ANGPANTOSCOPICOOD>
      <NR_ANGPANTOSCOPICOOE>${escapeXml(formatNumber(r.anguloPantoscopicoOe))}</NR_ANGPANTOSCOPICOOE>
      <NR_DISTANCIAVERTICEOD>${escapeXml(formatNumber(r.distanciaVerticeOd))}</NR_DISTANCIAVERTICEOD>
      <NR_DISTANCIAVERTICEOE>${escapeXml(formatNumber(r.distanciaVerticeOe))}</NR_DISTANCIAVERTICEOE>
      <NR_ZTILTCURVATURAOD>${escapeXml(formatNumber(r.curvaturaOd))}</NR_ZTILTCURVATURAOD>
      <NR_ZTILTCURVATURAOE>${escapeXml(formatNumber(r.curvaturaOe))}</NR_ZTILTCURVATURAOE>
      <FK_PRODUTOOD>${escapeXml(r.codigoProdutoOd)}</FK_PRODUTOOD>
      <FK_PRODUTOOE>${escapeXml(r.codigoProdutoOe)}</FK_PRODUTOOE>
      <TRACER><DS_LEITURA>${escapeXml(r.tracerBase64)}</DS_LEITURA></TRACER>
    </RECEITA>
    <SERVICOS>${serviceItems}</SERVICOS>
  </PEDIDO>
</LISTA_PEDIDO>`;
}

function buildSoapEnvelope(xml: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <INSERIRPEDIDO xmlns="http://tempuri.org/">
      <cXML><![CDATA[${xml}]]></cXML>
    </INSERIRPEDIDO>
  </soap:Body>
</soap:Envelope>`;
}

function parseSoapResponse(text: string) {
  const orderMatch = text.match(/<nrpedido>(.*?)<\/nrpedido>/i) || text.match(/<numeroPedido>(.*?)<\/numeroPedido>/i);
  const msgMatch = text.match(/<mensagem>(.*?)<\/mensagem>/i) || text.match(/<string[^>]*>(.*?)<\/string>/i);
  return {
    numeroPedido: orderMatch?.[1] || null,
    message: msgMatch?.[1] || null,
    raw: text,
  };
}

async function fetchSoap(url: string, body: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "INSERIRPEDIDO",
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const cid = correlationId();

  try {
    const { action, ...params } = await req.json();
    const user = await authGuard(req, { requiredRole: "authenticated" });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    switch (action) {
      case "criar-pedido": {
        const codEmpresa = Number(params.codEmpresa);
        const codOs = Number(params.codOs);
        const store = await loadStoreConfig(sb, codEmpresa);
        const runtime = await loadRuntimeConfig(sb);
        if (!store || !runtime.baseUrl) {
          return new Response(JSON.stringify({ error: "Configuração OptView incompleta", code: OPTVIEW_ERROR_CODES.CONFIG_ERROR, correlationId: cid }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const pedido = params.pedido as Record<string, any>;
        const xml = buildXml(pedido, store as Record<string, any>);
        const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ codEmpresa, codOs, xml, ambiente: runtime.ambiente })));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
        const idempotencyKey = `OPTVIEW_${codEmpresa}_${codOs}_${runtime.ambiente}_${hashHex}`;

        const { data: existing } = await sb.from("pedidos_fornecedor").select("*").eq("idempotency_key", idempotencyKey).neq("status", "ERRO").maybeSingle();
        if (existing) {
          return new Response(JSON.stringify({ numeroPedido: existing.numero_pedido, status: existing.status || "CONFIRMADO", idempotencyHit: true, message: "Pedido já enviado para esta OS/empresa/ambiente." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const soapBody = buildSoapEnvelope(xml);
        const resp = await fetchSoap(runtime.baseUrl, soapBody);
        const respText = await resp.text();
        const parsed = parseSoapResponse(respText);

        await sb.from("pedidos_fornecedor").insert({
          cod_os: codOs,
          cod_empresa: codEmpresa,
          fornecedor: "OPTVIEW",
          numero_pedido: parsed.numeroPedido,
          status: parsed.numeroPedido ? "CONFIRMADO" : "PENDENTE",
          payload: { xml, pedido },
          response: parsed,
          requested_by: user.userId,
          hoya_environment: runtime.ambiente,
          idempotency_key: idempotencyKey,
        });

        if (!resp.ok) {
          return new Response(JSON.stringify({ error: parsed.message || `HTTP ${resp.status}`, code: OPTVIEW_ERROR_CODES.API_ERROR, correlationId: cid }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ numeroPedido: parsed.numeroPedido, status: parsed.numeroPedido ? "CONFIRMADO" : "PENDENTE", message: parsed.message, raw: parsed.raw, correlationId: cid }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "historico-pedidos": {
        let query = sb.from("pedidos_fornecedor").select("*").eq("fornecedor", "OPTVIEW").order("created_at", { ascending: false }).limit(Number(params.limit || 50));
        if (params.codEmpresa && params.codEmpresa !== "ALL") query = query.eq("cod_empresa", Number(params.codEmpresa));
        const { data, error } = await query;
        if (error) throw error;
        return new Response(JSON.stringify(data || []), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "timeline-pedido": {
        const { data, error } = await sb.from("pedido_status_history").select("*").eq("pedido_fornecedor_id", params.pedidoFornecedorId).order("checked_at", { ascending: true });
        if (error) throw error;
        return new Response(JSON.stringify(data || []), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[optview-proxy]", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err), code: OPTVIEW_ERROR_CODES.UNAVAILABLE, correlationId: cid }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});