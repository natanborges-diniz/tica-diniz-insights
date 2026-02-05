// src/components/os-hub/OsHubDetailSheet.tsx
// Tela 2 — Detalhe da OS com receita completa, imagens e observações

import React from 'react';
import { OsHubRecord } from '@/services/osHubService';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Eye, Image, FileText, Phone, User, Calendar, Clock, AlertTriangle } from 'lucide-react';

interface Props {
  os: OsHubRecord | null;
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  ENTREGUE: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  NO_PRAZO: 'bg-blue-100 text-blue-800 border-blue-300',
  ATRASO_LEVE: 'bg-amber-100 text-amber-800 border-amber-300',
  ATRASO: 'bg-red-100 text-red-800 border-red-300',
  SEM_DATA: 'bg-gray-100 text-gray-600 border-gray-300',
};

const statusLabels: Record<string, string> = {
  ENTREGUE: 'Entregue',
  NO_PRAZO: 'No Prazo',
  ATRASO_LEVE: 'Atraso Leve',
  ATRASO: 'Atraso',
  SEM_DATA: 'Sem Data',
};

function formatDate(v: string | null) {
  if (!v) return '-';
  try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return '-'; }
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatGrau(v: number | null): string {
  if (v === null || v === undefined) return '-';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}`;
}

function GrauCell({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-medium">{formatGrau(value)}</p>
    </div>
  );
}

function EixoCell({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-medium">{value !== null ? `${value}°` : '-'}</p>
    </div>
  );
}

export const OsHubDetailSheet: React.FC<Props> = ({ os, onClose }) => {
  if (!os) return null;

  const hasOdLonge = os.odLongeEsf !== null || os.odLongeCil !== null;
  const hasOeLonge = os.oeLongeEsf !== null || os.oeLongeCil !== null;
  const hasOdPerto = os.odPertoEsf !== null || os.odPertoCil !== null;
  const hasOePerto = os.oePertoEsf !== null || os.oePertoCil !== null;

  return (
    <Sheet open={!!os} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <span>OS {os.numeroOs || os.codOs}</span>
            <Badge variant="outline" className={statusColors[os.statusAtraso] || statusColors.SEM_DATA}>
              {statusLabels[os.statusAtraso] || os.statusAtraso}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Info Básica */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" /> Dados da OS
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Cliente</p>
                <p className="font-medium">{os.cliente || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Empresa</p>
                <p className="font-medium">{os.empresa}</p>
              </div>
              {os.telefone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span>{os.telefone}</span>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Etapa</p>
                <p className="font-medium">{os.etapa || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Valor</p>
                <p className="font-medium">{formatCurrency(os.total)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Usuário</p>
                <p className="font-medium">{os.usuario || '-'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Datas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Datas
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Emissão</p>
                <p>{formatDate(os.dataEmissao)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Previsão</p>
                <p>{formatDate(os.dataPrevisao)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Entrada</p>
                <p>{formatDate(os.dataEntrada)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Saída</p>
                <p>{formatDate(os.dataSaida)}</p>
              </div>
              {os.atrasoDias > 0 && os.statusAtraso !== 'ENTREGUE' && (
                <div className="col-span-2 flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">{os.atrasoDias} dias de atraso</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receita */}
          {os.temReceita && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Receita
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* OD - Longe */}
                {hasOdLonge && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">OD (Olho Direito) — Longe</p>
                    <div className="grid grid-cols-5 gap-2">
                      <GrauCell value={os.odLongeEsf} label="Esférico" />
                      <GrauCell value={os.odLongeCil} label="Cilíndrico" />
                      <EixoCell value={os.odLongeEixo} label="Eixo" />
                      <GrauCell value={os.odDnp} label="DNP" />
                      <GrauCell value={os.odAltura} label="Altura" />
                    </div>
                  </div>
                )}

                {/* OD - Perto */}
                {hasOdPerto && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">OD — Perto</p>
                    <div className="grid grid-cols-4 gap-2">
                      <GrauCell value={os.odPertoEsf} label="Esférico" />
                      <GrauCell value={os.odPertoCil} label="Cilíndrico" />
                      <EixoCell value={os.odPertoEixo} label="Eixo" />
                      <GrauCell value={os.odAdicao} label="Adição" />
                    </div>
                  </div>
                )}

                <Separator />

                {/* OE - Longe */}
                {hasOeLonge && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">OE (Olho Esquerdo) — Longe</p>
                    <div className="grid grid-cols-5 gap-2">
                      <GrauCell value={os.oeLongeEsf} label="Esférico" />
                      <GrauCell value={os.oeLongeCil} label="Cilíndrico" />
                      <EixoCell value={os.oeLongeEixo} label="Eixo" />
                      <GrauCell value={os.oeDnp} label="DNP" />
                      <GrauCell value={os.oeAltura} label="Altura" />
                    </div>
                  </div>
                )}

                {/* OE - Perto */}
                {hasOePerto && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">OE — Perto</p>
                    <div className="grid grid-cols-4 gap-2">
                      <GrauCell value={os.oePertoEsf} label="Esférico" />
                      <GrauCell value={os.oePertoCil} label="Cilíndrico" />
                      <EixoCell value={os.oePertoEixo} label="Eixo" />
                      <GrauCell value={os.oeAdicao} label="Adição" />
                    </div>
                  </div>
                )}

                {/* Prismas */}
                {(os.prisma || os.prisma1) && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Prismas</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {os.prisma && <div><span className="text-muted-foreground">Prisma: </span>{os.prisma}</div>}
                        {os.prisma1 && <div><span className="text-muted-foreground">Prisma 1: </span>{os.prisma1}</div>}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Imagens */}
          {os.temImagem && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Image className="h-4 w-4" /> Imagens
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {os.urlImagemReceita && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Receita</p>
                    <img
                      src={os.urlImagemReceita}
                      alt="Receita"
                      className="rounded-lg border max-h-[300px] object-contain w-full"
                      loading="lazy"
                    />
                  </div>
                )}
                {os.urlImagemArmacao && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Armação</p>
                    <img
                      src={os.urlImagemArmacao}
                      alt="Armação"
                      className="rounded-lg border max-h-[300px] object-contain w-full"
                      loading="lazy"
                    />
                  </div>
                )}
                {os.imagemTracer && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Tracer</p>
                    <img
                      src={os.imagemTracer}
                      alt="Tracer"
                      className="rounded-lg border max-h-[200px] object-contain w-full"
                      loading="lazy"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          {(os.observacaoOs || os.observacaoLente || os.observacaoPendencia) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Observações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {os.observacaoOs && (
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold">OS</p>
                    <p className="whitespace-pre-wrap">{os.observacaoOs}</p>
                  </div>
                )}
                {os.observacaoLente && (
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold">Lente</p>
                    <p className="whitespace-pre-wrap">{os.observacaoLente}</p>
                  </div>
                )}
                {os.observacaoPendencia && (
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold">Pendência</p>
                    <p className="whitespace-pre-wrap text-destructive">{os.observacaoPendencia}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
