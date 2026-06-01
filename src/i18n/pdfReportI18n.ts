/** Labels para HTML de PDFs (inventario, ventas, comparación). */

export type ReportPdfLabels = {
  title_inventory: string;
  title_sales_analysis: string;
  title_estimated_sales: string;
  title_sales_from_counts: string;
  title_branch_comparison: string;
  branch: string;
  date: string;
  period: string;
  generated: string;
  summary: string;
  summary_general: string;
  general_metrics: string;
  wines_in_catalog: string;
  total_bottles: string;
  total_value: string;
  inventory_detail: string;
  col_wine: string;
  col_country: string;
  col_stock: string;
  col_glass_price: string;
  col_bottle_price: string;
  col_total_value: string;
  bottles_suffix: string;
  low_stock: string;
  footer_brand: string;
  footer_generated_at: string;
  total_revenue: string;
  total_sales: string;
  wines_sold: string;
  top10_sold: string;
  col_sales: string;
  col_revenue: string;
  col_avg_price: string;
  units_abbr: string;
  bottles_sold_est: string;
  estimated_revenue: string;
  bottles_received: string;
  detail_by_wine: string;
  col_sold_est: string;
  col_received: string;
  col_last_count: string;
  col_revenue_est: string;
  footer_estimated: string;
  count_start: string;
  count_end: string;
  header_note_counts: string;
  estimated_consumption: string;
  entries: string;
  special_outs: string;
  unpriced_consumption: string;
  wines_without_price: string;
  col_st_start: string;
  col_entries: string;
  col_special_out: string;
  col_st_end: string;
  col_consumption: string;
  no_price_abbr: string;
  footer_sales_counts: string;
  best_branch: string;
  needs_improvement: string;
  total_estimated_revenue: string;
  total_estimated_consumption: string;
  detail_by_branch: string;
  col_branch: string;
  col_rev_est: string;
  col_cons: string;
  col_pct: string;
  col_most_moved: string;
  col_least_moved: string;
  col_notes: string;
  insufficient_data: string;
  footer_comparison: string;
  share_unavailable: string;
  share_dialog: string;
  na: string;
  wine_movement_fmt: string;
};

const pdfReportEs: ReportPdfLabels = {
  title_inventory: 'Reporte de inventario',
  title_sales_analysis: 'Análisis de ventas',
  title_estimated_sales: 'Ventas estimadas',
  title_sales_from_counts: 'Ventas estimadas (cortes)',
  title_branch_comparison: 'Comparativo entre sucursales',
  branch: 'Sucursal',
  date: 'Fecha',
  period: 'Periodo',
  generated: 'Generado',
  summary: 'Resumen',
  summary_general: 'Resumen general',
  general_metrics: 'Métricas generales',
  wines_in_catalog: 'Vinos en catálogo',
  total_bottles: 'Botellas totales',
  total_value: 'Valor total',
  inventory_detail: 'Detalle de inventario',
  col_wine: 'Vino',
  col_country: 'País',
  col_stock: 'Stock',
  col_glass_price: 'Precio copa',
  col_bottle_price: 'Precio botella',
  col_total_value: 'Valor total',
  bottles_suffix: 'botellas',
  low_stock: ' (bajo)',
  footer_brand: 'Cellarium · Sistema de gestión de vinos',
  footer_generated_at: '',
  total_revenue: 'Ingresos totales',
  total_sales: 'Ventas totales',
  wines_sold: 'Vinos vendidos',
  top10_sold: 'Top 10 vinos más vendidos',
  col_sales: 'Ventas',
  col_revenue: 'Ingresos',
  col_avg_price: 'Precio prom.',
  units_abbr: 'u.',
  bottles_sold_est: 'Botellas vendidas (est.)',
  estimated_revenue: 'Ingresos estimados',
  bottles_received: 'Botellas recibidas',
  detail_by_wine: 'Detalle por vino',
  col_sold_est: 'Vendidas (est.)',
  col_received: 'Recibidas',
  col_last_count: 'Último conteo',
  col_revenue_est: 'Ingresos est.',
  footer_estimated: 'Cellarium · Ventas estimadas a partir de conteos físicos',
  count_start: 'Conteo inicial',
  count_end: 'Conteo final',
  header_note_counts: 'Estimado con base en cortes físicos y movimientos registrados.',
  estimated_consumption: 'Consumo estimado',
  entries: 'Entradas',
  special_outs: 'Salidas especiales',
  unpriced_consumption: 'Consumo sin precio',
  wines_without_price: 'Vinos sin precio',
  col_st_start: 'St. ini.',
  col_entries: 'Entr.',
  col_special_out: 'Sal. esp.',
  col_st_end: 'St. fin',
  col_consumption: 'Consumo',
  no_price_abbr: '— (s/p)',
  footer_sales_counts: 'Cellarium · Ventas estimadas (cortes físicos)',
  best_branch: 'Mejor sucursal',
  needs_improvement: 'A mejorar',
  total_estimated_revenue: 'Ingresos estimados totales',
  total_estimated_consumption: 'Consumo estimado total',
  detail_by_branch: 'Detalle por sucursal',
  col_branch: 'Sucursal',
  col_rev_est: 'Ing. est.',
  col_cons: 'Cons.',
  col_pct: '%',
  col_most_moved: 'Más movido',
  col_least_moved: 'Menos movido',
  col_notes: 'Notas',
  insufficient_data: 'Datos insuficientes',
  footer_comparison: 'Cellarium · Comparativo (cortes físicos)',
  share_unavailable: 'Compartir no está disponible en este dispositivo',
  share_dialog: 'Compartir reporte · {name}',
  na: 'N/A',
  wine_movement_fmt: '{name} ({count} bot.)',
};

