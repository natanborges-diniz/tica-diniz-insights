// src/components/metas/ComissoesPremiosTab.tsx
// Fase 2b — configuração de taxas de comissão e prêmios (SÓ MASTER/admin)
// (docs/REVISAO_VENDAS_METAS.md §2 e §5.2): percentuais NUNCA no código; o
// fechamento aplica a taxa vigente e grava o % usado no snapshot. Não-admins
// veem tudo em modo somente leitura (RLS também bloqueia a escrita no banco).

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BadgePercent, Trophy, Plus, Pencil, Trash2, Lock, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  getComissaoTaxas,
  upsertComissaoTaxa,
  getPremiosConfig,
  upsertPremioConfig,
  deletePremioConfig,
  type ComissaoTaxa,
  type PremioConfig,
} from "@/services/metasSemanaisService";

const CATEGORIA_LABEL: Record<string, string> = {
  AVISTA: "À vista (dinheiro)",
  PIX: "PIX",
  CARTAO_DEBITO: "Cartão de débito",
  CARTAO_CREDITO: "Cartão de crédito",
  CHEQUE: "Cheque",
  CREDIARIO: "Crediário / boleto / carnê",
  CONVENIO: "Convênio",
  CREDITOS: "Créditos (tipo 6)",
  OUTROS: "Outros",
};

