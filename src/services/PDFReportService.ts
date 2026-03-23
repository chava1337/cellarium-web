import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { InventoryItem, InventoryStats, EstimatedSalesRow, SalesFromCountsRow, SalesFromCountsSummary, BranchComparisonRow, BranchComparisonSummary } from './InventoryService';
import { WineMetrics, BranchMetrics } from './AnalyticsService';
import { isValidPrice, formatCurrencyMXN } from '../utils/wineCatalogUtils';
import { captureCriticalError, sentryFlowBreadcrumb } from '../utils/sentryContext';

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
    stats: InventoryStats | null
  ): Promise<string> {
    const date = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

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
          <h1>Reporte de inventario</h1>
          <p class="meta"><strong>Sucursal:</strong> ${branchName}</p>
          <p class="meta"><strong>Fecha:</strong> ${date}</p>
        </div>

        ${stats ? `
        <div class="kpi-block">
          <h2>Resumen general</h2>
          <div class="kpi-row">
            <div class="kpi">
              <div class="stat-value">${stats.totalWines}</div>
              <div class="stat-label">Vinos en catálogo</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${stats.totalBottles}</div>
              <div class="stat-label">Botellas totales</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${stats.totalValue > 0 ? `$${stats.totalValue.toFixed(2)}` : '—'}</div>
              <div class="stat-label">Valor total</div>
            </div>
          </div>
        </div>
        ` : ''}

        <h2 class="section-title">Detalle de inventario</h2>
        <table class="report-table">
          <thead>
            <tr>
              <th>Vino</th>
              <th>País</th>
              <th>Stock</th>
              <th>Precio copa</th>
              <th>Precio botella</th>
              <th>Valor total</th>
            </tr>
          </thead>
          <tbody>
            ${inventory.map(item => {
              const bottlePrice = item.price_by_bottle;
              const glassPrice = item.price_by_glass;
              const bottleDisplay = isValidPrice(bottlePrice) ? `$${Number(bottlePrice).toFixed(2)}` : 'N/A';
              const glassDisplay = isValidPrice(glassPrice) ? `$${Number(glassPrice).toFixed(2)}` : 'N/A';
              const valueDisplay = isValidPrice(bottlePrice) ? `$${(item.stock_quantity * bottlePrice).toFixed(2)}` : '—';
              return `
              <tr>
                <td>
                  <strong>${item.wines.name}</strong>
                  <span class="wine-sub">${item.wines.grape_variety ?? ''}</span>
                </td>
                <td>${item.wines.country}</td>
                <td ${item.stock_quantity < 5 ? 'class="low-stock"' : ''}>
                  ${item.stock_quantity} botellas${item.stock_quantity < 5 ? ' (bajo)' : ''}
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
          <p>Cellarium · Sistema de gestión de vinos</p>
          <p>${new Date().toLocaleString('es-ES')}</p>
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
    wineMetrics: WineMetrics[]
  ): Promise<string> {
    const date = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

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
          <h1>Análisis de ventas</h1>
          <p class="meta"><strong>Sucursal:</strong> ${branchName}</p>
          <p class="meta"><strong>Fecha:</strong> ${date}</p>
        </div>

        <div class="kpi-block">
          <h2>Métricas generales</h2>
          <div class="kpi-row">
            <div class="kpi">
              <div class="stat-value">$${metrics.total_revenue.toFixed(2)}</div>
              <div class="stat-label">Ingresos totales</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${metrics.total_sales}</div>
              <div class="stat-label">Ventas totales</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${metrics.unique_wines_sold}</div>
              <div class="stat-label">Vinos vendidos</div>
            </div>
          </div>
        </div>

        <h2 class="section-title">Top 10 vinos más vendidos</h2>
        <table class="report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Vino</th>
              <th>País</th>
              <th>Ventas</th>
              <th>Ingresos</th>
              <th>Precio prom.</th>
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
                <td>${wine.total_sales} u.</td>
                <td>$${wine.total_revenue.toFixed(2)}</td>
                <td>$${wine.avg_price.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="doc-footer">
          <p>Cellarium · Sistema de gestión de vinos</p>
          <p>${new Date().toLocaleString('es-ES')}</p>
        </div>
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Renderiza HTML a PDF con expo-print y comparte el archivo (mismo HTML que los generadores).
   */
  static async printHtmlAndSharePdf(html: string, filenameBase: string): Promise<void> {
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
        throw new Error('Compartir no está disponible en este dispositivo');
      }

      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Compartir reporte · ${truncated}`,
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
    stats: InventoryStats | null
  ): Promise<void> {
    try {
      const html = await this.generateInventoryReport(branchName, inventory, stats);
      const filename = `inventario_${branchName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename);
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
    summary: { total_sold_estimated: number; total_revenue_estimated: number | null; total_received: number }
  ): string {
    const date = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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
          <h1>Ventas estimadas</h1>
          <p class="meta"><strong>Sucursal:</strong> ${branchName}</p>
          <p class="meta"><strong>Periodo:</strong> ${period.label}</p>
          <p class="meta"><strong>Generado:</strong> ${date}</p>
        </div>
        <div class="kpi-block">
          <h2>Resumen</h2>
          <div class="kpi-row">
            <div class="kpi">
              <div class="stat-value">${summary.total_sold_estimated}</div>
              <div class="stat-label">Botellas vendidas (est.)</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${summary.total_revenue_estimated != null ? `$${summary.total_revenue_estimated.toFixed(2)}` : '—'}</div>
              <div class="stat-label">Ingresos estimados</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${summary.total_received}</div>
              <div class="stat-label">Botellas recibidas</div>
            </div>
          </div>
        </div>
        <h2 class="section-title">Detalle por vino</h2>
        <table class="report-table">
          <thead>
            <tr>
              <th>Vino</th>
              <th>Vendidas (est.)</th>
              <th>Recibidas</th>
              <th>Último conteo</th>
              <th>Ingresos est.</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${r.wine_name}</td>
                <td>${r.sold_estimated_total}</td>
                <td>${r.received_total}</td>
                <td>${r.last_count_at ? new Date(r.last_count_at).toLocaleDateString('es-ES') : '—'}</td>
                <td>${r.revenue_estimated != null ? `$${r.revenue_estimated.toFixed(2)}` : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="doc-footer">
          <p>Cellarium · Ventas estimadas a partir de conteos físicos</p>
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
    summary: { total_sold_estimated: number; total_revenue_estimated: number | null; total_received: number }
  ): Promise<void> {
    try {
      const html = this.generateEstimatedSalesReport(branchName, period, rows, summary);
      const filename = `ventas_estimadas_${branchName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename);
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
    summary: SalesFromCountsSummary
  ): string {
    const date = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    const startAt = summary.count_start_at ? new Date(summary.count_start_at).toLocaleDateString('es-ES') : '—';
    const endAt = summary.count_end_at ? new Date(summary.count_end_at).toLocaleDateString('es-ES') : '—';
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
          <h1>Ventas estimadas (cortes)</h1>
          <p class="meta"><strong>Sucursal:</strong> ${branchName}</p>
          <p class="meta"><strong>Periodo:</strong> ${period.label}</p>
          <p class="meta"><strong>Conteo inicial:</strong> ${startAt} · <strong>Conteo final:</strong> ${endAt}</p>
          <p class="header-note">Estimado con base en cortes físicos y movimientos registrados.</p>
          <p class="meta"><strong>Generado:</strong> ${date}</p>
        </div>
        <div class="kpi-block">
          <h2>Resumen</h2>
          <div class="kpi-row kpi-row-4">
            <div class="kpi">
              <div class="stat-value">${summary.total_sold_estimated}</div>
              <div class="stat-label">Consumo estimado</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${revenueStr}</div>
              <div class="stat-label">Ingresos estimados</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${summary.total_entries}</div>
              <div class="stat-label">Entradas</div>
            </div>
            <div class="kpi">
              <div class="stat-value">${summary.total_special_outs}</div>
              <div class="stat-label">Salidas especiales</div>
            </div>
          </div>
          ${unpricedTotal > 0 || unpricedCount > 0 ? `
          <p class="note-inline">
            <strong>Consumo sin precio:</strong> ${unpricedTotal} botellas
            ${unpricedCount > 0 ? ` · <strong>Vinos sin precio:</strong> ${unpricedCount}` : ''}
          </p>
          ` : ''}
        </div>
        <h2 class="section-title">Detalle por vino</h2>
        <table class="report-table table-tight">
          <thead>
            <tr>
              <th>Vino</th>
              <th>St. ini.</th>
              <th>Entr.</th>
              <th>Sal. esp.</th>
              <th>St. fin</th>
              <th>Consumo</th>
              <th>Ingresos</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const hasPrice = r.revenue_estimated != null && isValidPrice(r.revenue_estimated);
              const revStr = hasPrice ? formatCurrencyMXN(r.revenue_estimated!) : '—';
              const revCell = hasPrice ? revStr : (r.sold_estimated > 0 ? '— (s/p)' : '—');
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
          <p>Cellarium · Ventas estimadas (cortes físicos)</p>
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
    summary: SalesFromCountsSummary
  ): Promise<void> {
    try {
      const html = this.generateSalesFromCountsReport(branchName, period, rows, summary);
      const filename = `ventas_cortes_${branchName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename);
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
    summary: BranchComparisonSummary
  ): string {
    const date = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalRevenue = summary.total_revenue_estimated ?? 0;
    const revenueStr = totalRevenue > 0 ? formatCurrencyMXN(totalRevenue) : '—';
    const sortedBranches = [...branches].sort((a, b) => (b.total_revenue_estimated ?? 0) - (a.total_revenue_estimated ?? 0));

    const rowsHtml = sortedBranches.map((branch, index) => {
      const hasData = branch.valid_wines_count > 0;
      const revStr = hasData && (branch.total_revenue_estimated ?? 0) > 0 ? formatCurrencyMXN(branch.total_revenue_estimated!) : '—';
      const contributionPct = totalRevenue > 0 && (branch.total_revenue_estimated ?? 0) >= 0
        ? ((branch.total_revenue_estimated ?? 0) / totalRevenue) * 100
        : 0;
      const status = hasData ? '' : 'Datos insuficientes';
      const topWine = branch.top_wine ? `${branch.top_wine.wine_name} (${branch.top_wine.sold_estimated} bot.)` : '—';
      const bottomWine = branch.bottom_wine ? `${branch.bottom_wine.wine_name} (${branch.bottom_wine.sold_estimated} bot.)` : '—';
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
          <h1>Comparativo entre sucursales</h1>
          <p class="meta"><strong>Periodo:</strong> ${period.label}</p>
          <p class="header-note">Estimado con base en cortes físicos y movimientos registrados.</p>
          <p class="meta"><strong>Generado:</strong> ${date}</p>
        </div>
        <div class="kpi-block">
          <h2>Resumen</h2>
          <div class="kpi-row kpi-stack">
            <div class="kpi">
              <span class="stat-label">Mejor sucursal</span>
              <div class="stat-value">${summary.best_branch}</div>
            </div>
            <div class="kpi">
              <span class="stat-label">A mejorar</span>
              <div class="stat-value">${summary.worst_branch}</div>
            </div>
            <div class="kpi">
              <span class="stat-label">Ingresos estimados totales</span>
              <div class="stat-value emphasis">${revenueStr}</div>
            </div>
            <div class="kpi">
              <span class="stat-label">Consumo estimado total</span>
              <div class="stat-value emphasis">${summary.total_consumption_estimated}</div>
            </div>
          </div>
        </div>
        <h2 class="section-title">Detalle por sucursal</h2>
        <table class="report-table table-tight">
          <thead>
            <tr>
              <th>#</th>
              <th>Sucursal</th>
              <th>Ing. est.</th>
              <th>Cons.</th>
              <th>%</th>
              <th>Más movido</th>
              <th>Menos movido</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="doc-footer">
          <p>Cellarium · Comparativo (cortes físicos)</p>
        </div>
      </body>
      </html>
    `;
    return html;
  }

  static async exportBranchComparisonReport(
    period: { from: string; to: string; label: string },
    branches: BranchComparisonRow[],
    summary: BranchComparisonSummary
  ): Promise<void> {
    try {
      const html = this.generateBranchComparisonReport(period, branches, summary);
      const filename = `comparativo_sucursales_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename);
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
    wineMetrics: WineMetrics[]
  ): Promise<void> {
    try {
      const html = await this.generateSalesReport(branchName, metrics, wineMetrics);
      const filename = `ventas_${branchName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      await this.printHtmlAndSharePdf(html, filename);
    } catch (error) {
      if (__DEV__) console.error('Error exporting sales report:', error);
      throw error;
    }
  }
}