const pdfReportEn: ReportPdfLabels = {
  title_inventory: 'Inventory Report',
  title_sales_analysis: 'Sales Analysis',
  title_estimated_sales: 'Estimated Sales',
  title_sales_from_counts: 'Estimated Sales (counts)',
  title_branch_comparison: 'Branch Comparison',
  branch: 'Branch',
  date: 'Date',
  period: 'Period',
  generated: 'Generated',
  summary: 'Summary',
  summary_general: 'General summary',
  general_metrics: 'General metrics',
  wines_in_catalog: 'Wines in catalog',
  total_bottles: 'Total bottles',
  total_value: 'Total value',
  inventory_detail: 'Inventory detail',
  col_wine: 'Wine',
  col_country: 'Country',
  col_stock: 'Stock',
  col_glass_price: 'Glass price',
  col_bottle_price: 'Bottle price',
  col_total_value: 'Total value',
  bottles_suffix: 'bottles',
  low_stock: ' (low)',
  footer_brand: 'Cellarium · Wine management system',
  footer_generated_at: '',
  total_revenue: 'Total revenue',
  total_sales: 'Total sales',
  wines_sold: 'Wines sold',
  top10_sold: 'Top 10 best-selling wines',
  col_sales: 'Sales',
  col_revenue: 'Revenue',
  col_avg_price: 'Avg. price',
  units_abbr: 'u.',
  bottles_sold_est: 'Bottles sold (est.)',
  estimated_revenue: 'Estimated revenue',
  bottles_received: 'Bottles received',
  detail_by_wine: 'Detail by wine',
  col_sold_est: 'Sold (est.)',
  col_received: 'Received',
  col_last_count: 'Last count',
  col_revenue_est: 'Est. revenue',
  footer_estimated: 'Cellarium · Estimated sales from physical counts',
  count_start: 'Opening count',
  count_end: 'Closing count',
  header_note_counts: 'Estimated from physical counts and logged movements.',
  estimated_consumption: 'Estimated consumption',
  entries: 'Entries',
  special_outs: 'Special outs',
  unpriced_consumption: 'Consumption without price',
  wines_without_price: 'Wines without price',
  col_st_start: 'Op. st.',
  col_entries: 'In',
  col_special_out: 'Sp. out',
  col_st_end: 'Cl. st.',
  col_consumption: 'Consumption',
  no_price_abbr: '— (n/p)',
  footer_sales_counts: 'Cellarium · Estimated sales (physical counts)',
  best_branch: 'Best branch',
  needs_improvement: 'Needs improvement',
  total_estimated_revenue: 'Total estimated revenue',
  total_estimated_consumption: 'Total estimated consumption',
  detail_by_branch: 'Detail by branch',
  col_branch: 'Branch',
  col_rev_est: 'Est. rev.',
  col_cons: 'Cons.',
  col_pct: '%',
  col_most_moved: 'Most moved',
  col_least_moved: 'Least moved',
  col_notes: 'Notes',
  insufficient_data: 'Insufficient data',
  footer_comparison: 'Cellarium · Comparison (physical counts)',
  share_unavailable: 'Sharing is not available on this device',
  share_dialog: 'Share report · {name}',
  na: 'N/A',
  wine_movement_fmt: '{name} ({count} btl.)',
};

