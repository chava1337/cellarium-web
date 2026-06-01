import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { InventoryItem, InventoryStats, EstimatedSalesRow, SalesFromCountsRow, SalesFromCountsSummary, BranchComparisonRow, BranchComparisonSummary } from './InventoryService';
import { WineMetrics, BranchMetrics } from './AnalyticsService';
import { isValidPrice, formatCurrencyMXN } from '../utils/wineCatalogUtils';
import { captureCriticalError, sentryFlowBreadcrumb } from '../utils/sentryContext';
import { getReportPdfLabelsForLanguage, type ReportPdfLabels } from '../i18n/pdfReportI18n';
import { formatReportDate, formatReportDateTime, type ReportPdfContext } from '../utils/reportPdfContext';

const defaultPdfCtx = (): ReportPdfContext => ({
  localeTag: 'es-MX',
  labels: getReportPdfLabelsForLanguage('es'),
});

/**
 * CSS compartido para PDF vía expo-print (WebKit). Objetivos: A4, KPIs estables, tablas legibles.
 * Grid evitado en KPIs (flex + wrap); thead repetible donde el motor lo soporte.
 */
const REPORT_PRINT_CSS = `
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.4;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
  }
  .doc-topbar {
    height: 4px;
    background: #8B0000;
    margin: 0 0 14px 0;
    page-break-after: avoid;
  }
  .report-header {
    page-break-after: avoid;
    page-break-inside: avoid;
    margin-bottom: 18px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e5e5e5;
  }
  .report-header h1 {
    margin: 0 0 6px 0;
    font-size: 17pt;
    font-weight: 700;
    color: #8B0000;
    letter-spacing: -0.02em;
  }
  .report-header .meta {
    margin: 4px 0 0 0;
    font-size: 9.5pt;
    color: #444;
  }
  .report-header .meta strong { color: #222; }
  .section-title {
    margin: 20px 0 10px 0;
    font-size: 11pt;
    font-weight: 700;
    color: #333;
    page-break-after: avoid;
  }
  .kpi-block {
    background: #f7f7f8;
    border: 1px solid #e8e8e8;
    border-radius: 4px;
    padding: 12px 14px;
    margin-bottom: 16px;
    page-break-inside: avoid;
  }
  .kpi-block h2 {
    margin: 0 0 10px 0;
    font-size: 10pt;
    font-weight: 700;
    color: #444;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kpi-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .kpi {
    flex: 1 1 28%;
    min-width: 110px;
    border: 1px solid #ddd;
    border-left: 3px solid #8B0000;
    padding: 10px 12px;
    background: #fff;
    text-align: center;
    page-break-inside: avoid;
  }
  .kpi-row.kpi-row-4 .kpi { flex: 1 1 21%; min-width: 100px; }
  .kpi-stack .kpi {
    flex: none;
    width: 100%;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .kpi-stack .kpi .stat-label { text-align: left; margin-bottom: 0; flex-shrink: 0; }
  .kpi-stack .kpi .stat-value {
    text-align: right;
    max-width: 58%;
    word-break: break-word;
    font-size: 11pt;
    font-weight: 600;
    color: #333;
  }
  .kpi-stack .kpi .stat-value.emphasis {
    color: #8B0000;
    font-size: 14pt;
    font-weight: 700;
  }
  .stat-value {
    font-size: 14pt;
    font-weight: 700;
    color: #8B0000;
    line-height: 1.2;
  }
  .stat-label {
    font-size: 8pt;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-top: 4px;
  }
  .header-note { font-size: 9pt; color: #666; margin-top: 8px; font-style: italic; }
  .note-inline { margin-top: 10px; font-size: 9pt; color: #555; }
  table.report-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 9pt;
  }
  table.report-table thead { display: table-header-group; }
  table.report-table tfoot { display: table-footer-group; }
  table.report-table th {
    background: #8B0000;
    color: #fff;
    padding: 8px 6px;
    text-align: left;
    font-weight: 600;
    font-size: 8.5pt;
    border: 1px solid #6d0000;
  }
  table.report-table td {
    padding: 7px 6px;
    border: 1px solid #ddd;
    vertical-align: top;
  }
  table.report-table tbody tr:nth-child(even) { background: #fafafa; }
  table.report-table tbody tr { page-break-inside: avoid; }
  table.report-table.table-tight td { font-size: 8.5pt; padding: 5px 4px; }
  .low-stock { color: #b00020; font-weight: 600; }
  .wine-sub { display: block; font-size: 8.5pt; color: #555; margin-top: 2px; font-weight: normal; }
  .doc-footer {
    margin-top: 22px;
    padding-top: 10px;
    border-top: 1px solid #e5e5e5;
    text-align: center;
    font-size: 8pt;
    color: #888;
    page-break-inside: avoid;
  }
`;

