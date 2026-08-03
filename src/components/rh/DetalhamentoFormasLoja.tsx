// src/components/rh/DetalhamentoFormasLoja.tsx
// Detalhamento com SUBTOTAIS EXPANDÍVEIS (Natan, 2026-08-03):
//   forma de pagamento (agregada, sem bandeira) → operações (venda/NF/OS).
//   O "A RECEBER (não pago)" entra como grupo junto, com o mesmo detalhamento.
//   Cada linha de forma traz nº de operações, base, comissão e a quebra por
//   natureza (recebido no ato × pagamento de saldo × parcelas de crediário).
import { useMemo, useState, Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ResultadoVendedor, DetalheLinha } from "@/lib/comissoes/motorComissao";
import type { SaldoAberto } from "@/services/fechamentoService";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

const LABEL_FORMA: Record<string, string> = {
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  PIX: "PIX",
  AVISTA: "Dinheiro / à vista",
  CHEQUE: "Cheque",
  CREDIARIO: "Crediário / boleto",
  CONVENIO: "Convênio",
  CREDITOS: "Créditos de cliente",
  OUTROS: "Outros",
  SALDO_A_RECEBER: "Saldo a receber",
};

const LABEL_NATUREZA: Record<string, string> = {
  ATO: "no ato",
  QUITACAO_SALDO: "pgto. de saldo",
  CREDIARIO: "parcela crediário",
};

const ORDEM_FORMA = [
  "CARTAO_CREDITO", "CARTAO_DEBITO", "PIX", "AVISTA", "CHEQUE",
  "CREDIARIO", "CONVENIO", "OUTROS", "CREDITOS",
];

interface OperacaoLinha extends DetalheLinha {
  vendedorNome: string | null;
}

interface GrupoForma {
  forma: string;
  operacoes: OperacaoLinha[];
  valor: number;
  comissao: number;
  porNatureza: Record<string, number>;
}

interface Props {
  /** consolidado (já filtrado pelo recorte da tela) */
  vendedores: ResultadoVendedor[];
  /** parcelas em aberto do mesmo recorte */
  saldosAbertos: SaldoAberto[];
  titulo?: string;
}

