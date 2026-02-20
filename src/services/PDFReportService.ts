import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { InventoryItem, InventoryStats } from './InventoryService';
import { WineMetrics, BranchMetrics } from './AnalyticsService';

/**
 * Servicio para generación y compartición de reportes PDF
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
              <div class="stat-value">${stats.total_wines}</div>
              <div class="stat-label">Vinos en Catálogo</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${stats.total_bottles}</div>
              <div class="stat-label">Botellas Totales</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">$${stats.total_value.toFixed(2)}</div>
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
            ${inventory.map(item => `
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
                <td>$${item.price_by_glass?.toFixed(2) || 'N/A'}</td>
                <td>$${item.price_by_bottle?.toFixed(2) || 'N/A'}</td>
                <td>$${((item.price_by_bottle || 0) * item.stock_quantity).toFixed(2)}</td>
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
   * Guardar HTML como archivo y compartir
   */
  static async saveAndShareHTML(html: string, filename: string): Promise<void> {
    try {
      const fileUri = `${FileSystem.documentDirectory}${filename}.html`;
      
      // Guardar el HTML
      await FileSystem.writeAsStringAsync(fileUri, html, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Verificar si se puede compartir
      const canShare = await Sharing.isAvailableAsync();
      
      if (canShare) {
        // Compartir el archivo
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/html',
          dialogTitle: 'Compartir Reporte',
          UTI: 'public.html',
        });
      } else {
        throw new Error('Compartir no está disponible en este dispositivo');
      }
    } catch (error) {
      console.error('Error saving/sharing HTML:', error);
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
      await this.saveAndShareHTML(html, filename);
    } catch (error) {
      console.error('Error exporting inventory report:', error);
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
      await this.saveAndShareHTML(html, filename);
    } catch (error) {
      console.error('Error exporting sales report:', error);
      throw error;
    }
  }
}