export type { ReportPdfContext, ReportPdfLabels };

function fmtWineMovement(labels: ReportPdfLabels, name: string, count: number): string {
  return labels.wine_movement_fmt.replace('{name}', name).replace('{count}', String(count));
}

function shareDialogTitle(labels: ReportPdfLabels, name: string): string {
  return labels.share_dialog.replace('{name}', name);
}

/**
 * Reportes: HTML como plantilla → PDF binario vía expo-print → compartir con expo-sharing.
 */
export class PDFReportService {
  /**
   * Generar reporte de inventario en formato HTML (para convertir a PDF)
   */
  static async generateInventoryReport(
    branchName: string,
    inventory: InventoryItem[],
    stats: InventoryStats | null,
    ctx: ReportPdfContext = defaultPdfCtx()
  ): Promise<string> {
    const L = ctx.labels;
    const date = formatReportDate(ctx.localeTag);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>${REPORT_PRINT_CSS}</style>
      </head>
      <body>
        <div class="doc-topbar"></div>
        <div class="report-header">
          <h1>${L.title_inventory}</h1>
          <p class="meta"><strong>${L.branch}:</strong> ${branchName}</p>
          <p class="meta"><strong>${L.date}:</strong> ${date}</p>
        </div>

        ${stats ? `
        <div class="kpi-block">
          <h2>${L.summary_general}</h2>
          <div class="kpi-row">
            <div class="kpi">
              <div class="stat-value">${stats.totalWines}</div>
              <div class="stat-label">${L.wines_in_catalog}</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${stats.totalBottles}</div>
              <div class="stat-label">${L.total_bottles}</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${stats.totalValue > 0 ? `$${stats.totalValue.toFixed(2)}` : '—'}</div>
              <div class="stat-label">${L.total_value}</div>
            </div>
          </div>
        </div>
        ` : ''}

        <h2 class="section-title">${L.inventory_detail}</h2>
        <table class="report-table">
          <thead>
            <tr>
              <th>${L.col_wine}</th>
              <th>${L.col_country}</th>
              <th>${L.col_stock}</th>
              <th>${L.col_glass_price}</th>
              <th>${L.col_bottle_price}</th>
              <th>${L.col_total_value}</th>
            </tr>
          </thead>
          <tbody>
            ${inventory.map(item => {
              const bottlePrice = item.price_by_bottle;
              const glassPrice = item.price_by_glass;
              const bottleDisplay = isValidPrice(bottlePrice) ? `$${Number(bottlePrice).toFixed(2)}` : L.na;
              const glassDisplay = isValidPrice(glassPrice) ? `$${Number(glassPrice).toFixed(2)}` : L.na;
              const valueDisplay = isValidPrice(bottlePrice) ? `$${(item.stock_quantity * bottlePrice).toFixed(2)}` : '—';
              const lowSuffix = item.stock_quantity < 5 ? L.low_stock : '';
              return `
              <tr>
                <td>
                  <strong>${item.wines.name}</strong>
                  <span class="wine-sub">${item.wines.grape_variety ?? ''}</span>
                </td>
                <td>${item.wines.country}</td>
                <td ${item.stock_quantity < 5 ? 'class="low-stock"' : ''}>
                  ${item.stock_quantity} ${L.bottles_suffix}${lowSuffix}
                </td>
                <td>${glassDisplay}</td>
                <td>${bottleDisplay}</td>
                <td>${valueDisplay}</td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>

        <div class="doc-footer">
          <p>${L.footer_brand}</p>
          <p>${formatReportDateTime(ctx.localeTag)}</p>
        </div>
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Generar reporte de análisis de ventas en formato HTML
   */
  static async generateSalesReport(
    branchName: string,
    metrics: BranchMetrics,
    wineMetrics: WineMetrics[],
    ctx: ReportPdfContext = defaultPdfCtx()
  ): Promise<string> {
    const L = ctx.labels;
    const date = formatReportDate(ctx.localeTag);

    const topWines = wineMetrics
      .sort((a, b) => b.total_sales - a.total_sales)
      .slice(0, 10);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>${REPORT_PRINT_CSS}</style>
      </head>
      <body>
        <div class="doc-topbar"></div>
        <div class="report-header">
          <h1>${L.title_sales_analysis}</h1>
          <p class="meta"><strong>${L.branch}:</strong> ${branchName}</p>
          <p class="meta"><strong>${L.date}:</strong> ${date}</p>
        </div>

        <div class="kpi-block">
          <h2>${L.general_metrics}</h2>
          <div class="kpi-row">
            <div class="kpi">
              <div class="stat-value">$${metrics.total_revenue.toFixed(2)}</div>
              <div class="stat-label">${L.total_revenue}</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${metrics.total_sales}</div>
              <div class="stat-label">${L.total_sales}</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${metrics.unique_wines_sold}</div>
              <div class="stat-label">${L.wines_sold}</div>
            </div>
          </div>
        </div>

        <h2 class="section-title">${L.top10_sold}</h2>
        <table class="report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>${L.col_wine}</th>
              <th>${L.col_country}</th>
              <th>${L.col_sales}</th>
              <th>${L.col_revenue}</th>
              <th>${L.col_avg_price}</th>
            </tr>
          </thead>
          <tbody>
            ${topWines.map((wine, index) => `
              <tr>
                <td><strong>${index + 1}</strong></td>
                <td>
                  <strong>${wine.wine_name}</strong>
                  <span class="wine-sub">${wine.grape_variety ?? ''}</span>
                </td>
                <td>${wine.country}</td>
                <td>${wine.total_sales} ${L.units_abbr}</td>
                <td>$${wine.total_revenue.toFixed(2)}</td>
                <td>$${wine.avg_price.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="doc-footer">
          <p>${L.footer_brand}</p>
          <p>${formatReportDateTime(ctx.localeTag)}</p>
        </div>
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Renderiza HTML a PDF con expo-print y comparte el archivo (mismo HTML que los generadores).
   */
  static async printHtmlAndSharePdf(
    html: string,
    filenameBase: string,
    ctx: ReportPdfContext = defaultPdfCtx()
  ): Promise<void> {
    const L = ctx.labels;
    sentryFlowBreadcrumb('pdf_export_start', { filename_base: filenameBase });
    try {
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      const safeBase =
        filenameBase
          .replace(/[^a-zA-Z0-9._-]+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '') || 'cellarium_report';
      const truncated = safeBase.length > 80 ? safeBase.slice(0, 80) : safeBase;
      const destUri = `${FileSystem.documentDirectory}${truncated}.pdf`;

      let shareUri = uri;
      try {
        const existing = await FileSystem.getInfoAsync(destUri);
        if (existing.exists) {
          await FileSystem.deleteAsync(destUri, { idempotent: true });
        }
        await FileSystem.copyAsync({ from: uri, to: destUri });
        shareUri = destUri;
      } catch {
        /* expo-print ya dejó un PDF válido en cache; compartimos ese URI si la copia falla */
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        throw new Error(L.share_unavailable);
      }

      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: shareDialogTitle(L, truncated),
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      if (__DEV__) console.error('Error generating/sharing PDF report:', error);
      captureCriticalError(error, {
        feature: 'pdf_export',
        screen: 'PDFReportService',
        app_area: 'reports',
        filename_base: filenameBase,
      });
      throw error;
    }
  }

  /**
   * Generar y compartir reporte de inventario
   */
  static async exportInventoryReport(
    branchName: string,
    inventory: InventoryItem[],
    stats: InventoryStats | null,
    ctx?: ReportPdfContext
  ): Promise<void> {
    const pdfCtx = ctx ?? defaultPdfCtx();
    try {
      const html = await this.generateInventoryReport(branchName, inventory, stats, pdfCtx);
      const filename = `inventario_${branchName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename, pdfCtx);
    } catch (error) {
      if (__DEV__) console.error('Error exporting inventory report:', error);
      throw error;
    }
  }

  /**
   * Resumen para reporte de ventas estimadas
   */
  static generateEstimatedSalesReport(
    branchName: string,
    period: { from: string; to: string; label: string },
    rows: EstimatedSalesRow[],
    summary: { total_sold_estimated: number; total_revenue_estimated: number | null; total_received: number },
    ctx: ReportPdfContext = defaultPdfCtx()
  ): string {
    const L = ctx.labels;
    const date = formatReportDate(ctx.localeTag);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>${REPORT_PRINT_CSS}</style>
      </head>
      <body>
        <div class="doc-topbar"></div>
        <div class="report-header">
          <h1>${L.title_estimated_sales}</h1>
          <p class="meta"><strong>${L.branch}:</strong> ${branchName}</p>
          <p class="meta"><strong>${L.period}:</strong> ${period.label}</p>
          <p class="meta"><strong>${L.generated}:</strong> ${date}</p>
        </div>
        <div class="kpi-block">
          <h2>${L.summary}</h2>
          <div class="kpi-row">
            <div class="kpi">
              <div class="stat-value">${summary.total_sold_estimated}</div>
              <div class="stat-label">${L.bottles_sold_est}</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${summary.total_revenue_estimated != null ? `$${summary.total_revenue_estimated.toFixed(2)}` : '—'}</div>
              <div class="stat-label">${L.estimated_revenue}</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${summary.total_received}</div>
              <div class="stat-label">${L.bottles_received}</div>
            </div>
          </div>
        </div>
        <h2 class="section-title">${L.detail_by_wine}</h2>
        <table class="report-table">
          <thead>
            <tr>
              <th>${L.col_wine}</th>
              <th>${L.col_sold_est}</th>
              <th>${L.col_received}</th>
              <th>${L.col_last_count}</th>
              <th>${L.col_revenue_est}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${r.wine_name}</td>
                <td>${r.sold_estimated_total}</td>
                <td>${r.received_total}</td>
                <td>${r.last_count_at ? formatReportDate(ctx.localeTag, new Date(r.last_count_at)) : '—'}</td>
                <td>${r.revenue_estimated != null ? `$${r.revenue_estimated.toFixed(2)}` : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="doc-footer">
          <p>${L.footer_estimated}</p>
        </div>
      </body>
      </html>
    `;
    return html;
  }

  /**
   * Generar y compartir reporte de ventas estimadas (conteos)
   */
  static async exportEstimatedSalesReport(
    branchName: string,
    period: { from: string; to: string; label: string },
    rows: EstimatedSalesRow[],
    summary: { total_sold_estimated: number; total_revenue_estimated: number | null; total_received: number },
    ctx?: ReportPdfContext
  ): Promise<void> {
    const pdfCtx = ctx ?? defaultPdfCtx();
    try {
      const html = this.generateEstimatedSalesReport(branchName, period, rows, summary, pdfCtx);
      const filename = `ventas_estimadas_${branchName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename, pdfCtx);
    } catch (error) {
      if (__DEV__) console.error('Error exporting estimated sales report:', error);
      throw error;
    }
  }

  /**
   * Reporte de ventas estimadas desde cortes (misma lógica que pestaña Ventas estimadas).
   * Columnas: Stock inicio, Entradas, Salidas especiales, Stock fin, Consumo estimado, Ingresos estimados.
   */
  static generateSalesFromCountsReport(
    branchName: string,
    period: { from: string; to: string; label: string },
    rows: SalesFromCountsRow[],
    summary: SalesFromCountsSummary,
    ctx: ReportPdfContext = defaultPdfCtx()
  ): string {
    const L = ctx.labels;
    const date = formatReportDate(ctx.localeTag);
    const startAt = summary.count_start_at ? formatReportDate(ctx.localeTag, new Date(summary.count_start_at)) : '—';
    const endAt = summary.count_end_at ? formatReportDate(ctx.localeTag, new Date(summary.count_end_at)) : '—';
    const revenueStr = summary.total_revenue_estimated != null && isValidPrice(summary.total_revenue_estimated)
      ? formatCurrencyMXN(summary.total_revenue_estimated)
      : '—';
    const unpricedTotal = summary.unpriced_consumption_total ?? 0;
    const unpricedCount = summary.unpriced_wines_count ?? 0;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>${REPORT_PRINT_CSS}</style>
      </head>
      <body>
        <div class="doc-topbar"></div>
        <div class="report-header">
          <h1>${L.title_sales_from_counts}</h1>
          <p class="meta"><strong>${L.branch}:</strong> ${branchName}</p>
          <p class="meta"><strong>${L.period}:</strong> ${period.label}</p>
          <p class="meta"><strong>${L.count_start}:</strong> ${startAt} · <strong>${L.count_end}:</strong> ${endAt}</p>
          <p class="header-note">${L.header_note_counts}</p>
          <p class="meta"><strong>${L.generated}:</strong> ${date}</p>
        </div>
        <div class="kpi-block">
          <h2>${L.summary}</h2>
          <div class="kpi-row kpi-row-4">
            <div class="kpi">
              <div class="stat-value">${summary.total_sold_estimated}</div>
              <div class="stat-label">${L.estimated_consumption}</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${revenueStr}</div>
              <div class="stat-label">${L.estimated_revenue}</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${summary.total_entries}</div>
              <div class="stat-label">${L.entries}</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${summary.total_special_outs}</div>
              <div class="stat-label">${L.special_outs}</div>
            </div>
          </div>
          ${unpricedTotal > 0 || unpricedCount > 0 ? `
          <p class="note-inline">
            <strong>${L.unpriced_consumption}:</strong> ${unpricedTotal} ${L.bottles_suffix}
            ${unpricedCount > 0 ? ` · <strong>${L.wines_without_price}:</strong> ${unpricedCount}` : ''}
          </p>
          ` : ''}
        </div>
        <h2 class="section-title">${L.detail_by_wine}</h2>
        <table class="report-table table-tight">
          <thead>
            <tr>
              <th>${L.col_wine}</th>
              <th>${L.col_st_start}</th>
              <th>${L.col_entries}</th>
              <th>${L.col_special_out}</th>
              <th>${L.col_st_end}</th>
              <th>${L.col_consumption}</th>
              <th>${L.col_revenue}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const hasPrice = r.revenue_estimated != null && isValidPrice(r.revenue_estimated);
              const revStr = hasPrice ? formatCurrencyMXN(r.revenue_estimated!) : '—';
              const revCell = hasPrice ? revStr : (r.sold_estimated > 0 ? L.no_price_abbr : '—');
              return `
              <tr>
                <td>${r.wine_name}</td>
                <td>${r.start_count}</td>
                <td>${r.entries_total}</td>
                <td>${r.special_out_total}</td>
                <td>${r.end_count}</td>
                <td>${r.sold_estimated}</td>
                <td>${revCell}</td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
        <div class="doc-footer">
          <p>${L.footer_sales_counts}</p>
        </div>
      </body>
      </html>
    `;
    return html;
  }

  static async exportSalesFromCountsReport(
    branchName: string,
    period: { from: string; to: string; label: string },
    rows: SalesFromCountsRow[],
    summary: SalesFromCountsSummary,
    ctx?: ReportPdfContext
  ): Promise<void> {
    const pdfCtx = ctx ?? defaultPdfCtx();
    try {
      const html = this.generateSalesFromCountsReport(branchName, period, rows, summary, pdfCtx);
      const filename = `ventas_cortes_${branchName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename, pdfCtx);
    } catch (error) {
      if (__DEV__) console.error('Error exporting sales from counts report:', error);
      throw error;
    }
  }

  /**
   * Reporte comparativo entre sucursales (misma lógica que Ventas estimadas, desde cortes).
   */
  static generateBranchComparisonReport(
    period: { from: string; to: string; label: string },
    branches: BranchComparisonRow[],
    summary: BranchComparisonSummary,
    ctx: ReportPdfContext = defaultPdfCtx()
  ): string {
    const L = ctx.labels;
    const date = formatReportDate(ctx.localeTag);
    const totalRevenue = summary.total_revenue_estimated ?? 0;
    const revenueStr = totalRevenue > 0 ? formatCurrencyMXN(totalRevenue) : '—';
    const sortedBranches = [...branches].sort((a, b) => (b.total_revenue_estimated ?? 0) - (a.total_revenue_estimated ?? 0));

    const rowsHtml = sortedBranches.map((branch, index) => {
      const hasData = branch.valid_wines_count > 0;
      const revStr = hasData && (branch.total_revenue_estimated ?? 0) > 0 ? formatCurrencyMXN(branch.total_revenue_estimated!) : '—';
      const contributionPct = totalRevenue > 0 && (branch.total_revenue_estimated ?? 0) >= 0
        ? ((branch.total_revenue_estimated ?? 0) / totalRevenue) * 100
        : 0;
      const status = hasData ? '' : L.insufficient_data;
      const topWine = branch.top_wine ? fmtWineMovement(L, branch.top_wine.wine_name, branch.top_wine.sold_estimated) : '—';
      const bottomWine = branch.bottom_wine ? fmtWineMovement(L, branch.bottom_wine.wine_name, branch.bottom_wine.sold_estimated) : '—';
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${branch.branch_name}</td>
          <td>${revStr}</td>
          <td>${hasData ? branch.total_consumption_estimated : '—'}</td>
          <td>${totalRevenue > 0 ? contributionPct.toFixed(1) + '%' : '—'}</td>
          <td>${topWine}</td>
          <td>${bottomWine}</td>
          <td>${status}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>${REPORT_PRINT_CSS}</style>
      </head>
      <body>
        <div class="doc-topbar"></div>
        <div class="report-header">
          <h1>${L.title_branch_comparison}</h1>
          <p class="meta"><strong>${L.period}:</strong> ${period.label}</p>
          <p class="header-note">${L.header_note_counts}</p>
          <p class="meta"><strong>${L.generated}:</strong> ${date}</p>
        </div>
        <div class="kpi-block">
          <h2>${L.summary}</h2>
          <div class="kpi-row kpi-stack">
            <div class="kpi">
              <span class="stat-label">${L.best_branch}</span>
              <div class="stat-value">${summary.best_branch}</div>
            </div>
            <div class="kpi">
              <span class="stat-label">${L.needs_improvement}</span>
              <div class="stat-value">${summary.worst_branch}</div>
            </div>
            <div class="kpi">
              <span class="stat-label">${L.total_estimated_revenue}</span>
              <div class="stat-value emphasis">${revenueStr}</div>
            </div>
            <div class="kpi">
              <span class="stat-label">${L.total_estimated_consumption}</span>
              <div class="stat-value emphasis">${summary.total_consumption_estimated}</div>
            </div>
          </div>
        </div>
        <h2 class="section-title">${L.detail_by_branch}</h2>
        <table class="report-table table-tight">
          <thead>
            <tr>
              <th>#</th>
              <th>${L.col_branch}</th>
              <th>${L.col_rev_est}</th>
              <th>${L.col_cons}</th>
              <th>${L.col_pct}</th>
              <th>${L.col_most_moved}</th>
              <th>${L.col_least_moved}</th>
              <th>${L.col_notes}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="doc-footer">
          <p>${L.footer_comparison}</p>
        </div>
      </body>
      </html>
    `;
    return html;
  }

  static async exportBranchComparisonReport(
    period: { from: string; to: string; label: string },
    branches: BranchComparisonRow[],
    summary: BranchComparisonSummary,
    ctx?: ReportPdfContext
  ): Promise<void> {
    const pdfCtx = ctx ?? defaultPdfCtx();
    try {
      const html = this.generateBranchComparisonReport(period, branches, summary, pdfCtx);
      const filename = `comparativo_sucursales_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename, pdfCtx);
    } catch (error) {
      if (__DEV__) console.error('Error exporting branch comparison report:', error);
      throw error;
    }
  }

  /**
   * Generar y compartir reporte de análisis de ventas
   */
  static async exportSalesReport(
    branchName: string,
    metrics: BranchMetrics,
    wineMetrics: WineMetrics[],
    ctx?: ReportPdfContext
  ): Promise<void> {
    const pdfCtx = ctx ?? defaultPdfCtx();
    try {
      const html = await this.generateSalesReport(branchName, metrics, wineMetrics, pdfCtx);
      const filename = `ventas_${branchName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename, pdfCtx);
    } catch (error) {
      if (__DEV__) console.error('Error exporting sales report:', error);
      throw error;
    }
  }
}
