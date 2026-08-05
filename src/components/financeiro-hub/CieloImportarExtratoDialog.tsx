// Importacao manual de arquivos do Extrato Eletronico Cielo (layout v15).
//
// Existe por dois motivos, nao apenas como conveniencia:
//  1. O acesso a API EXTC depende de um certificado mTLS assinado pela Cielo, e
//     o runtime de Edge Functions do Supabase nao garante suporte a mTLS.
//  2. Mesmo com a API de pe, reprocessamentos e arquivos historicos costumam ser
//     entregues por download no portal.
//
// O parsing e a gravacao acontecem na edge function sync-vendas-cielo — aqui so
// lemos o arquivo e mandamos em base64.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, FileText, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

interface ResultadoArquivo {
  nome_arquivo: string;
  tipo_arquivo: string;
  ja_processado: boolean;
  /** Recusado pela edge function por divergência com o trailer. Nada foi gravado. */
  rejeitado: boolean;
  validacao: { ok: boolean; erros: string[]; avisos: string[] };
  urs: number;
  lancamentos: number;
  pix: number;
  vendas_upsert: number;
  recebiveis_upsert: number;
  recebiveis_liquidados: number;
  vendas_ajustadas: number;
  duplicatas_no_arquivo: number;
  sem_mapeamento: Record<string, number>;
  colisoes_pv: string[];
}

const TIPOS_ESPERADOS: Record<string, string> = {
  CIELO03: "Captura / previsão de recebíveis",
  CIELO04: "Liquidação / pagamento",
  CIELO16: "Transações Pix",
};