export function DetalhamentoFormasLoja({ vendedores, saldosAbertos, titulo }: Props) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const { grupos, totRecebido, totComissao, gruposAberto, totAberto } = useMemo(() => {
    const mapa = new Map<string, GrupoForma>();
    for (const v of vendedores) {
      for (const d of v.detalhe) {
        const forma = (d.formaCategoria || "OUTROS").trim();
        let g = mapa.get(forma);
        if (!g) {
          g = { forma, operacoes: [], valor: 0, comissao: 0, porNatureza: {} };
          mapa.set(forma, g);
        }
        g.operacoes.push({ ...d, vendedorNome: v.vendedorNome ?? `Vendedor ${v.codVendedor}` });
        g.valor += d.valor;
        g.comissao += d.comissao;
        const nat = (d.natureza || (d.origem === "SALDO_ANTERIOR" ? "QUITACAO_SALDO" : "ATO")).trim();
        g.porNatureza[nat] = (g.porNatureza[nat] || 0) + d.valor;
      }
    }
    const grupos = Array.from(mapa.values()).sort(
      (a, b) => ORDEM_FORMA.indexOf(a.forma) - ORDEM_FORMA.indexOf(b.forma)
    );
    const totRecebido = grupos.filter((g) => g.forma !== "CREDITOS").reduce((s, g) => s + g.valor, 0);
    const totComissao = grupos.reduce((s, g) => s + g.comissao, 0);

    // A RECEBER (não pago): subtotal por forma da parcela em aberto
    const mapaAberto = new Map<string, { forma: string; parcelas: SaldoAberto[]; valor: number }>();
    for (const sa of saldosAbertos) {
      const forma = (sa.formaCategoria || "OUTROS").trim();
      let g = mapaAberto.get(forma);
      if (!g) {
        g = { forma, parcelas: [], valor: 0 };
        mapaAberto.set(forma, g);
      }
      g.parcelas.push(sa);
      g.valor += sa.valorAberto;
    }
    const gruposAberto = Array.from(mapaAberto.values()).sort((a, b) => b.valor - a.valor);
    const totAberto = gruposAberto.reduce((s, g) => s + g.valor, 0);

    return { grupos, totRecebido, totComissao, gruposAberto, totAberto };
  }, [vendedores, saldosAbertos]);

  if (!grupos.length && !gruposAberto.length) return null;

  const toggle = (k: string) => {
    const novo = new Set(abertos);
    if (novo.has(k)) novo.delete(k);
    else novo.add(k);
    setAbertos(novo);
  };

  return (
    <div className="rounded-lg border p-3 space-y-1">
      <p className="text-sm font-medium">
        {titulo ?? "Detalhamento por forma de pagamento"}
        <span className="text-xs text-muted-foreground font-normal">
          {" "}— clique na linha para expandir as operações (venda / NF / OS)
        </span>
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-6" />
            <TableHead>Forma de pagamento</TableHead>
            <TableHead>Composição</TableHead>
            <TableHead className="text-right">Operações</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">Comissão</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupos.map((g) => {
            const aberto = abertos.has(g.forma);
            const ehCredito = g.forma === "CREDITOS";
            return (
              <Fragment key={g.forma}>
                <TableRow
                  className={`cursor-pointer hover:bg-muted/50 ${ehCredito ? "opacity-60" : ""}`}
                  onClick={() => toggle(g.forma)}
                >
                  <TableCell className="py-1">
                    {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell className="font-medium">
                    {LABEL_FORMA[g.forma] ?? g.forma}
                    {ehCredito && (
                      <span className="text-xs text-muted-foreground"> (fora da meta e da comissão)</span>
                    )}
                  </TableCell>
                  <TableCell className="space-x-1">
                    {Object.entries(g.porNatureza).map(([nat, v]) => (
                      <Badge key={nat} variant="outline" className="text-[10px] font-normal">
                        {LABEL_NATUREZA[nat] ?? nat.toLowerCase()}: R$ {fmtBRL(v)}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell className="text-right">{g.operacoes.length}</TableCell>
                  <TableCell className="text-right font-medium">R$ {fmtBRL(g.valor)}</TableCell>
                  <TableCell className="text-right">{ehCredito ? "—" : `R$ ${fmtBRL(g.comissao)}`}</TableCell>
                </TableRow>
                {aberto && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/30 p-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Vendedor</TableHead>
                            <TableHead className="text-xs">Venda</TableHead>
                            <TableHead className="text-xs">NF</TableHead>
                            <TableHead className="text-xs">OS</TableHead>
                            <TableHead className="text-xs">Emissão</TableHead>
                            <TableHead className="text-xs">Pagto.</TableHead>
                            <TableHead className="text-xs">Natureza</TableHead>
                            <TableHead className="text-xs text-right">Valor</TableHead>
                            <TableHead className="text-xs text-right">Comissão</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...g.operacoes]
                            .sort((a, b) => (a.dataPagamento < b.dataPagamento ? -1 : 1))
                            .map((op, i) => (
                              <TableRow key={i} className="text-xs">
                                <TableCell className="py-1">{op.vendedorNome}</TableCell>
                                <TableCell className="py-1">{op.numeroVenda ?? op.codTransacao}</TableCell>
                                <TableCell className="py-1">{op.numeroNf ?? "—"}</TableCell>
                                <TableCell className="py-1">{op.osList ?? "—"}</TableCell>
                                <TableCell className="py-1">{fmtData(op.dataEmissao)}</TableCell>
                                <TableCell className="py-1">{fmtData(op.dataPagamento)}</TableCell>
                                <TableCell className="py-1">
                                  {LABEL_NATUREZA[(op.natureza ?? "").trim()] ??
                                    (op.origem === "SALDO_ANTERIOR" ? "pgto. de saldo" : "no ato")}
                                  {op.origem === "SALDO_ANTERIOR" && (
                                    <span className="text-muted-foreground"> (venda de mês ant.)</span>
                                  )}
                                </TableCell>
                                <TableCell className="py-1 text-right">R$ {fmtBRL(op.valor)}</TableCell>
                                <TableCell className="py-1 text-right">
                                  {g.forma === "CREDITOS" ? "—" : `R$ ${fmtBRL(op.comissao)} (${op.taxa}%)`}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}

          {/* -------- A RECEBER (não pago) -------- */}
          {gruposAberto.map((g) => {
            const chave = `aberto-${g.forma}`;
            const aberto = abertos.has(chave);
            return (
              <Fragment key={chave}>
                <TableRow
                  className="cursor-pointer hover:bg-amber-50/60 bg-amber-50/30"
                  onClick={() => toggle(chave)}
                >
                  <TableCell className="py-1">
                    {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell className="font-medium text-amber-800">
                    A receber (não pago) — {LABEL_FORMA[g.forma] ?? g.forma}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-normal border-amber-300 text-amber-800">
                      só comissiona quando o cliente pagar
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{g.parcelas.length}</TableCell>
                  <TableCell className="text-right font-medium text-amber-800">R$ {fmtBRL(g.valor)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                </TableRow>
                {aberto && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-amber-50/40 p-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Vendedor</TableHead>
                            <TableHead className="text-xs">Venda</TableHead>
                            <TableHead className="text-xs">NF</TableHead>
                            <TableHead className="text-xs">OS</TableHead>
                            <TableHead className="text-xs">Emissão</TableHead>
                            <TableHead className="text-xs">Vencimento</TableHead>
                            <TableHead className="text-xs text-right">Valor em aberto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...g.parcelas]
                            .sort((a, b) => ((a.dataVencimento ?? "") < (b.dataVencimento ?? "") ? -1 : 1))
                            .map((sa, i) => (
                              <TableRow key={i} className="text-xs">
                                <TableCell className="py-1">{sa.vendedorNome ?? sa.codVendedor}</TableCell>
                                <TableCell className="py-1">{sa.numeroVenda ?? sa.codTransacao}</TableCell>
                                <TableCell className="py-1">{sa.numeroNf ?? "—"}</TableCell>
                                <TableCell className="py-1">{sa.osList ?? "—"}</TableCell>
                                <TableCell className="py-1">{fmtData(sa.dataEmissao)}</TableCell>
                                <TableCell className="py-1">{fmtData(sa.dataVencimento)}</TableCell>
                                <TableCell className="py-1 text-right">R$ {fmtBRL(sa.valorAberto)}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}

          {/* -------- TOTAL -------- */}
          <TableRow className="font-semibold border-t-2">
            <TableCell />
            <TableCell>TOTAL</TableCell>
            <TableCell className="text-xs text-muted-foreground font-normal">
              recebido (base) + a receber{totAberto > 0 ? ` R$ ${fmtBRL(totAberto)}` : ""}
            </TableCell>
            <TableCell className="text-right">
              {grupos.reduce((s, g) => s + g.operacoes.length, 0) +
                gruposAberto.reduce((s, g) => s + g.parcelas.length, 0)}
            </TableCell>
            <TableCell className="text-right">R$ {fmtBRL(totRecebido + totAberto)}</TableCell>
            <TableCell className="text-right">R$ {fmtBRL(totComissao)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
