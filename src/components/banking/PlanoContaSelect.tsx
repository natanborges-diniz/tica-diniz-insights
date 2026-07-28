// Seletor de conta do plano de contas oficial (dre_plano_contas), agrupado por
// grupo DRE. Usado na conciliação bancária para que classificação e criação de
// lançamento sigam o padrão do DRE (natureza = grupo_dre, categoria = categoria)
// em vez de listas improvisadas — fornecedor de produto cai em CUSTO_MERCADORIA (CMV).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface PlanoConta {
  conta_numero: string;
  conta_descricao: string;
  grupo_dre: string;
  categoria: string;
}

const GRUPO_LABEL: Record<string, string> = {
  RECEITA_BRUTA: "Receita Bruta",
  DEDUCOES: "Deduções",
  CUSTO_MERCADORIA: "CMV — Custo da Mercadoria",
  DESPESAS_OPERACIONAIS: "Despesas Operacionais",
  OUTRAS_RECEITAS: "Outras Receitas",
  OUTRAS_DESPESAS: "Outras Despesas",
  INVESTIMENTOS: "Investimentos",
};

const ORDEM_GRUPOS = [
  "RECEITA_BRUTA", "DEDUCOES", "CUSTO_MERCADORIA", "DESPESAS_OPERACIONAIS",
  "OUTRAS_RECEITAS", "OUTRAS_DESPESAS", "INVESTIMENTOS",
];

export function usePlanoContas() {
  return useQuery<PlanoConta[]>({
    queryKey: ["dre-plano-contas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_plano_contas")
        .select("conta_numero, conta_descricao, grupo_dre, categoria")
        .eq("ativo", true)
        .order("conta_numero");
      if (error) throw error;
      return (data ?? []) as PlanoConta[];
    },
  });
}

interface Props {
  value: string | null; // conta_numero
  onChange: (conta: PlanoConta) => void;
  placeholder?: string;
  className?: string;
  /** Restringe aos grupos informados (ex.: só despesas para linhas de débito) */
  grupos?: string[];
}

export function PlanoContaSelect({ value, onChange, placeholder = "Selecionar conta", className, grupos }: Props) {
  const { data: contas = [] } = usePlanoContas();

  const visiveis = grupos ? contas.filter((c) => grupos.includes(c.grupo_dre)) : contas;
  const porGrupo = ORDEM_GRUPOS
    .map((g) => ({ grupo: g, contas: visiveis.filter((c) => c.grupo_dre === g) }))
    .filter((g) => g.contas.length > 0);

  return (
    <Select
      value={value ?? ""}
      onValueChange={(numero) => {
        const conta = contas.find((c) => c.conta_numero === numero);
        if (conta) onChange(conta);
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {porGrupo.map(({ grupo, contas: cs }) => (
          <SelectGroup key={grupo}>
            <SelectLabel>{GRUPO_LABEL[grupo] ?? grupo}</SelectLabel>
            {cs.map((c) => (
              <SelectItem key={c.conta_numero} value={c.conta_numero}>
                {c.conta_numero} · {c.conta_descricao}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