export function ComissoesPremiosTab() {
  const { isAdmin } = useAuth();

  const [taxas, setTaxas] = useState<ComissaoTaxa[]>([]);
  const [premios, setPremios] = useState<PremioConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // edição inline de taxa
  const [editandoTaxa, setEditandoTaxa] = useState<string | null>(null);
  const [valorTaxa, setValorTaxa] = useState("");

  // dialog de prêmio
  const [dialogPremio, setDialogPremio] = useState(false);
  const [premioEdit, setPremioEdit] = useState<PremioConfig | null>(null);
  const [premioTipo, setPremioTipo] = useState<"FAIXA" | "SEQUENCIA">("FAIXA");
  const [premioMetaMin, setPremioMetaMin] = useState("");
  const [premioPercentual, setPremioPercentual] = useState("");
  const [premioSemanas, setPremioSemanas] = useState("");
  const [premioAtivo, setPremioAtivo] = useState(false);
  const [premioTipoValor, setPremioTipoValor] = useState<"PERCENTUAL" | "FIXO">("PERCENTUAL");
  const [premioValorFixo, setPremioValorFixo] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([getComissaoTaxas(), getPremiosConfig()]);
      setTaxas(t);
      setPremios(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // ---------- taxas ----------
  const handleSalvarTaxa = async (formaCategoria: string) => {
    const pct = Number(valorTaxa);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Percentual inválido");
      return;
    }
    try {
      await upsertComissaoTaxa({ formaCategoria, percentual: pct });
      toast.success(`Taxa de ${CATEGORIA_LABEL[formaCategoria] ?? formaCategoria} atualizada`);
      setEditandoTaxa(null);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar taxa");
    }
  };

  // ---------- prêmios ----------
  const abrirPremio = (p?: PremioConfig) => {
    setPremioEdit(p ?? null);
    setPremioTipo(p?.tipo ?? "FAIXA");
    setPremioMetaMin(p?.percentualMetaMin != null ? String(p.percentualMetaMin) : "");
    setPremioPercentual(p ? String(p.percentualPremio) : "");
    setPremioSemanas(p?.semanasConsecutivas != null ? String(p.semanasConsecutivas) : "");
    setPremioAtivo(p?.ativo ?? false);
    setPremioTipoValor(p?.tipoValor ?? "PERCENTUAL");
    setPremioValorFixo(p?.valorFixo ? String(p.valorFixo) : "");
    setDialogPremio(true);
  };

  const handleSalvarPremio = async () => {
    const pct = Number(premioPercentual);
    const fixo = Number(premioValorFixo);
    if (premioTipoValor === "PERCENTUAL" && (Number.isNaN(pct) || pct <= 0)) {
      toast.error("Informe o % de prêmio");
      return;
    }
    if (premioTipoValor === "FIXO" && (Number.isNaN(fixo) || fixo <= 0)) {
      toast.error("Informe o valor fixo do prêmio (R$)");
      return;
    }
    if (premioTipo === "FAIXA" && (premioMetaMin === "" || Number(premioMetaMin) <= 0)) {
      toast.error("Informe o % mínimo de atingimento da faixa");
      return;
    }
    if (premioTipo === "SEQUENCIA" && (premioSemanas === "" || Number(premioSemanas) < 2)) {
      toast.error("Informe o nº de semanas consecutivas (mínimo 2)");
      return;
    }
    try {
      await upsertPremioConfig({
        id: premioEdit?.id,
        tipo: premioTipo,
        percentualMetaMin: premioTipo === "FAIXA" ? Number(premioMetaMin) : null,
        percentualPremio: premioTipoValor === "PERCENTUAL" ? pct : 0,
        semanasConsecutivas: premioTipo === "SEQUENCIA" ? Number(premioSemanas) : null,
        ativo: premioAtivo,
        tipoValor: premioTipoValor,
        valorFixo: premioTipoValor === "FIXO" ? fixo : 0,
      });
      toast.success(premioEdit ? "Prêmio atualizado" : "Prêmio criado");
      setDialogPremio(false);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar prêmio");
    }
  };

  const handleTogglePremio = async (p: PremioConfig) => {
    try {
      await upsertPremioConfig({ ...p, ativo: !p.ativo });
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar prêmio");
    }
  };

  const handleExcluirPremio = async (p: PremioConfig) => {
    if (!p.id || !window.confirm("Excluir esta regra de prêmio?")) return;
    try {
      await deletePremioConfig(p.id);
      toast.success("Prêmio excluído");
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir prêmio");
    }
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Somente o perfil master (admin) pode alterar taxas de comissão e prêmios. Você está
            em modo de visualização.
          </AlertDescription>
        </Alert>
      )}

      {/* Taxas de comissão */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgePercent className="h-5 w-5" />
            Taxas de Comissão por Forma de Pagamento
          </CardTitle>
          <CardDescription>
            Aplicadas no fechamento semanal sobre o valor RECEBIDO. O snapshot do fechamento
            grava o % aplicado — alterações não afetam fechamentos passados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-6">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Comissão (%)</TableHead>
                  {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxas.map((t) => {
                  const emEdicao = editandoTaxa === t.formaCategoria;
                  return (
                    <TableRow key={t.formaCategoria}>
                      <TableCell>
                        <span className="font-medium">
                          {CATEGORIA_LABEL[t.formaCategoria] ?? t.formaCategoria}
                        </span>{" "}
                        <span className="text-xs text-muted-foreground">({t.formaCategoria})</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {emEdicao ? (
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            className="w-24 ml-auto text-right"
                            value={valorTaxa}
                            onChange={(e) => setValorTaxa(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          <Badge variant={t.percentual > 0 ? "default" : "outline"}>
                            {t.percentual}%
                          </Badge>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          {emEdicao ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleSalvarTaxa(t.formaCategoria)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditandoTaxa(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditandoTaxa(t.formaCategoria);
                                setValorTaxa(String(t.percentual));
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Prêmios */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Prêmios por Atingimento
            </CardTitle>
            <CardDescription>
              Faixas escaláveis sobre o % da meta semanal + premiação extra por sequência de
              semanas atingidas no mês.
            </CardDescription>
          </div>
          {isAdmin && (
            <Button onClick={() => abrirPremio()}>
              <Plus className="h-4 w-4 mr-2" />
              Nova regra
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-6">Carregando...</p>
          ) : premios.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Nenhuma regra de prêmio.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead className="text-right">Prêmio (%)</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {premios.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="secondary">
                        {p.tipo === "FAIXA" ? "Faixa" : "Sequência"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.tipo === "FAIXA"
                        ? `Atingiu ≥ ${p.percentualMetaMin}% da meta semanal`
                        : `${p.semanasConsecutivas} semanas consecutivas atingidas no mês`}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {p.tipoValor === "FIXO"
                        ? `R$ ${p.valorFixo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : `+${p.percentualPremio}%`}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={p.ativo}
                        disabled={!isAdmin}
                        onCheckedChange={() => handleTogglePremio(p)}
                      />
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => abrirPremio(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleExcluirPremio(p)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogPremio} onOpenChange={setDialogPremio}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{premioEdit ? "Editar prêmio" : "Nova regra de prêmio"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={premioTipo} onValueChange={(v) => setPremioTipo(v as "FAIXA" | "SEQUENCIA")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FAIXA">Faixa de atingimento</SelectItem>
                  <SelectItem value="SEQUENCIA">Sequência de semanas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {premioTipo === "FAIXA" ? (
              <div className="space-y-2">
                <Label>% mínimo de atingimento da meta semanal</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={premioMetaMin}
                  onChange={(e) => setPremioMetaMin(e.target.value)}
                  placeholder="Ex.: 100"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Semanas consecutivas atingidas no mês</Label>
                <Input
                  type="number"
                  min="2"
                  step="1"
                  value={premioSemanas}
                  onChange={(e) => setPremioSemanas(e.target.value)}
                  placeholder="Ex.: 4"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Forma do prêmio</Label>
              <Select
                value={premioTipoValor}
                onValueChange={(v) => setPremioTipoValor(v as "PERCENTUAL" | "FIXO")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTUAL">% sobre a base da semana</SelectItem>
                  <SelectItem value="FIXO">Valor fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {premioTipoValor === "PERCENTUAL" ? (
              <div className="space-y-2">
                <Label>% de prêmio</Label>
                <Input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={premioPercentual}
                  onChange={(e) => setPremioPercentual(e.target.value)}
                  placeholder="Ex.: 0,5"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Valor fixo do prêmio (R$)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={premioValorFixo}
                  onChange={(e) => setPremioValorFixo(e.target.value)}
                  placeholder="Ex.: 250,00"
                />
              </div>
            )}
            <label className="flex items-center gap-2">
              <Switch checked={premioAtivo} onCheckedChange={setPremioAtivo} />
              <span className="text-sm">Ativo</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogPremio(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarPremio}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
