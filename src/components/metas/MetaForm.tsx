import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, X, Store, Users } from "lucide-react";
import { Empresa } from "@/services/empresaService";
import { MetaVenda } from "@/services/metasService";
import { VendedorOption } from "@/hooks/useMetasVendas";

interface MetaFormProps {
  empresas: Empresa[];
  vendedores: VendedorOption[];
  metaEmEdicao: MetaVenda | null;
  onSalvar: (meta: Omit<MetaVenda, 'id'>) => Promise<boolean>;
  onCancelar: () => void;
  onEmpresaChange: (empresa: number | 'ALL') => void;
  loadingVendedores?: boolean;
}

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

export function MetaForm({ 
  empresas, 
  vendedores, 
  metaEmEdicao, 
  onSalvar, 
  onCancelar,
  onEmpresaChange,
  loadingVendedores 
}: MetaFormProps) {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];

  const [tipo, setTipo] = useState<'LOJA' | 'VENDEDOR'>('LOJA');
  const [codReferencia, setCodReferencia] = useState<number | null>(null);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<number | null>(null);
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(mesAtual);
  const [metaFaturamento, setMetaFaturamento] = useState<string>("");
  const [metaTicketMedio, setMetaTicketMedio] = useState<string>("");
  const [metaQtdVendas, setMetaQtdVendas] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Popular form quando editar
  useEffect(() => {
    if (metaEmEdicao) {
      setTipo(metaEmEdicao.tipo);
      setCodReferencia(metaEmEdicao.codReferencia);
      setAno(metaEmEdicao.ano);
      setMes(metaEmEdicao.mes);
      setMetaFaturamento(String(metaEmEdicao.metaFaturamento || ""));
      setMetaTicketMedio(String(metaEmEdicao.metaTicketMedio || ""));
      setMetaQtdVendas(String(metaEmEdicao.metaQtdVendas || ""));
      
      if (metaEmEdicao.tipo === 'VENDEDOR') {
        const vendedor = vendedores.find(v => v.codVendedor === metaEmEdicao.codReferencia);
        if (vendedor) {
          setEmpresaSelecionada(vendedor.codEmpresa);
        }
      }
    }
  }, [metaEmEdicao, vendedores]);

  // Buscar vendedores quando mudar empresa
  useEffect(() => {
    if (tipo === 'VENDEDOR' && empresaSelecionada) {
      onEmpresaChange(empresaSelecionada);
    }
  }, [tipo, empresaSelecionada, onEmpresaChange]);

  const limparForm = () => {
    setCodReferencia(null);
    setMetaFaturamento("");
    setMetaTicketMedio("");
    setMetaQtdVendas("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!codReferencia) {
      return;
    }

    setSaving(true);
    
    let nomeReferencia: string | null = null;
    if (tipo === 'LOJA') {
      nomeReferencia = empresas.find(e => e.codEmpresa === codReferencia)?.nome || null;
    } else {
      nomeReferencia = vendedores.find(v => v.codVendedor === codReferencia)?.nome || null;
    }

    const success = await onSalvar({
      tipo,
      codReferencia,
      nomeReferencia,
      ano,
      mes,
      metaFaturamento: Number(metaFaturamento) || 0,
      metaTicketMedio: Number(metaTicketMedio) || 0,
      metaDescontoMax: 0,
      metaQtdVendas: Number(metaQtdVendas) || 0,
      numVendedores: 1,
      percentualAceitavel: 100,
    });

    setSaving(false);
    if (success) {
      limparForm();
    }
  };

  const vendedoresFiltrados = empresaSelecionada 
    ? vendedores.filter(v => v.codEmpresa === empresaSelecionada)
    : vendedores;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {metaEmEdicao ? "Editar Meta" : "Nova Meta"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={tipo} onValueChange={(v) => { setTipo(v as 'LOJA' | 'VENDEDOR'); setCodReferencia(null); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="LOJA" className="gap-2">
                <Store className="h-4 w-4" />
                Loja
              </TabsTrigger>
              <TabsTrigger value="VENDEDOR" className="gap-2">
                <Users className="h-4 w-4" />
                Vendedor
              </TabsTrigger>
            </TabsList>

            <TabsContent value="LOJA" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Loja *</Label>
                <Select 
                  value={codReferencia ? String(codReferencia) : ""} 
                  onValueChange={(v) => setCodReferencia(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a loja..." />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map(emp => (
                      <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                        {emp.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="VENDEDOR" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Select 
                  value={empresaSelecionada ? String(empresaSelecionada) : ""} 
                  onValueChange={(v) => { setEmpresaSelecionada(Number(v)); setCodReferencia(null); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map(emp => (
                      <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                        {emp.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Vendedor *</Label>
                <Select 
                  value={codReferencia ? String(codReferencia) : ""} 
                  onValueChange={(v) => setCodReferencia(Number(v))}
                  disabled={loadingVendedores}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingVendedores ? "Carregando..." : "Selecione o vendedor..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {vendedoresFiltrados.map(v => (
                      <SelectItem key={v.codVendedor} value={String(v.codVendedor)}>
                        {v.nome} ({v.empresa})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Ano</Label>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anos.map(a => (
                    <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map(m => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Meta Faturamento (R$)</Label>
            <Input 
              type="number"
              step="0.01"
              min="0"
              value={metaFaturamento}
              onChange={(e) => setMetaFaturamento(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-2">
            <Label>Meta Ticket Médio (R$)</Label>
            <Input 
              type="number"
              step="0.01"
              min="0"
              value={metaTicketMedio}
              onChange={(e) => setMetaTicketMedio(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-2">
            <Label>Meta Qtd Vendas</Label>
            <Input 
              type="number"
              min="0"
              value={metaQtdVendas}
              onChange={(e) => setMetaQtdVendas(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={!codReferencia || saving} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            {metaEmEdicao && (
              <Button type="button" variant="outline" onClick={onCancelar}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
