import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FinanceiroDashboard() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Financeiro – Contas a Pagar / Receber</h1>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <p className="text-muted-foreground">Página em construção...</p>
      </main>
    </div>
  );
}
