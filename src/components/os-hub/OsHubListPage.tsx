// src/components/os-hub/OsHubListPage.tsx
// Tela 1 — Grid de exploração de OS

import React, { useState } from 'react';
import { useOsHub, OsHubFilters } from '@/hooks/useOsHub';
import { useEmpresas } from '@/hooks/useEmpresas';
import { OsHubRecord } from '@/services/osHubService';
import { detectSupplier, getSupplierBadgeInfo } from '@/services/hoyaMatchingService';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  RefreshCw, Search, Info, Eye, Image, FileText,
  ChevronLeft, ChevronRight, Database, Download,
} from 'lucide-react';
import { OsHubDetailSheet } from './OsHubDetailSheet';

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

export const OsHubListPage: React.FC = () => {
  const hub = useOsHub();
  const { empresas, isLoading: loadingEmpresas } = useEmpresas();
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | 'ALL' | null>(null);
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [dataLoaded, setDataLoaded] = useState(false);

  const handleLoadCache = async () => {
    if (!selectedEmpresa) return;
    await hub.loadCache({ codEmpresa: selectedEmpresa, dataInicio, dataFim });
    setDataLoaded(true);
  };

  const handleSync = async () => {
    if (!selectedEmpresa) return;
    await hub.syncFromFirebird({ empresa: selectedEmpresa, dataInicio, dataFim });
    setDataLoaded(true);
  };

  const handleOpenDetail = (os: OsHubRecord) => {
    hub.setSelectedOs(os);
  };

  const formatDate = (v: string | null) => {
    if (!v) return '-';
    try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return '-'; }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const showEmptyState = !dataLoaded && !hub.loading && !hub.syncing;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hub de Receitas (OS)</h1>
          <p className="text-sm text-muted-foreground">
            Exploração e autorização de ordens de serviço com receita completa
          </p>
        </div>
        {hub.cacheStats.total > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="h-3 w-3" />
            <span>{hub.cacheStats.total} OS em cache</span>
            {hub.cacheStats.lastUpdate && (
              <span>• Último sync: {formatDate(hub.cacheStats.lastUpdate)}</span>
            )}
          </div>
        )}
      </div>

      {/* Estado inicial */}
      {showEmptyState && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Info className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="text-lg mb-2">Selecione empresa e período</CardTitle>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
              Escolha a empresa e o período para carregar as OS do cache ou sincronizar com o ERP.
            </p>
            <div className="flex flex-col gap-4 w-full max-w-lg">
              <div className="flex flex-col sm:flex-row gap-3">
                <Select
                  value={selectedEmpresa?.toString() ?? ''}
                  onValueChange={(v) => setSelectedEmpresa(v === 'ALL' ? 'ALL' : v ? Number(v) : null)}
                  disabled={loadingEmpresas}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={loadingEmpresas ? 'Carregando...' : 'Empresa'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas as empresas</SelectItem>
                    {empresas.map(e => (
                      <SelectItem key={e.codEmpresa} value={e.codEmpresa.toString()}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3">
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={handleLoadCache} disabled={!selectedEmpresa || hub.loading}>
                  <Database className="h-4 w-4 mr-2" />
                  Carregar Cache
                </Button>
                <Button variant="outline" onClick={handleSync} disabled={!selectedEmpresa || hub.syncing}>
                  <Download className="h-4 w-4 mr-2" />
                  {hub.syncing ? 'Sincronizando...' : 'Sincronizar ERP'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toolbar de filtros */}
      {dataLoaded && (
        <>
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-3 items-center">
                {/* Busca */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por OS, cliente ou código..."
                    value={hub.filters.busca}
                    onChange={e => hub.setFilters(f => ({ ...f, busca: e.target.value }))}
                    className="pl-9"
                  />
                </div>

                {/* Status */}
                <Select
                  value={hub.filters.status}
                  onValueChange={v => hub.setFilters(f => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    <SelectItem value="ATRASADAS">Atrasadas</SelectItem>
                    <SelectItem value="NO_PRAZO">No Prazo</SelectItem>
                    <SelectItem value="ATRASO">Atraso</SelectItem>
                    <SelectItem value="ATRASO_LEVE">Atraso Leve</SelectItem>
                    <SelectItem value="SEM_DATA">Sem Data</SelectItem>
                    <SelectItem value="ENTREGUE">Entregue</SelectItem>
                  </SelectContent>
                </Select>

                {/* Etapa */}
                <Select
                  value={hub.filters.etapa}
                  onValueChange={v => hub.setFilters(f => ({ ...f, etapa: v }))}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODAS">Todas</SelectItem>
                    {hub.etapasUnicas.map(e => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Tem Receita */}
                <Select
                  value={hub.filters.temReceita}
                  onValueChange={v => hub.setFilters(f => ({ ...f, temReceita: v as OsHubFilters['temReceita'] }))}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Receita" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Receita: Todos</SelectItem>
                    <SelectItem value="SIM">Com Receita</SelectItem>
                    <SelectItem value="NAO">Sem Receita</SelectItem>
                  </SelectContent>
                </Select>

                {/* Tem Imagem */}
                <Select
                  value={hub.filters.temImagem}
                  onValueChange={v => hub.setFilters(f => ({ ...f, temImagem: v as OsHubFilters['temImagem'] }))}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Imagem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Imagem: Todos</SelectItem>
                    <SelectItem value="SIM">Com Imagem</SelectItem>
                    <SelectItem value="NAO">Sem Imagem</SelectItem>
                  </SelectContent>
                </Select>

                {/* Sync / Reload */}
                <Button variant="outline" size="sm" onClick={handleSync} disabled={hub.syncing}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${hub.syncing ? 'animate-spin' : ''}`} />
                  Sync
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Resumo rápido */}
          <div className="flex gap-2 text-sm text-muted-foreground">
            <span>{hub.allData.length} OS encontradas</span>
            <span>•</span>
            <span>{hub.allData.filter(os => os.temReceita).length} com receita</span>
            <span>•</span>
            <span>{hub.allData.filter(os => os.temImagem).length} com imagem</span>
          </div>
        </>
      )}

      {/* Loading */}
      {(hub.loading || hub.syncing) && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {hub.syncing ? 'Sincronizando com ERP...' : 'Carregando OS...'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      {dataLoaded && !hub.loading && !hub.syncing && hub.data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">OS</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Atraso</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center w-[60px]">
                      <FileText className="h-4 w-4 mx-auto" />
                    </TableHead>
                    <TableHead className="text-center w-[60px]">
                      <Image className="h-4 w-4 mx-auto" />
                    </TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hub.data.map(os => (
                    <TableRow key={os.codOs} className="hover:bg-muted/50 cursor-pointer" onClick={() => handleOpenDetail(os)}>
                      <TableCell className="font-medium">{os.numeroOs || os.codOs}</TableCell>
                      <TableCell className="text-sm">{os.empresa || '-'}</TableCell>
                      <TableCell>
                        {(() => {
                          const supplier = detectSupplier(os.lenteOdDescricao || os.lenteOeDescricao);
                          const badge = getSupplierBadgeInfo(supplier);
                          return badge ? (
                            <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                              {badge.label}
                            </Badge>
                          ) : <span className="text-muted-foreground text-xs">-</span>;
                        })()}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={os.cliente}>
                        {os.cliente || '-'}
                      </TableCell>
                      <TableCell className="text-sm">{os.etapa || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[os.statusAtraso] || statusColors.SEM_DATA}>
                          {statusLabels[os.statusAtraso] || os.statusAtraso}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {os.statusAtraso === 'ENTREGUE' ? '-' : (
                          <span className={os.atrasoDias > 0 ? 'text-destructive font-medium' : ''}>
                            {os.atrasoDias}d
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(os.total)}</TableCell>
                      <TableCell className="text-center">
                        {os.temReceita ? (
                          <FileText className="h-4 w-4 text-emerald-600 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {os.temImagem ? (
                          <Image className="h-4 w-4 text-blue-600 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleOpenDetail(os); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Paginação */}
            {hub.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Página {hub.page + 1} de {hub.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => hub.setPage(p => Math.max(0, p - 1))} disabled={hub.page === 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => hub.setPage(p => Math.min(hub.totalPages - 1, p + 1))} disabled={hub.page >= hub.totalPages - 1}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state após carregar */}
      {dataLoaded && !hub.loading && !hub.syncing && hub.allData.length === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center">
            <Info className="h-8 w-8 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma OS encontrada. Tente sincronizar com o ERP.</p>
          </CardContent>
        </Card>
      )}

      {/* Detalhe Sheet */}
      <OsHubDetailSheet
        os={hub.selectedOs}
        onClose={() => hub.setSelectedOs(null)}
      />
    </div>
  );
};