const pdfReportPtBR: ReportPdfLabels = {
  title_inventory: 'Relatório de estoque',
  title_sales_analysis: 'Análise de vendas',
  title_estimated_sales: 'Vendas estimadas',
  title_sales_from_counts: 'Vendas estimadas (contagens)',
  title_branch_comparison: 'Comparativo entre unidades',
  branch: 'Unidade',
  date: 'Data',
  period: 'Período',
  generated: 'Gerado',
  summary: 'Resumo',
  summary_general: 'Resumo geral',
  general_metrics: 'Métricas gerais',
  wines_in_catalog: 'Vinhos no catálogo',
  total_bottles: 'Garrafas totais',
  total_value: 'Valor total',
  inventory_detail: 'Detalhe do estoque',
  col_wine: 'Vinho',
  col_country: 'País',
  col_stock: 'Estoque',
  col_glass_price: 'Preço taça',
  col_bottle_price: 'Preço garrafa',
  col_total_value: 'Valor total',
  bottles_suffix: 'garrafas',
  low_stock: ' (baixo)',
  footer_brand: 'Cellarium · Sistema de gestão de vinhos',
  footer_generated_at: '',
  total_revenue: 'Receita total',
  total_sales: 'Vendas totais',
  wines_sold: 'Vinhos vendidos',
  top10_sold: 'Top 10 vinhos mais vendidos',
  col_sales: 'Vendas',
  col_revenue: 'Receita',
  col_avg_price: 'Preço méd.',
  units_abbr: 'un.',
  bottles_sold_est: 'Garrafas vendidas (est.)',
  estimated_revenue: 'Receita estimada',
  bottles_received: 'Garrafas recebidas',
  detail_by_wine: 'Detalhe por vinho',
  col_sold_est: 'Vendidas (est.)',
  col_received: 'Recebidas',
  col_last_count: 'Última contagem',
  col_revenue_est: 'Receita est.',
  footer_estimated: 'Cellarium · Vendas estimadas a partir de contagens físicas',
  count_start: 'Contagem inicial',
  count_end: 'Contagem final',
  header_note_counts: 'Estimado com base em contagens físicas e movimentos registrados.',
  estimated_consumption: 'Consumo estimado',
  entries: 'Entradas',
  special_outs: 'Saídas especiais',
  unpriced_consumption: 'Consumo sem preço',
  wines_without_price: 'Vinhos sem preço',
  col_st_start: 'Est. ini.',
  col_entries: 'Entr.',
  col_special_out: 'Saíd. esp.',
  col_st_end: 'Est. fin.',
  col_consumption: 'Consumo',
  no_price_abbr: '— (s/p)',
  footer_sales_counts: 'Cellarium · Vendas estimadas (contagens físicas)',
  best_branch: 'Melhor unidade',
  needs_improvement: 'A melhorar',
  total_estimated_revenue: 'Receita estimada total',
  total_estimated_consumption: 'Consumo estimado total',
  detail_by_branch: 'Detalhe por unidade',
  col_branch: 'Unidade',
  col_rev_est: 'Rec. est.',
  col_cons: 'Cons.',
  col_pct: '%',
  col_most_moved: 'Mais movimentado',
  col_least_moved: 'Menos movimentado',
  col_notes: 'Notas',
  insufficient_data: 'Dados insuficientes',
  footer_comparison: 'Cellarium · Comparativo (contagens físicas)',
  share_unavailable: 'Compartilhamento não disponível neste dispositivo',
  share_dialog: 'Compartilhar relatório · {name}',
  na: 'N/D',
  wine_movement_fmt: '{name} ({count} gar.)',
};

export const pdfReportI18nEs: Record<string, string> = pdfReportEs as unknown as Record<string, string>;
export const pdfReportI18nEn: Record<string, string> = pdfReportEn as unknown as Record<string, string>;
export const pdfReportI18nPtBR: Record<string, string> = pdfReportPtBR as unknown as Record<string, string>;

export function getReportPdfLabelsForLanguage(language: 'es' | 'en' | 'pt-BR'): ReportPdfLabels {
  if (language === 'en') return pdfReportEn;
  if (language === 'pt-BR') return pdfReportPtBR;
  return pdfReportEs;
}
