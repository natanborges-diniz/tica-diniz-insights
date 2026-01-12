// src/components/ui/exportable-card.tsx
// Card wrapper que adiciona opções de exportação visual (imagem/PDF)

import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Image, FileText, Loader2 } from 'lucide-react';
import { exportToImage, exportVisualToPDF } from '@/utils/exportVisual';
import { toast } from 'sonner';

interface ExportableCardProps {
  title: string;
  filename: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  actions?: React.ReactNode;
}

export function ExportableCard({
  title,
  filename,
  icon,
  children,
  className = '',
  headerClassName = '',
  contentClassName = '',
  actions,
}: ExportableCardProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExportImage = async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      await exportToImage(contentRef.current, { filename, title });
      toast.success('Imagem exportada com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar imagem');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      await exportVisualToPDF(contentRef.current, { filename, title });
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className={`flex flex-row items-center justify-between ${headerClassName}`}>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {actions}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={exporting}>
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportImage}>
                <Image className="h-4 w-4 mr-2" />
                Exportar Imagem
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF}>
                <FileText className="h-4 w-4 mr-2" />
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent ref={contentRef} className={contentClassName}>
        {children}
      </CardContent>
    </Card>
  );
}
