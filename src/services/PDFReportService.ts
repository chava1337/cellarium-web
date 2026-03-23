import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { InventoryItem, InventoryStats, EstimatedSalesRow, SalesFromCountsRow, SalesFromCountsSummary, BranchComparisonRow, BranchComparisonSummary } from './InventoryService';
import { WineMetrics, BranchMetrics } from './AnalyticsService';
import { isValidPrice, formatCurrencyMXN } from '../utils/wineCatalogUtils';

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
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #333;
          }
          h1 {
            color: #8B0000;
            border-bottom: 3px solid #8B0000;
            padding-bottom: 10px;
          }
          h2 {
            color: #555;
            margin-top: 30px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .stats {
            background-color: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
          }
          .stat-item {
            text-align: center;
          }
          .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #8B0000;
          }
          .stat-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th {
            background-color: #8B0000;
            color: white;
            padding: 12px;
            text-align: left;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #ddd;
          }
          tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .low-stock {
            color: #dc3545;
            font-weight: bold;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            color: #999;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🍷 Reporte de Inventario</h1>
          <p><strong>Sucursal:</strong> ${branchName}</p>
          <p><strong>Fecha:</strong> ${date}</p>
        </div>

        ${stats ? `
        <div class="stats">
          <h2>Resumen General</h2>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">${stats.totalWines}</div>
              <div class="stat-label">Vinos en Catálogo</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${stats.totalBottles}</div>
              <div class="stat-label">Botellas Totales</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${stats.totalValue > 0 ? `$${stats.totalValue.toFixed(2)}` : '—'}</div>
              <div class="stat-label">Valor Total</div>
            </div>
          </div>
        </div>
        ` : ''}

        <h2>Detalle de Inventario</h2>
        <table>
          <thead>
            <tr>
              <th>Vino</th>
              <th>País</th>
              <th>Stock</th>
              <th>Precio Copa</th>
              <th>Precio Botella</th>
              <th>Valor Total</th>
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
                  <strong>${item.wines.name}</strong><br>
                  <small>${item.wines.grape_variety}</small>
                </td>
                <td>${item.wines.country}</td>
                <td ${item.stock_quantity < 5 ? 'class="low-stock"' : ''}>
                  ${item.stock_quantity} botellas
                  ${item.stock_quantity < 5 ? '⚠️' : ''}
                </td>
                <td>${glassDisplay}</td>
                <td>${bottleDisplay}</td>
                <td>${valueDisplay}</td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Generado por Cellarium - Sistema de Gestión de Vinos</p>
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
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #333;
          }
          h1 {
            color: #8B0000;
            border-bottom: 3px solid #8B0000;
            padding-bottom: 10px;
          }
          h2 {
            color: #555;
            margin-top: 30px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .stats {
            background-color: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
          }
          .stat-item {
            text-align: center;
          }
          .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #8B0000;
          }
          .stat-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th {
            background-color: #8B0000;
            color: white;
            padding: 12px;
            text-align: left;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #ddd;
          }
          tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            color: #999;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 Reporte de Análisis de Ventas</h1>
          <p><strong>Sucursal:</strong> ${branchName}</p>
          <p><strong>Fecha:</strong> ${date}</p>
        </div>

        <div class="stats">
          <h2>Métricas Generales</h2>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">$${metrics.total_revenue.toFixed(2)}</div>
              <div class="stat-label">Ingresos Totales</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${metrics.total_sales}</div>
              <div class="stat-label">Ventas Totales</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${metrics.unique_wines_sold}</div>
              <div class="stat-label">Vinos Vendidos</div>
            </div>
          </div>
        </div>

        <h2>Top 10 Vinos Más Vendidos</h2>
        <table>
          <thead>
            <tr>
              <th>Posición</th>
              <th>Vino</th>
              <th>País</th>
              <th>Ventas</th>
              <th>Ingresos</th>
              <th>Precio Promedio</th>
            </tr>
          </thead>
          <tbody>
            ${topWines.map((wine, index) => `
              <tr>
                <td><strong>${index + 1}</strong></td>
                <td>
                  <strong>${wine.wine_name}</strong><br>
                  <small>${wine.grape_variety}</small>
                </td>
                <td>${wine.country}</td>
                <td>${wine.total_sales} unidades</td>
                <td>$${wine.total_revenue.toFixed(2)}</td>
                <td>$${wine.avg_price.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Generado por Cellarium - Sistema de Gestión de Vinos</p>
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
    try {
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        throw new Error('Compartir no está disponible en este dispositivo');
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Compartir reporte · ${filenameBase}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      if (__DEV__) console.error('Error generating/sharing PDF report:', error);
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
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { color: #8B0000; border-bottom: 3px solid #8B0000; padding-bottom: 10px; }
          h2 { color: #555; margin-top: 24px; }
          .header { text-align: center; margin-bottom: 24px; }
          .stats { background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
          .stat-item { text-align: center; }
          .stat-value { font-size: 22px; font-weight: bold; color: #8B0000; }
          .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { background-color: #8B0000; color: white; padding: 10px; text-align: left; }
          td { padding: 8px; border-bottom: 1px solid #ddd; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .footer { margin-top: 32px; text-align: center; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 Reporte de Ventas Estimadas</h1>
          <p><strong>Sucursal:</strong> ${branchName}</p>
          <p><strong>Periodo:</strong> ${period.label}</p>
          <p><strong>Generado:</strong> ${date}</p>
        </div>
        <div class="stats">
          <h2>Resumen</h2>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">${summary.total_sold_estimated}</div>
              <div class="stat-label">Botellas vendidas (est.)</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${summary.total_revenue_estimated != null ? `$${summary.total_revenue_estimated.toFixed(2)}` : '—'}</div>
              <div class="stat-label">Ingresos estimados</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${summary.total_received}</div>
              <div class="stat-label">Botellas recibidas</div>
            </div>
          </div>
        </div>
        <h2>Detalle por vino</h2>
        <table>
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
        <div class="footer">
          <p>Generado por Cellarium - Ventas estimadas a partir de conteos físicos</p>
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
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { color: #8B0000; border-bottom: 3px solid #8B0000; padding-bottom: 10px; }
          h2 { color: #555; margin-top: 24px; }
          .header { text-align: center; margin-bottom: 24px; }
          .header-note { font-size: 12px; color: #666; margin-top: 8px; font-style: italic; }
          .stats { background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
          .stat-item { text-align: center; }
          .stat-value { font-size: 18px; font-weight: bold; color: #8B0000; white-space: nowrap; }
          .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { background-color: #8B0000; color: white; padding: 10px; text-align: left; }
          td { padding: 8px; border-bottom: 1px solid #ddd; white-space: nowrap; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .footer { margin-top: 32px; text-align: center; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Reporte de Ventas estimadas</h1>
          <p><strong>Sucursal:</strong> ${branchName}</p>
          <p><strong>Periodo:</strong> ${period.label}</p>
          <p><strong>Conteo inicial:</strong> ${startAt} &nbsp; <strong>Conteo final:</strong> ${endAt}</p>
          <p class="header-note">Estimado con base en cortes físicos y movimientos registrados.</p>
          <p><strong>Generado:</strong> ${date}</p>
        </div>
        <div class="stats">
          <h2>Resumen</h2>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">${summary.total_sold_estimated}</div>
              <div class="stat-label">Consumo estimado</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${revenueStr}</div>
              <div class="stat-label">Ingresos estimados</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${summary.total_entries}</div>
              <div class="stat-label">Entradas</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${summary.total_special_outs}</div>
              <div class="stat-label">Salidas especiales</div>
            </div>
          </div>
          ${unpricedTotal > 0 || unpricedCount > 0 ? `
          <p style="margin-top: 12px; font-size: 12px; color: #666;">
            <strong>Consumo sin precio configurado:</strong> ${unpricedTotal} botellas
            ${unpricedCount > 0 ? ` &nbsp;|&nbsp; <strong>Vinos sin precio configurado:</strong> ${unpricedCount}` : ''}
          </p>
          ` : ''}
        </div>
        <h2>Detalle por vino</h2>
        <table>
          <thead>
            <tr>
              <th>Vino</th>
              <th>Stock inicio</th>
              <th>Entradas</th>
              <th>Salidas especiales</th>
              <th>Stock fin</th>
              <th>Consumo estimado</th>
              <th>Ingresos estimados</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const hasPrice = r.revenue_estimated != null && isValidPrice(r.revenue_estimated);
              const revStr = hasPrice ? formatCurrencyMXN(r.revenue_estimated!) : '—';
              const revCell = hasPrice ? revStr : (r.sold_estimated > 0 ? '— (Sin precio)' : '—');
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
        <div class="footer">
          <p>Generado por Cellarium - Ventas estimadas con base en cortes físicos y movimientos registrados</p>
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
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { color: #8B0000; border-bottom: 3px solid #8B0000; padding-bottom: 10px; }
          h2 { color: #555; margin-top: 24px; }
          .header { text-align: center; margin-bottom: 24px; }
          .header-note { font-size: 12px; color: #666; margin-top: 8px; font-style: italic; }
          .stats { background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .stat-item { text-align: center; margin-bottom: 8px; }
          .stat-value { font-size: 18px; font-weight: bold; color: #8B0000; }
          .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { background-color: #8B0000; color: white; padding: 10px; text-align: left; font-size: 12px; }
          td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 12px; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .footer { margin-top: 32px; text-align: center; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Reporte comparativo entre sucursales</h1>
          <p><strong>Periodo:</strong> ${period.label}</p>
          <p class="header-note">Estimado con base en cortes físicos y movimientos registrados.</p>
          <p><strong>Generado:</strong> ${date}</p>
        </div>
        <div class="stats">
          <h2>Resumen</h2>
          <div class="stat-item">
            <span class="stat-label">Mejor sucursal</span>
            <div class="stat-value">${summary.best_branch}</div>
          </div>
          <div class="stat-item">
            <span class="stat-label">A mejorar</span>
            <div class="stat-value">${summary.worst_branch}</div>
          </div>
          <div class="stat-item">
            <span class="stat-label">Ingresos estimados totales</span>
            <div class="stat-value">${revenueStr}</div>
          </div>
          <div class="stat-item">
            <span class="stat-label">Consumo estimado total</span>
            <div class="stat-value">${summary.total_consumption_estimated}</div>
          </div>
        </div>
        <h2>Detalle por sucursal</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Sucursal</th>
              <th>Ingresos est.</th>
              <th>Consumo est.</th>
              <th>Contribución</th>
              <th>Más movido</th>
              <th>Menos movido</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          <p>Generado por Cellarium - Comparativo con base en cortes físicos y movimientos registrados</p>
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




