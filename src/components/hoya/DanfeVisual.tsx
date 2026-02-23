// src/components/hoya/DanfeVisual.tsx
// Renderiza uma visualização simplificada da DANFE a partir do XML da NF-e

import React, { useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

interface DanfeData {
  chaveAcesso: string;
  nNF: string;
  serie: string;
  dhEmi: string;
  natOp: string;
  emitente: {
    nome: string;
    fantasia: string;
    cnpj: string;
    ie: string;
    endereco: string;
    fone: string;
  };
  destinatario: {
    nome: string;
    cnpj: string;
    ie: string;
    endereco: string;
    email: string;
  };
  entrega?: {
    nome: string;
    endereco: string;
  };
  produtos: {
    item: string;
    codigo: string;
    descricao: string;
    ncm: string;
    cfop: string;
    un: string;
    qtd: string;
    vUnit: string;
    vTotal: string;
  }[];
  totais: {
    vProd: string;
    vNF: string;
    vICMS: string;
    vIPI: string;
    vFrete: string;
    vDesc: string;
  };
  transporte: {
    nome: string;
    cnpj: string;
    frete: string;
    volumes: string;
    especie: string;
    pesoB: string;
    pesoL: string;
  };
  pagamento: {
    tipo: string;
    valor: string;
  };
  infAdic: string;
  os: string;
}

function getText(el: Element | null, tag: string): string {
  if (!el) return "";
  const node = el.getElementsByTagName(tag)[0];
  return node?.textContent?.trim() || "";
}

function parseNFeXml(xmlString: string): DanfeData | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");
    const nfe = doc.getElementsByTagName("infNFe")[0];
    if (!nfe) return null;

    const chaveAcesso = (nfe.getAttribute("Id") || "").replace("NFe", "");
    const ide = nfe.getElementsByTagName("ide")[0];
    const emit = nfe.getElementsByTagName("emit")[0];
    const dest = nfe.getElementsByTagName("dest")[0];
    const entregaEl = nfe.getElementsByTagName("entrega")[0];
    const total = nfe.getElementsByTagName("ICMSTot")[0];
    const transp = nfe.getElementsByTagName("transp")[0];
    const pagEl = nfe.getElementsByTagName("detPag")[0];
    const infAdic = nfe.getElementsByTagName("infAdic")[0];

    const emitEnder = emit?.getElementsByTagName("enderEmit")[0];
    const destEnder = dest?.getElementsByTagName("enderDest")[0];

    const fmtEnder = (el: Element | null) => {
      if (!el) return "";
      const parts = [
        getText(el, "xLgr"),
        getText(el, "nro"),
        getText(el, "xCpl"),
        getText(el, "xBairro"),
        getText(el, "xMun") + "/" + getText(el, "UF"),
        getText(el, "CEP")?.replace(/(\d{5})(\d{3})/, "$1-$2"),
      ].filter(Boolean);
      return parts.join(", ");
    };

    const fmtCnpj = (cnpj: string) => {
      if (cnpj.length === 14) {
        return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
      }
      return cnpj;
    };

    const fmtFone = (fone: string) => {
      if (!fone) return "";
      const d = fone.replace(/\D/g, "");
      if (d.length >= 10) return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
      return fone;
    };

    // Parse produtos
    const detEls = nfe.getElementsByTagName("det");
    const produtos = Array.from(detEls).map((det) => {
      const prod = det.getElementsByTagName("prod")[0];
      return {
        item: det.getAttribute("nItem") || "",
        codigo: getText(prod, "cProd"),
        descricao: getText(prod, "xProd"),
        ncm: getText(prod, "NCM"),
        cfop: getText(prod, "CFOP"),
        un: getText(prod, "uCom"),
        qtd: getText(prod, "qCom"),
        vUnit: getText(prod, "vUnCom"),
        vTotal: getText(prod, "vProd"),
      };
    });

    // Extract OS from infCpl
    const infCpl = getText(infAdic, "infCpl");
    const osMatch = infCpl.match(/OS[:\s]*(\d+)/i);

    const transporta = transp?.getElementsByTagName("transporta")[0];
    const vol = transp?.getElementsByTagName("vol")[0];

    const modFrete = getText(transp, "modFrete");
    const freteMap: Record<string, string> = {
      "0": "CIF (Emitente)",
      "1": "FOB (Destinatário)",
      "2": "Terceiros",
      "9": "Sem frete",
    };

    return {
      chaveAcesso,
      nNF: getText(ide, "nNF"),
      serie: getText(ide, "serie"),
      dhEmi: getText(ide, "dhEmi"),
      natOp: getText(ide, "natOp"),
      emitente: {
        nome: getText(emit, "xNome"),
        fantasia: getText(emit, "xFant"),
        cnpj: fmtCnpj(getText(emit, "CNPJ")),
        ie: getText(emit, "IE"),
        endereco: fmtEnder(emitEnder),
        fone: fmtFone(getText(emitEnder, "fone")),
      },
      destinatario: {
        nome: getText(dest, "xNome"),
        cnpj: fmtCnpj(getText(dest, "CNPJ")),
        ie: getText(dest, "IE"),
        endereco: fmtEnder(destEnder),
        email: getText(dest, "email"),
      },
      entrega: entregaEl ? {
        nome: getText(entregaEl, "xNome"),
        endereco: fmtEnder(entregaEl),
      } : undefined,
      produtos,
      totais: {
        vProd: getText(total, "vProd"),
        vNF: getText(total, "vNF"),
        vICMS: getText(total, "vICMS"),
        vIPI: getText(total, "vIPI"),
        vFrete: getText(total, "vFrete"),
        vDesc: getText(total, "vDesc"),
      },
      transporte: {
        nome: getText(transporta, "xNome"),
        cnpj: fmtCnpj(getText(transporta, "CNPJ")),
        frete: freteMap[modFrete] || modFrete,
        volumes: getText(vol, "qVol"),
        especie: getText(vol, "esp"),
        pesoB: getText(vol, "pesoB"),
        pesoL: getText(vol, "pesoL"),
      },
      pagamento: {
        tipo: getText(pagEl, "xPag") || getText(pagEl, "tPag"),
        valor: getText(pagEl, "vPag"),
      },
      infAdic: infCpl,
      os: osMatch?.[1] || "",
    };
  } catch {
    return null;
  }
}

