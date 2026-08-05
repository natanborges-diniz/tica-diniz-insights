// Texto de um PDF, com as linhas reconstruídas.
//
// O PDF não guarda linhas: guarda pedaços de texto com coordenadas. Concatenar
// os pedaços na ordem em que aparecem no arquivo produz uma sopa onde
// "356.961.978-84" pode acabar longe do nome a que pertence — e o parser da
// folha depende justamente de nome, CPF e valor estarem na mesma linha.
//
// Por isso a montagem é por posição: agrupa pelo Y, ordena pelo X e só insere
// espaço onde havia espaço de verdade. Sem isso, "3.290," e "14" viravam
// "3.290, 14" e o valor do salário se perdia.
//
// `montarLinhas` é pura e testada; `extrairTextoPdf` é a casca que fala com o
// pdf.js.

export interface ItemTextoPdf {
  str: string;
  /** Coordenada horizontal do início do pedaço. */
  x: number;
  /** Coordenada vertical da linha de base. No PDF, cresce para cima. */
  y: number;
  /** Largura renderizada — usada para saber se havia espaço até o próximo. */
  width?: number;
}

/**
 * Agrupa os pedaços em linhas.
 *
 * `toleranciaY` existe porque a linha de base oscila alguns centésimos entre
 * fontes diferentes na mesma linha (negrito do rótulo, normal do valor), e
 * comparar Y por igualdade quebraria cada linha em duas.
 */
export function montarLinhas(itens: ItemTextoPdf[], toleranciaY = 2): string[] {
  const limpos = itens.filter((i) => i && typeof i.str === "string");
  if (limpos.length === 0) return [];

  // Y decrescente: no PDF a origem é embaixo, então a primeira linha da página
  // é a de maior Y.
  const grupos: Array<{ y: number; itens: ItemTextoPdf[] }> = [];
  for (const item of [...limpos].sort((a, b) => b.y - a.y)) {
    const atual = grupos[grupos.length - 1];
    if (atual && Math.abs(atual.y - item.y) <= toleranciaY) {
      atual.itens.push(item);
    } else {
      grupos.push({ y: item.y, itens: [item] });
    }
  }

  const linhas: string[] = [];
  for (const g of grupos) {
    const ordenados = g.itens.sort((a, b) => a.x - b.x);
    let texto = "";
    let fimAnterior: number | null = null;

    for (const item of ordenados) {
      if (item.str === "") continue;
      // Espaço só onde havia distância. O limiar de 1 unidade é folgado o
      // bastante para o kerning e apertado o bastante para não colar colunas.
      if (fimAnterior !== null && item.x - fimAnterior > 1) texto += " ";
      texto += item.str;
      fimAnterior = item.x + (item.width ?? 0);
    }

    const final = texto.replace(/\s+/g, " ").trim();
    if (final) linhas.push(final);
  }

  return linhas;
}

/**
 * Lê o PDF escolhido pelo operador e devolve o texto já em linhas.
 *
 * O pdf.js entra por import dinâmico: é uma biblioteca grande, e quem nunca
 * importa folha não deve pagar o download dela.
 */
export async function extrairTextoPdf(arquivo: File | ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer();
  // A tarefa de carregamento é quem guarda o worker: é nela que se chama
  // destroy() para não deixar um worker vivo por PDF aberto.
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await tarefa.promise;

  const paginas: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const conteudo = await pagina.getTextContent();
      const itens: ItemTextoPdf[] = conteudo.items
        .filter((i): i is typeof i & { str: string; transform: number[]; width: number } =>
          typeof (i as { str?: unknown }).str === "string")
        .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width }));
      paginas.push(montarLinhas(itens).join("\n"));
    }
  } finally {
    await tarefa.destroy();
  }

  // Relatório com várias páginas: as linhas de colaborador de todas elas
  // precisam chegar juntas ao parser, senão a folha sai pela metade.
  return paginas.join("\n");
}
