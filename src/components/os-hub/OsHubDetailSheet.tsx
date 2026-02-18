import React from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OsHubRecord } from "@/services/osHubService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Send } from "lucide-react";

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
                label="OD (Olho Direito)"
                esf={os.odLongeEsf} cil={os.odLongeCil} eixo={os.odLongeEixo}
                adicao={os.odAdicao} dnp={os.odDnp} altura={os.odAltura}
              />

              {/* Receita OE */}
              <RxField
                label="OE (Olho Esquerdo)"
                esf={os.oeLongeEsf} cil={os.oeLongeCil} eixo={os.oeLongeEixo}
                adicao={os.oeAdicao} dnp={os.oeDnp} altura={os.oeAltura}
              />

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