function fmtMoney(v: string) {
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return d;
  }
}

function fmtChave(chave: string) {
  // Format: XXXX XXXX XXXX ... (groups of 4)
  return chave.replace(/(.{4})/g, "$1 ").trim();
}

// ====== SECTION COMPONENTS ======

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="bg-muted px-3 py-1.5 rounded-t-md border border-b-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
    </div>
    <div className="border rounded-b-md p-3 text-xs space-y-1">
      {children}
    </div>
  </div>
);

const Field: React.FC<{ label: string; value: string; mono?: boolean; className?: string }> = ({ label, value, mono, className }) => (
  <div className={className}>
    <span className="text-muted-foreground text-[10px] block">{label}</span>
    <span className={mono ? "font-mono" : ""}>{value || "—"}</span>
  </div>
);

// ====== MAIN COMPONENT ======

interface DanfeVisualProps {
  xmlContent: string;
}

const DanfeVisual: React.FC<DanfeVisualProps> = ({ xmlContent }) => {
  const data = useMemo(() => parseNFeXml(xmlContent), [xmlContent]);

  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Não foi possível parsear o XML da NF-e.</p>
        <pre className="text-xs mt-4 bg-muted p-4 rounded max-h-60 overflow-auto text-left whitespace-pre-wrap font-mono">
          {xmlContent.slice(0, 500)}...
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-bold text-base">DANFE</h2>
            <p className="text-[10px] text-muted-foreground">Documento Auxiliar da Nota Fiscal Eletrônica</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-lg font-mono">NF-e {data.nNF}</p>
          <p className="text-muted-foreground">Série {data.serie}</p>
        </div>
      </div>

      {/* Chave de Acesso */}
      <div className="bg-muted rounded-md p-2 text-center">
        <p className="text-[10px] text-muted-foreground mb-0.5">CHAVE DE ACESSO</p>
        <p className="font-mono text-[11px] font-bold tracking-wider">{fmtChave(data.chaveAcesso)}</p>
      </div>

      {/* Natureza + Emissão */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Natureza da Operação" value={data.natOp} className="col-span-2" />
        <Field label="Data de Emissão" value={fmtDate(data.dhEmi)} />
      </div>

      <Separator />

      {/* Emitente */}
      <Section title="Emitente">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Field label="Razão Social" value={data.emitente.nome} className="col-span-2" />
          <Field label="Nome Fantasia" value={data.emitente.fantasia} />
          <Field label="CNPJ" value={data.emitente.cnpj} mono />
          <Field label="IE" value={data.emitente.ie} mono />
          <Field label="Telefone" value={data.emitente.fone} />
          <Field label="Endereço" value={data.emitente.endereco} className="col-span-2" />
        </div>
      </Section>

      {/* Destinatário */}
      <Section title="Destinatário">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Field label="Razão Social" value={data.destinatario.nome} className="col-span-2" />
          <Field label="CNPJ" value={data.destinatario.cnpj} mono />
          <Field label="IE" value={data.destinatario.ie} mono />
          <Field label="Endereço" value={data.destinatario.endereco} className="col-span-2" />
          {data.destinatario.email && <Field label="E-mail" value={data.destinatario.email} className="col-span-2" />}
        </div>
      </Section>

      {/* Entrega (se diferente) */}
      {data.entrega && (
        <Section title="Local de Entrega">
          <div className="grid grid-cols-1 gap-y-2">
            <Field label="Nome" value={data.entrega.nome} />
            <Field label="Endereço" value={data.entrega.endereco} />
          </div>
        </Section>
      )}

      {/* Produtos */}
      <Section title="Produtos / Serviços">
        <div className="overflow-x-auto -mx-3 px-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Código</th>
                <th className="py-1 pr-2">Descrição</th>
                <th className="py-1 pr-2">NCM</th>
                <th className="py-1 pr-2">CFOP</th>
                <th className="py-1 pr-2">UN</th>
                <th className="py-1 pr-2 text-right">Qtd</th>
                <th className="py-1 pr-2 text-right">V. Unit</th>
                <th className="py-1 text-right">V. Total</th>
              </tr>
            </thead>
            <tbody>
              {data.produtos.map((p, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 text-muted-foreground">{p.item}</td>
                  <td className="py-1.5 pr-2 font-mono">{p.codigo}</td>
                  <td className="py-1.5 pr-2 font-medium">{p.descricao}</td>
                  <td className="py-1.5 pr-2 font-mono">{p.ncm}</td>
                  <td className="py-1.5 pr-2 font-mono">{p.cfop}</td>
                  <td className="py-1.5 pr-2">{p.un}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{p.qtd}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{fmtMoney(p.vUnit)}</td>
                  <td className="py-1.5 text-right font-mono font-medium">{fmtMoney(p.vTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Totais */}
      <Section title="Totais">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          <Field label="Valor Produtos" value={fmtMoney(data.totais.vProd)} mono />
          <Field label="ICMS" value={fmtMoney(data.totais.vICMS)} mono />
          <Field label="IPI" value={fmtMoney(data.totais.vIPI)} mono />
          <Field label="Frete" value={fmtMoney(data.totais.vFrete)} mono />
          <Field label="Desconto" value={fmtMoney(data.totais.vDesc)} mono />
          <div>
            <span className="text-muted-foreground text-[10px] block">Valor Total NF</span>
            <span className="font-mono font-bold text-base text-primary">{fmtMoney(data.totais.vNF)}</span>
          </div>
        </div>
      </Section>

      {/* Transporte */}
      <Section title="Transporte">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          <Field label="Transportadora" value={data.transporte.nome} className="col-span-2" />
          <Field label="Frete" value={data.transporte.frete} />
          <Field label="CNPJ" value={data.transporte.cnpj} mono />
          <Field label="Volumes" value={data.transporte.volumes} />
          <Field label="Espécie" value={data.transporte.especie} />
          <Field label="Peso Bruto" value={data.transporte.pesoB ? `${data.transporte.pesoB} kg` : "—"} />
          <Field label="Peso Líquido" value={data.transporte.pesoL ? `${data.transporte.pesoL} kg` : "—"} />
        </div>
      </Section>

      {/* Pagamento */}
      <Section title="Pagamento">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Forma" value={data.pagamento.tipo} />
          <Field label="Valor" value={fmtMoney(data.pagamento.valor)} mono />
        </div>
      </Section>

      {/* Info Adicional */}
      {data.infAdic && (
        <Section title="Informações Adicionais">
          <p className="whitespace-pre-wrap text-muted-foreground">{data.infAdic}</p>
          {data.os && (
            <Badge variant="outline" className="mt-2">OS: {data.os}</Badge>
          )}
        </Section>
      )}
    </div>
  );
};

export default DanfeVisual;
