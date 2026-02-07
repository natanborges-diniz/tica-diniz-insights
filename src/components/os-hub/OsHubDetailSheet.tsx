// src/components/os-hub/OsHubDetailSheet.tsx
// Tela 2 — Detalhe da OS com receita completa, full-screen dialog

import React from 'react';
import { OsHubRecord } from '@/services/osHubService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Eye,
  EyeOff,
  Image,
  FileText,
  Phone,
  User,
  Calendar,
  AlertTriangle,
  Ruler,
  Triangle,
  Glasses,
  Focus,
  ScanLine,
  MessageSquareText,
  Building2,
  DollarSign,
  Clock,
} from 'lucide-react';

interface Props {
  os: OsHubRecord | null;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  ENTREGUE: { label: 'Entregue', className: 'bg-emerald-500/15 text-emerald-700 border-emerald-300' },
  NO_PRAZO: { label: 'No Prazo', className: 'bg-blue-500/15 text-blue-700 border-blue-300' },
  ATRASO_LEVE: { label: 'Atraso Leve', className: 'bg-amber-500/15 text-amber-700 border-amber-300' },
  ATRASO: { label: 'Atraso', className: 'bg-red-500/15 text-red-700 border-red-300' },
  SEM_DATA: { label: 'Sem Data', className: 'bg-muted text-muted-foreground border-border' },
};

