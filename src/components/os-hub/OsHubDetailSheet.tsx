import React from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OsHubRecord } from "@/services/osHubService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Send } from "lucide-react";

const FORMA_ARO_LABELS: Record<number, string> = {
  1: "Arredondado", 2: "Oval", 3: "Gota", 4: "Retangular arredondado",
  5: "Triangular", 6: "Oval largo", 7: "Redondo", 8: "Oval inclinado",
};

function FormaAroIcon({ codigo }: { codigo: number }) {
  const size = 32;
  const s = size;
  const paths: Record<number, string> = {
    1: `M8,5 Q4,5 4,10 L4,${s-10} Q4,${s-5} 8,${s-5} L${s-8},${s-5} Q${s-4},${s-5} ${s-4},${s-10} L${s-4},10 Q${s-4},5 ${s-8},5Z`, // rounded rect
    2: `M${s/2},4 A${s/2-4},${s/2-4} 0 1,1 ${s/2},${s-4} A${s/2-4},${s/2-4} 0 1,1 ${s/2},4Z`, // oval
    3: `M4,8 Q${s/2},2 ${s-4},8 L${s-6},${s-6} Q${s/2},${s-2} 6,${s-6}Z`, // teardrop/gota
    4: `M8,6 Q5,6 5,9 L5,${s-9} Q5,${s-6} 8,${s-6} L${s-8},${s-6} Q${s-5},${s-6} ${s-5},${s-9} L${s-5},9 Q${s-5},6 ${s-8},6Z`, // rounded rect smaller
    5: `M6,${s-8} Q4,6 ${s/2},4 Q${s-4},6 ${s-6},${s-8} Q${s/2},${s-4} 6,${s-8}Z`, // triangular
    6: `M${s/2},5 A${s/2-4},${s/3} 0 1,1 ${s/2},${s-5} A${s/2-4},${s/3} 0 1,1 ${s/2},5Z`, // oval wide
    7: `M${s/2},4 A${s/2-5},${s/2-5} 0 1,1 ${s/2},${s-4} A${s/2-5},${s/2-5} 0 1,1 ${s/2},4Z`, // round
    8: `M6,${s/2+2} A${s/2-4},${s/3} 0 1,1 ${s-6},${s/2-2} A${s/2-4},${s/3} 0 1,1 6,${s/2+2}Z`, // oval tilted
  };
  const d = paths[codigo] ?? paths[1];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="text-foreground">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  os: OsHubRecord | null;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between text-sm py-1 border-b border-border/40">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function RxField({ label, esf, cil, eixo, adicao, dnp, altura }: {
  label: string;
  esf: number | null; cil: number | null; eixo: number | null;
  adicao: number | null; dnp: number | null; altura: number | null;
}) {
  if (!esf && !cil && !eixo) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase">{label}</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <Field label="Esf" value={esf?.toFixed(2)} />
        <Field label="Cil" value={cil?.toFixed(2)} />
        <Field label="Eixo" value={eixo} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <Field label="Adição" value={adicao?.toFixed(2)} />
        <Field label="DNP" value={dnp} />
        <Field label="Altura" value={altura} />
      </div>
    </div>
  );
}

export const OsHubDetailSheet: React.FC<Props> = ({ os, onClose }) => {
  const navigate = useNavigate();

  const handleGerarPedido = () => {
    if (!os) return;
    onClose();
    navigate(`/os/pedido?codOs=${os.codOs}&codEmpresa=${os.codEmpresa}`);
  };

  return (
    <Sheet open={!!os} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            OS {os?.numeroOs || os?.codOs} — Receita
          </SheetTitle>
        </SheetHeader>

        {os && (
          <ScrollArea className="h-[calc(100vh-120px)] pr-4 mt-4">
            <div className="space-y-4">
              {/* Info geral */}
              <div className="space-y-1">
                <Field label="Cliente" value={os.cliente} />
                <Field label="Empresa" value={os.empresa} />
                <Field label="Etapa" value={os.etapa} />
                <Field label="Vendedor" value={os.vendedor || os.usuario} />
                <Field label="Emissão" value={os.dataEmissao} />
                <Field label="Previsão" value={os.dataPrevisao} />
                <Field label="Entrada" value={os.dataEntrada} />
                <Field label="Saída" value={os.dataSaida} />
                <Field label="Total" value={`R$ ${os.total?.toFixed(2)}`} />
                <Field label="Status" value={
                  <Badge variant={os.statusAtraso === "ATRASO" ? "destructive" : "secondary"}>
                    {os.statusAtraso}
                  </Badge>
                } />
              </div>

              {/* Receita OD */}
              <RxField
                label="OD — Longe"
                esf={os.odLongeEsf} cil={os.odLongeCil} eixo={os.odLongeEixo}
                adicao={os.odAdicao} dnp={os.odDnp} altura={os.odAltura}
              />
              <RxField
                label="OD — Perto"
                esf={os.odPertoEsf} cil={os.odPertoCil} eixo={os.odPertoEixo}
                adicao={null} dnp={null} altura={null}
              />

              {/* Receita OE */}
              <RxField
                label="OE — Longe"
                esf={os.oeLongeEsf} cil={os.oeLongeCil} eixo={os.oeLongeEixo}
                adicao={os.oeAdicao} dnp={os.oeDnp} altura={os.oeAltura}
              />
              <RxField
                label="OE — Perto"
                esf={os.oePertoEsf} cil={os.oePertoCil} eixo={os.oePertoEixo}
                adicao={null} dnp={null} altura={null}
              />

              {/* Armação */}
              {(os.descricaoArmacao || os.codFormatoAro != null || os.ponte || os.aaVertical || os.ta) && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Armação</p>
                  <Field label="Descrição" value={os.descricaoArmacao} />
                  <Field label="Referência" value={os.referenciaArmacao} />
                  {os.codFormatoAro != null && (
                    <div className="flex items-center gap-2 py-1 border-b border-border/40">
                      <span className="text-muted-foreground text-sm">Formato do Aro</span>
                      <div className="flex items-center gap-2 ml-auto">
                        <FormaAroIcon codigo={os.codFormatoAro} />
                        <span className="text-xs text-muted-foreground">
                          {FORMA_ARO_LABELS[os.codFormatoAro] ?? `Código ${os.codFormatoAro}`}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <Field label="Ponte" value={os.ponte} />
                    <Field label="Aro (V)" value={os.aaVertical} />
                    <Field label="Diâmetro" value={os.diametro} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <Field label="TA" value={os.ta} />
                    <Field label="Largura (H)" value={os.caHorizontal} />
                    <Field label="MD" value={os.md} />
                  </div>
                </div>
              )}

              {/* Lentes */}
              <div className="space-y-1">
                <Field label="Lente OD" value={os.lenteOdDescricao} />
                <Field label="Lente OE" value={os.lenteOeDescricao} />
              </div>

              {/* Observações */}
              {os.observacaoOs && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Observação OS</p>
                  <p className="text-sm bg-muted/50 p-2 rounded">{os.observacaoOs}</p>
                </div>
              )}
              {os.observacaoLente && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Observação Lente</p>
                  <p className="text-sm bg-muted/50 p-2 rounded">{os.observacaoLente}</p>
                </div>
              )}

              {/* Gerar Pedido */}
              <Separator />
              <Button onClick={handleGerarPedido} className="w-full gap-2">
                <Send className="h-4 w-4" />
                Gerar Pedido Hoya
              </Button>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
};