/** Le o arquivo como base64 sem estourar a pilha em arquivos grandes. */
function lerComoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}`));
    reader.onload = () => {
      const resultado = String(reader.result || "");
      // dataURL -> "data:...;base64,XXXX"
      const virgula = resultado.indexOf(",");
      resolve(virgula >= 0 ? resultado.slice(virgula + 1) : resultado);
    };
    reader.readAsDataURL(file);
  });
}

export function CieloImportarExtratoDialog({ onImportado }: { onImportado?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [aceitarDivergencia, setAceitarDivergencia] = useState(false);
  const [resultados, setResultados] = useState<ResultadoArquivo[]>([]);

  const importar = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada");

      const saida: ResultadoArquivo[] = [];
      for (const file of arquivos) {
        const conteudo_base64 = await lerComoBase64(file);
        const { data, error } = await supabase.functions.invoke("sync-vendas-cielo", {
          body: {
            conteudo_base64,
            nome_arquivo: file.name,
            importado_por: session.user.id,
            aceitar_com_divergencia: aceitarDivergencia,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const resposta = (data ?? {}) as { error?: string; arquivos?: ResultadoArquivo[] };
        if (error) throw new Error(`${file.name}: ${error.message}`);
        if (resposta.error) throw new Error(`${file.name}: ${resposta.error}`);
        saida.push(...(resposta.arquivos || []));
      }
      return saida;
    },
    onSuccess: (saida) => {
      setResultados(saida);
      // Só a edge function sabe se recusou o arquivo — inferir isso de
      // `vendas_upsert === 0` marcaria todo CIELO04 e CIELO16 como recusado,
      // já que esses arquivos não geram vendas por definição.
      const rejeitados = saida.filter((r) => r.rejeitado).length;
      const vendas = saida.reduce((a, r) => a + r.vendas_upsert, 0);

      if (rejeitados > 0) {
        toast.error(
          `${rejeitados} arquivo(s) recusado(s) por divergência com o trailer. Confira os detalhes abaixo.`,
        );
      } else {
        toast.success(`${saida.length} arquivo(s) importado(s) — ${vendas} venda(s) atualizadas`);
      }
      onImportado?.();
    },
    onError: (e: Error) => toast.error(e.message || "Falha na importação"),
  });

  const reset = () => {
    setArquivos([]);
    setResultados([]);
    setAceitarDivergencia(false);
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <Upload className="h-4 w-4 mr-1" /> Importar extrato Cielo
      </Button>

      <BaseDialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) reset();
        }}
        title="Importar Extrato Eletrônico Cielo"
        description="Arquivos do layout versão 15 baixados do portal da Cielo: CIELO03 (previsão), CIELO04 (liquidação) e CIELO16 (Pix). Reimportar o mesmo arquivo não duplica nada."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(false)}>Fechar</Button>
            <Button
              onClick={() => importar.mutate()}
              disabled={arquivos.length === 0 || importar.isPending}
            >
              {importar.isPending ? "Importando..." : `Importar ${arquivos.length || ""}`.trim()}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <input
              type="file"
              multiple
              accept=".txt,.TXT,text/plain"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-primary-foreground"
              onChange={(e) => {
                setArquivos(Array.from(e.target.files || []));
                setResultados([]);
              }}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              A ordem importa quando há dependência: importe o CIELO03 antes do CIELO04 do mesmo
              período, para que os recebíveis existam antes de serem liquidados.
            </p>
          </div>

          {arquivos.length > 0 && resultados.length === 0 && (
            <div className="space-y-1">
              {arquivos.map((f) => (
                <div key={f.name} className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setArquivos((a) => a.filter((x) => x !== f))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2">
            <Checkbox
              id="aceitar-divergencia"
              checked={aceitarDivergencia}
              onCheckedChange={(v) => setAceitarDivergencia(Boolean(v))}
            />
            <label htmlFor="aceitar-divergencia" className="text-sm leading-tight">
              Importar mesmo com divergência no trailer
              <span className="block text-xs text-muted-foreground">
                Por padrão o arquivo é recusado quando os totais do trailer não batem com a soma dos
                registros — sinal de download truncado. Marque apenas se souber o motivo da diferença.
              </span>
            </label>
          </div>

          {resultados.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              {resultados.map((r, i) => (
                <div key={`${r.nome_arquivo}-${i}`} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {r.rejeitado
                      ? <AlertTriangle className="h-4 w-4 text-destructive" />
                      : <CheckCircle2 className="h-4 w-4 text-primary" />}
                    <span className="font-medium text-sm">{r.nome_arquivo}</span>
                    <Badge variant="outline" className="text-xs">
                      {r.tipo_arquivo}
                      {TIPOS_ESPERADOS[r.tipo_arquivo] ? ` — ${TIPOS_ESPERADOS[r.tipo_arquivo]}` : ""}
                    </Badge>
                    {r.rejeitado && <Badge variant="destructive" className="text-xs">recusado — nada gravado</Badge>}
                    {r.ja_processado && <Badge variant="secondary" className="text-xs">já importado</Badge>}
                  </div>

                  {!r.ja_processado && !r.rejeitado && (
                    <div className="text-xs text-muted-foreground pl-6 font-mono">
                      {r.lancamentos} lançamento(s) · {r.urs} UR(s) · {r.pix} Pix ·{" "}
                      {r.vendas_upsert} venda(s) · {r.recebiveis_upsert} recebível(is) ·{" "}
                      {r.recebiveis_liquidados} liquidado(s) · {r.vendas_ajustadas} ajuste(s)
                      {r.duplicatas_no_arquivo > 0 && ` · ${r.duplicatas_no_arquivo} duplicata(s) no arquivo`}
                    </div>
                  )}

                  {(r.colisoes_pv || []).length > 0 && (
                    <Alert variant="destructive" className="py-2">
                      <AlertDescription className="text-xs">
                        PV cadastrado em mais de uma loja — as vendas desses PVs foram atribuídas à
                        primeira: {r.colisoes_pv.join("; ")}
                      </AlertDescription>
                    </Alert>
                  )}

                  {r.validacao.erros.length > 0 && (
                    <Alert variant="destructive" className="py-2">
                      <AlertDescription className="text-xs space-y-0.5">
                        {r.validacao.erros.map((e, j) => <div key={j}>{e}</div>)}
                      </AlertDescription>
                    </Alert>
                  )}

                  {r.validacao.avisos.length > 0 && (
                    <div className="text-xs text-amber-600 pl-6 space-y-0.5">
                      {r.validacao.avisos.map((a, j) => <div key={j}>{a}</div>)}
                    </div>
                  )}

                  {Object.keys(r.sem_mapeamento || {}).length > 0 && (
                    <Alert className="py-2">
                      <AlertDescription className="text-xs">
                        Estabelecimentos sem loja associada (registros importados sem
                        <code className="mx-1">cod_empresa</code>):{" "}
                        <span className="font-mono">
                          {Object.entries(r.sem_mapeamento).map(([pv, n]) => `${pv} (${n})`).join(", ")}
                        </span>
                        . Cadastre esses PVs em Admin &gt; Adquirentes e reimporte.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </BaseDialog>
    </>
  );
}