function formatDate(v: string | null) {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return '—'; }
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatGrau(v: number | null): string {
  if (v === null || v === undefined) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}`;
}

function hasAnyValue(...values: (number | null | undefined)[]): boolean {
  return values.some(v => v !== null && v !== undefined);
}

/* ---- Reusable sub-components ---- */

function InfoItem({ icon: Icon, label, value, className }: { icon?: React.ElementType; label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="font-medium text-sm">{value || '—'}</p>
    </div>
  );
}

function DiopterValue({ value, label }: { value: number | null; label: string }) {
  const isNull = value === null || value === undefined;
  return (
    <div className="text-center px-2 py-2 rounded-md bg-muted/50">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`font-mono text-sm font-semibold ${isNull ? 'text-muted-foreground' : ''}`}>
        {isNull ? '—' : formatGrau(value)}
      </p>
    </div>
  );
}

function MeasureValue({ value, label, suffix }: { value: number | null; label: string; suffix?: string }) {
  const isNull = value === null || value === undefined;
  return (
    <div className="text-center px-2 py-2 rounded-md bg-muted/50">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`font-mono text-sm font-semibold ${isNull ? 'text-muted-foreground' : ''}`}>
        {isNull ? '—' : `${value}${suffix || ''}`}
      </p>
    </div>
  );
}

function EyeRow({ side, esf, cil, eixo, dnp, alt, adicao }: {
  side: 'OD' | 'OE';
  esf: number | null;
  cil: number | null;
  eixo: number | null;
  dnp: number | null;
  alt: number | null;
  adicao: number | null;
}) {
  const isOD = side === 'OD';
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold ${isOD ? 'bg-blue-500/15 text-blue-700' : 'bg-emerald-500/15 text-emerald-700'}`}>
          {side}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {isOD ? 'Olho Direito' : 'Olho Esquerdo'}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <DiopterValue value={esf} label="Esf" />
        <DiopterValue value={cil} label="Cil" />
        <MeasureValue value={eixo} label="Eixo" suffix="°" />
        <MeasureValue value={dnp} label="DNP" />
        <MeasureValue value={alt} label="Alt" />
        <DiopterValue value={adicao} label="Adição" />
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, accent }: { icon: React.ElementType; title: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${accent || 'bg-primary/10'}`}>
        <Icon className={`h-4 w-4 ${accent ? 'text-current' : 'text-primary'}`} />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

/* ---- Main Component ---- */

export const OsHubDetailSheet: React.FC<Props> = ({ os, onClose }) => {
  if (!os) return null;

  const status = statusConfig[os.statusAtraso] || statusConfig.SEM_DATA;
  const hasOd = hasAnyValue(os.odLongeEsf, os.odLongeCil, os.odPertoEsf, os.odPertoCil, os.odAdicao);
  const hasOe = hasAnyValue(os.oeLongeEsf, os.oeLongeCil, os.oePertoEsf, os.oePertoCil, os.oeAdicao);
  const hasMedidasGerais = hasAnyValue(os.dp, os.pertoDp, os.distanciaLeitura, os.distanciaProgressao, os.distanciaVertice);
  const hasArmacao = hasAnyValue(os.ponte, os.aaVertical, os.caHorizontal, os.diametro, os.ta, os.md, os.he, os.st);
  const hasPrismaOd = !!(os.prisma && os.prisma.trim());
  const hasPrismaOe = !!(os.prisma1 && os.prisma1.trim());
  const hasPrismas = hasPrismaOd || hasPrismaOe;
  const hasImages = !!(os.urlImagemReceita || os.urlImagemArmacao || os.imagemTracer || os.arquivoTracer);
  const hasObs = !!(os.observacaoOs || os.observacaoLente || os.observacaoPendencia || os.observacaoReceita);

  return (
    <Dialog open={!!os} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-muted/30 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
                <Glasses className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">
                  OS {os.numeroOs || os.codOs}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">{os.cliente || 'Cliente não informado'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={status.className}>
                {status.label}
              </Badge>
              {os.atrasoDias > 0 && os.statusAtraso !== 'ENTREGUE' && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {os.atrasoDias}d
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">

            {/* Info cards row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border-dashed">
                <CardContent className="p-3">
                  <InfoItem icon={Building2} label="Empresa" value={os.empresa} />
                </CardContent>
              </Card>
              <Card className="border-dashed">
                <CardContent className="p-3">
                  <InfoItem icon={DollarSign} label="Valor" value={formatCurrency(os.total)} />
                </CardContent>
              </Card>
              <Card className="border-dashed">
                <CardContent className="p-3">
                  <InfoItem icon={User} label="Usuário" value={os.usuario} />
                </CardContent>
              </Card>
              <Card className="border-dashed">
                <CardContent className="p-3">
                  <InfoItem icon={Phone} label="Telefone" value={os.telefone} />
                </CardContent>
              </Card>
            </div>

            {/* Timeline de datas */}
            <Card>
              <CardContent className="p-4">
                <SectionHeader icon={Calendar} title="Cronograma" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Emissão</p>
                      <p className="text-sm font-medium">{formatDate(os.dataEmissao)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Previsão</p>
                      <p className="text-sm font-medium">{formatDate(os.dataPrevisao)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-purple-500" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Entrada</p>
                      <p className="text-sm font-medium">{formatDate(os.dataEntrada)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saída</p>
                      <p className="text-sm font-medium">{formatDate(os.dataSaida)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ===== RECEITA ===== */}
            {(hasOd || hasOe) ? (
              <Card className="border-primary/20">
                <CardContent className="p-4 space-y-4">
                  <SectionHeader icon={Eye} title="Receita — Dioptrias" accent="bg-blue-500/10 text-blue-600" />
                  {hasOd && (
                    <EyeRow
                      side="OD"
                      esf={os.odLongeEsf}
                      cil={os.odLongeCil}
                      eixo={os.odLongeEixo}
                      dnp={os.odDnp}
                      alt={os.odAltura}
                      adicao={os.odAdicao}
                    />
                  )}
                  {hasOd && hasOe && <Separator />}
                  {hasOe && (
                    <EyeRow
                      side="OE"
                      esf={os.oeLongeEsf}
                      cil={os.oeLongeCil}
                      eixo={os.oeLongeEixo}
                      dnp={os.oeDnp}
                      alt={os.oeAltura}
                      adicao={os.oeAdicao}
                    />
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-4 flex items-center gap-3 text-muted-foreground">
                  <EyeOff className="h-5 w-5" />
                  <span className="text-sm">Receita sem dados de dioptria para esta OS.</span>
                </CardContent>
              </Card>
            )}

            {/* Prismas */}
            {hasPrismas && (
              <Card>
                <CardContent className="p-4">
                  <SectionHeader icon={Triangle} title="Prismas" accent="bg-purple-500/10 text-purple-600" />
                  <div className="grid grid-cols-2 gap-4">
                    {hasPrismaOd && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs font-semibold mb-1">Prisma OD</p>
                        <p className="font-mono text-sm">{os.prisma}</p>
                        {(os.prismaAngulo !== null || os.prismaEixo !== null) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {os.prismaAngulo !== null && `Ângulo: ${os.prismaAngulo}°`}
                            {os.prismaAngulo !== null && os.prismaEixo !== null && ' • '}
                            {os.prismaEixo !== null && `Eixo: ${os.prismaEixo}°`}
                          </p>
                        )}
                      </div>
                    )}
                    {hasPrismaOe && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs font-semibold mb-1">Prisma OE</p>
                        <p className="font-mono text-sm">{os.prisma1}</p>
                        {(os.prisma1Angulo !== null || os.prisma1Eixo !== null) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {os.prisma1Angulo !== null && `Ângulo: ${os.prisma1Angulo}°`}
                            {os.prisma1Angulo !== null && os.prisma1Eixo !== null && ' • '}
                            {os.prisma1Eixo !== null && `Eixo: ${os.prisma1Eixo}°`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Medidas + Armação side-by-side */}
            {(hasMedidasGerais || hasArmacao) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {hasMedidasGerais && (
                  <Card>
                    <CardContent className="p-4">
                      <SectionHeader icon={Ruler} title="Medidas Gerais" accent="bg-amber-500/10 text-amber-600" />
                      <div className="grid grid-cols-3 gap-2">
                        <MeasureValue value={os.dp} label="DP" suffix="mm" />
                        <MeasureValue value={os.pertoDp} label="DP Perto" suffix="mm" />
                        <MeasureValue value={os.distanciaLeitura} label="D. Leitura" suffix="mm" />
                        <MeasureValue value={os.distanciaProgressao} label="D. Prog." suffix="mm" />
                        <MeasureValue value={os.distanciaVertice} label="D. Vértice" suffix="mm" />
                      </div>
                    </CardContent>
                  </Card>
                )}
                {hasArmacao && (
                  <Card>
                    <CardContent className="p-4">
                      <SectionHeader icon={Glasses} title="Armação" accent="bg-emerald-500/10 text-emerald-600" />
                      <div className="grid grid-cols-4 gap-2">
                        <MeasureValue value={os.ponte} label="Ponte" />
                        <MeasureValue value={os.aaVertical} label="AA" />
                        <MeasureValue value={os.caHorizontal} label="CA" />
                        <MeasureValue value={os.diametro} label="Diâm." />
                        <MeasureValue value={os.ta} label="TA" />
                        <MeasureValue value={os.md} label="MD" />
                        <MeasureValue value={os.he} label="HE" />
                        <MeasureValue value={os.st} label="ST" />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Imagens */}
            {hasImages && (
              <Card>
                <CardContent className="p-4">
                  <SectionHeader icon={Image} title="Imagens" accent="bg-pink-500/10 text-pink-600" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {os.urlImagemReceita && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <ScanLine className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">Receita</span>
                        </div>
                        <a href={os.urlImagemReceita} target="_blank" rel="noopener noreferrer">
                          <img
                            src={os.urlImagemReceita}
                            alt="Receita"
                            className="rounded-lg border max-h-[280px] object-contain w-full hover:opacity-90 transition-opacity cursor-zoom-in"
                            loading="lazy"
                          />
                        </a>
                      </div>
                    )}
                    {os.urlImagemArmacao && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Glasses className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">Armação</span>
                        </div>
                        <a href={os.urlImagemArmacao} target="_blank" rel="noopener noreferrer">
                          <img
                            src={os.urlImagemArmacao}
                            alt="Armação"
                            className="rounded-lg border max-h-[280px] object-contain w-full hover:opacity-90 transition-opacity cursor-zoom-in"
                            loading="lazy"
                          />
                        </a>
                      </div>
                    )}
                    {(os.imagemTracer || os.arquivoTracer) && (
                      <div className="sm:col-span-2 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Focus className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">Tracer</span>
                        </div>
                        <img
                          src={os.imagemTracer || os.arquivoTracer || ''}
                          alt="Tracer"
                          className="rounded-lg border max-h-[200px] object-contain w-full"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Observações */}
            {hasObs && (
              <Card>
                <CardContent className="p-4">
                  <SectionHeader icon={MessageSquareText} title="Observações" accent="bg-orange-500/10 text-orange-600" />
                  <div className="space-y-3">
                    {os.observacaoOs && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">OS</p>
                        <p className="text-sm whitespace-pre-wrap">{os.observacaoOs}</p>
                      </div>
                    )}
                    {os.observacaoLente && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Lente</p>
                        <p className="text-sm whitespace-pre-wrap">{os.observacaoLente}</p>
                      </div>
                    )}
                    {os.observacaoReceita && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Receita</p>
                        <p className="text-sm whitespace-pre-wrap">{os.observacaoReceita}</p>
                      </div>
                    )}
                    {os.observacaoPendencia && (
                      <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-1">⚠ Pendência</p>
                        <p className="text-sm whitespace-pre-wrap text-destructive">{os.observacaoPendencia}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
