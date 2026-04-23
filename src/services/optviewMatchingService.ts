import { supabase } from "@/integrations/supabase/client";
import { OptviewModeloAro, OptviewProduto, OptviewServico, OptviewTipoArmacao } from "./optviewService";

export type OptviewMappingKind = "PRODUTO" | "SERVICO" | "TIPO_ARMACAO" | "MODELO_ARO";

export interface OptviewMatchCandidate<T> {
  item: T;
  score: number;
  source: "depara" | "match";
}

function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenScore(source: string, target: string): number {
  const a = new Set(normalizeText(source).split(" ").filter(Boolean));
  const b = new Set(normalizeText(target).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach((t) => {
    if (b.has(t)) common += 1;
  });
  return Math.round((common / Math.max(a.size, 1)) * 100);
}

async function loadDepara(fornecedor: string, descricaoLocal: string, kind: OptviewMappingKind) {
  const key = `${kind}:${descricaoLocal}`;
  const { data } = await supabase
    .from("fornecedor_produto_depara")
    .select("*")
    .eq("fornecedor", fornecedor)
    .eq("descricao_local", key)
    .maybeSingle();
  return data;
}

async function saveDepara(
  fornecedor: string,
  descricaoLocal: string,
  kind: OptviewMappingKind,
  skuFornecedor: string,
  nomeFornecedor: string,
) {
  const key = `${kind}:${descricaoLocal}`;
  await supabase.from("fornecedor_produto_depara").upsert(
    {
      fornecedor,
      descricao_local: key,
      sku_fornecedor: skuFornecedor,
      nome_fornecedor: nomeFornecedor,
    },
    { onConflict: "fornecedor,descricao_local" },
  );
}

function rankItems<T>(description: string, items: T[], textResolver: (item: T) => string): OptviewMatchCandidate<T>[] {
  return items
    .map((item) => ({ item, score: tokenScore(description, textResolver(item)), source: "match" as const }))
    .filter((candidate) => candidate.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export async function matchOptviewProduto(produtos: OptviewProduto[], descricao: string): Promise<OptviewMatchCandidate<OptviewProduto>[]> {
  const depara = await loadDepara("OPTVIEW", descricao, "PRODUTO");
  if (depara?.sku_fornecedor) {
    const matched = produtos.find((p) => p.codigo_produto === depara.sku_fornecedor);
    if (matched) {
      return [{ item: matched, score: 100, source: "depara" }];
    }
  }
  return rankItems(descricao, produtos, (p) => `${p.nome_produto} ${p.material || ""} ${p.desenho || ""}`);
}

export async function matchOptviewServico(servicos: OptviewServico[], descricao: string): Promise<OptviewMatchCandidate<OptviewServico>[]> {
  const depara = await loadDepara("OPTVIEW", descricao, "SERVICO");
  if (depara?.sku_fornecedor) {
    const matched = servicos.find((s) => s.codigo_servico === depara.sku_fornecedor);
    if (matched) {
      return [{ item: matched, score: 100, source: "depara" }];
    }
  }
  return rankItems(descricao, servicos, (s) => `${s.nome_servico} ${s.categoria_servico || ""}`);
}

export async function matchOptviewTipoArmacao(items: OptviewTipoArmacao[], descricao: string): Promise<OptviewMatchCandidate<OptviewTipoArmacao>[]> {
  const depara = await loadDepara("OPTVIEW", descricao, "TIPO_ARMACAO");
  if (depara?.sku_fornecedor) {
    const matched = items.find((s) => s.codigo_tipo_armacao === depara.sku_fornecedor);
    if (matched) {
      return [{ item: matched, score: 100, source: "depara" }];
    }
  }
  return rankItems(descricao, items, (s) => s.nome_tipo_armacao);
}

export async function matchOptviewModeloAro(items: OptviewModeloAro[], descricao: string): Promise<OptviewMatchCandidate<OptviewModeloAro>[]> {
  const depara = await loadDepara("OPTVIEW", descricao, "MODELO_ARO");
  if (depara?.sku_fornecedor) {
    const matched = items.find((s) => s.codigo_modelo_aro === depara.sku_fornecedor);
    if (matched) {
      return [{ item: matched, score: 100, source: "depara" }];
    }
  }
  return rankItems(descricao, items, (s) => s.nome_modelo_aro);
}

export async function saveOptviewProdutoDepara(descricao: string, item: OptviewProduto) {
  await saveDepara("OPTVIEW", descricao, "PRODUTO", item.codigo_produto, item.nome_produto);
}

export async function saveOptviewServicoDepara(descricao: string, item: OptviewServico) {
  await saveDepara("OPTVIEW", descricao, "SERVICO", item.codigo_servico, item.nome_servico);
}

export async function saveOptviewTipoArmacaoDepara(descricao: string, item: OptviewTipoArmacao) {
  await saveDepara("OPTVIEW", descricao, "TIPO_ARMACAO", item.codigo_tipo_armacao, item.nome_tipo_armacao);
}

export async function saveOptviewModeloAroDepara(descricao: string, item: OptviewModeloAro) {
  await saveDepara("OPTVIEW", descricao, "MODELO_ARO", item.codigo_modelo_aro, item.nome_modelo_aro);
}