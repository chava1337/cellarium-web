import { supabase } from './supabase';

export interface WineMetrics {
  wine_id: string;
  wine_name: string;
  wine_image: string | null;
  grape_variety: string;
  region: string;
  country: string;
  // Métricas de ventas
  total_sales: number; // Cantidad total vendida
  total_revenue: number; // Ingresos totales
  avg_price: number; // Precio promedio de venta
  // Métricas de inventario
  current_stock: number;
  initial_stock: number; // Stock inicial registrado
  stock_turnover: number; // Rotación de inventario (ventas / stock promedio)
  // Métricas de popularidad
  bottles_sold: number;
  glasses_sold: number;
  total_orders: number; // Número de veces que se pidió
  // Métricas de tiempo
  days_in_catalog: number;
  last_sale_date: string | null;
  // Métricas calculadas
  sales_per_day: number;
  revenue_per_day: number;
  stock_days_remaining: number; // Días estimados hasta agotar stock
}

export interface BranchMetrics {
  branch_id: string;
  branch_name: string;
  // Métricas generales
  total_wines: number;
  total_stock: number;
  total_inventory_value: number;
  // Métricas de ventas
  total_sales: number;
  total_revenue: number;
  avg_ticket: number;
  // Top performers
  top_selling_wine: string;
  top_revenue_wine: string;
  // Alertas
  low_stock_count: number;
  out_of_stock_count: number;
}

export interface DateRangeMetrics {
  from_date: string;
  to_date: string;
  total_sales: number;
  total_revenue: number;
  total_orders: number;
  avg_ticket: number;
  best_selling_day: string;
  worst_selling_day: string;
}

export interface ComparisonMetrics {
  branches: BranchMetrics[];
  total_system_revenue: number;
  total_system_sales: number;
  best_performing_branch: string;
  worst_performing_branch: string;
}

export class AnalyticsService {
  /**
   * Obtener métricas detalladas de un vino específico en una sucursal
   */
  static async getWineMetrics(wineId: string, branchId: string, ownerId: string): Promise<WineMetrics | null> {
    try {
      // 1. Obtener información básica del vino y stock actual
      const { data: wineData, error: wineError } = await supabase
        .from('wine_branch_stock')
        .select(`
          stock_quantity,
          price_by_glass,
          price_by_bottle,
          created_at,
          wines (
            id,
            name,
            image_url,
            grape_variety,
            region,
            country,
            owner_id
          )
        `)
        .eq('wine_id', wineId)
        .eq('branch_id', branchId)
        .eq('wines.owner_id', ownerId) // FILTRO POR OWNER
        .single();

      if (wineError || !wineData) {
        console.error('Error fetching wine data:', wineError);
        return null;
      }

      // 2. Obtener ventas del vino
      const { data: salesData, error: salesError } = await supabase
        .from('sale_items')
        .select(`
          quantity,
          unit_price,
          item_type,
          sales (
            created_at,
            payment_status
          )
        `)
        .eq('wine_id', wineId);

      if (salesError) {
        // Manejar error cuando sale_items no existe
        if (salesError.code === 'PGRST205' && salesError.message?.includes('sale_items')) {
          console.log('⚠️ Tabla sale_items no existe aún para métricas de vino');
          // Retornar métricas con valores en cero usando wineData
          return {
            wine_id: wineId,
            wine_name: wineData?.wines?.name || 'Vino desconocido',
            current_stock: wineData?.stock_quantity || 0,
            avg_price: wineData?.price_bottle || wineData?.wines?.price_bottle || 0,
            total_sales: 0,
            total_revenue: 0,
            total_orders: 0,
            bottles_sold: 0,
            glasses_sold: 0,
            days_since_last_sale: null,
          };
        }
        console.error('Error fetching sales data:', salesError);
      }

      // Filtrar solo ventas pagadas o pendientes (no canceladas)
      const validSales = salesData?.filter(
        (item: any) => item.sales.payment_status !== 'cancelled'
      ) || [];

      // 3. Calcular métricas de ventas
      const totalSales = validSales.reduce((sum: number, item: any) => sum + item.quantity, 0);
      const totalRevenue = validSales.reduce(
        (sum: number, item: any) => sum + (item.quantity * item.unit_price),
        0
      );
      const bottlesSold = validSales
        .filter((item: any) => item.item_type === 'bottle')
        .reduce((sum: number, item: any) => sum + item.quantity, 0);
      const glassesSold = validSales
        .filter((item: any) => item.item_type === 'glass')
        .reduce((sum: number, item: any) => sum + item.quantity, 0);

      // 4. Obtener movimientos de inventario (TABLA NO EXISTE AÚN)
      // TODO: Implementar cuando se cree la tabla inventory_movements
      const movements: any[] = [];
      const initialStock = wineData.stock_quantity; // Usar stock actual como inicial

      // 5. Calcular días en catálogo
      const createdDate = new Date(wineData.created_at);
      const today = new Date();
      const daysInCatalog = Math.floor((today.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

      // 6. Fecha de última venta
      const lastSale = validSales.length > 0
        ? validSales.sort((a: any, b: any) => 
            new Date(b.sales.created_at).getTime() - new Date(a.sales.created_at).getTime()
          )[0]
        : null;

      // 7. Calcular métricas derivadas
      const avgStock = (initialStock + wineData.stock_quantity) / 2;
      const stockTurnover = avgStock > 0 ? totalSales / avgStock : 0;
      const salesPerDay = daysInCatalog > 0 ? totalSales / daysInCatalog : 0;
      const revenuePerDay = daysInCatalog > 0 ? totalRevenue / daysInCatalog : 0;
      const stockDaysRemaining = salesPerDay > 0 ? wineData.stock_quantity / salesPerDay : 999;

      const metrics: WineMetrics = {
        wine_id: wineData.wines.id,
        wine_name: wineData.wines.name,
        wine_image: wineData.wines.image_url,
        grape_variety: wineData.wines.grape_variety,
        region: wineData.wines.region,
        country: wineData.wines.country,
        total_sales: totalSales,
        total_revenue: totalRevenue,
        avg_price: totalSales > 0 ? totalRevenue / totalSales : (wineData.price_by_bottle || 0),
        current_stock: wineData.stock_quantity,
        initial_stock: initialStock,
        stock_turnover: stockTurnover,
        bottles_sold: bottlesSold,
        glasses_sold: glassesSold,
        total_orders: validSales.length,
        days_in_catalog: daysInCatalog,
        last_sale_date: lastSale ? lastSale.sales.created_at : null,
        sales_per_day: salesPerDay,
        revenue_per_day: revenuePerDay,
        stock_days_remaining: stockDaysRemaining,
      };

      return metrics;
    } catch (error) {
      console.error('Error in getWineMetrics:', error);
      return null;
    }
  }

  /**
   * Obtener métricas de todos los vinos de una sucursal
   */
  static async getAllWinesMetrics(branchId: string, ownerId: string): Promise<WineMetrics[]> {
    try {
      // Obtener todos los vinos de la sucursal
      const { data: wines, error } = await supabase
        .from('wine_branch_stock')
        .select(`
          wine_id,
          wines!inner(owner_id)
        `)
        .eq('branch_id', branchId)
        .eq('wines.owner_id', ownerId); // FILTRO POR OWNER

      if (error) {
        console.error('Error fetching wines:', error);
        return [];
      }

      // Obtener métricas de cada vino
      const metricsPromises = wines.map((wine: any) =>
        this.getWineMetrics(wine.wine_id, branchId, ownerId)
      );

      const metricsResults = await Promise.all(metricsPromises);

      // Filtrar nulls y retornar
      return metricsResults.filter((m): m is WineMetrics => m !== null);
    } catch (error) {
      console.error('Error in getAllWinesMetrics:', error);
      return [];
    }
  }

  /**
   * Obtener métricas de una sucursal
   */
  static async getBranchMetrics(branchId: string, ownerId: string): Promise<BranchMetrics | null> {
    try {
      // Obtener información de la sucursal
      // TODO: Agregar filtro .eq('owner_id', ownerId) cuando la columna exista en branches
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .select('id, name')
        .eq('id', branchId)
        .maybeSingle(); // Usar maybeSingle() en lugar de single() para manejar 0 resultados

      if (branchError) {
        console.error('Error fetching branch:', branchError);
        return null;
      }

      if (!branch) {
        console.warn(`⚠️ Branch ${branchId} no encontrada o no pertenece al owner ${ownerId}`);
        return null;
      }

      // Obtener métricas de todos los vinos
      const winesMetrics = await this.getAllWinesMetrics(branchId, ownerId);

      // Calcular métricas agregadas
      const totalWines = winesMetrics.length;
      const totalStock = winesMetrics.reduce((sum, m) => sum + m.current_stock, 0);
      const totalInventoryValue = winesMetrics.reduce(
        (sum, m) => sum + (m.current_stock * m.avg_price),
        0
      );
      const totalSales = winesMetrics.reduce((sum, m) => sum + m.total_sales, 0);
      const totalRevenue = winesMetrics.reduce((sum, m) => sum + m.total_revenue, 0);
      const totalOrders = winesMetrics.reduce((sum, m) => sum + m.total_orders, 0);
      const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Encontrar top performers
      const topSellingWine = winesMetrics.length > 0
        ? winesMetrics.sort((a, b) => b.total_sales - a.total_sales)[0].wine_name
        : 'N/A';

      const topRevenueWine = winesMetrics.length > 0
        ? winesMetrics.sort((a, b) => b.total_revenue - a.total_revenue)[0].wine_name
        : 'N/A';

      // Contar alertas
      const lowStockCount = winesMetrics.filter(m => m.current_stock <= 5).length;
      const outOfStockCount = winesMetrics.filter(m => m.current_stock === 0).length;

      const metrics: BranchMetrics = {
        branch_id: branch.id,
        branch_name: branch.name,
        total_wines: totalWines,
        total_stock: totalStock,
        total_inventory_value: totalInventoryValue,
        total_sales: totalSales,
        total_revenue: totalRevenue,
        avg_ticket: avgTicket,
        top_selling_wine: topSellingWine,
        top_revenue_wine: topRevenueWine,
        low_stock_count: lowStockCount,
        out_of_stock_count: outOfStockCount,
      };

      return metrics;
    } catch (error) {
      console.error('Error in getBranchMetrics:', error);
      return null;
    }
  }

  /**
   * Comparar métricas entre todas las sucursales (solo Owner)
   */
  static async getAllBranchesComparison(ownerId: string): Promise<ComparisonMetrics | null> {
    try {
      console.log('🔄 [getAllBranchesComparison] Obteniendo comparación para owner:', ownerId);
      
      // NUEVO ENFOQUE: Obtener sucursales a través de wine_branch_stock que tiene relación con wines.owner_id
      // Esto garantiza que solo obtengamos las sucursales que tienen vinos del owner actual
      const { data: stockData, error: stockError } = await supabase
        .from('wine_branch_stock')
        .select(`
          branch_id,
          branches!inner (
            id,
            name
          ),
          wines!inner (
            owner_id
          )
        `)
        .eq('wines.owner_id', ownerId);

      if (stockError) {
        console.error('❌ Error fetching branches through wine_branch_stock:', stockError);
        return null;
      }

      if (!stockData || stockData.length === 0) {
        console.warn('⚠️ [getAllBranchesComparison] No se encontraron sucursales con vinos para este owner');
        return null;
      }

      // Extraer branches únicas del resultado
      const branchesMap = new Map<string, { id: string; name: string }>();
      stockData.forEach((item: any) => {
        if (item.branches && item.branches.id && !branchesMap.has(item.branches.id)) {
          branchesMap.set(item.branches.id, {
            id: item.branches.id,
            name: item.branches.name
          });
        }
      });

      const branches = Array.from(branchesMap.values());
      console.log(`📦 [getAllBranchesComparison] Sucursales únicas encontradas: ${branches.length}`);
      console.log(`  📋 Detalle:`, branches.map(b => `${b.name} (${b.id})`));

      // Si no hay sucursales, retornar null
      if (branches.length === 0) {
        console.warn('⚠️ [getAllBranchesComparison] No se encontraron sucursales para este owner');
        return null;
      }

      // Obtener métricas de cada sucursal
      const metricsPromises = branches.map((branch: any) => {
        console.log(`  ⏳ Obteniendo métricas para: ${branch.name || branch.id}`);
        return this.getBranchMetrics(branch.id, ownerId); // Pasar ownerId
      });

      const metricsResults = await Promise.all(metricsPromises);
      const validMetrics = metricsResults.filter((m): m is BranchMetrics => m !== null);

      console.log(`✅ [getAllBranchesComparison] Métricas válidas obtenidas: ${validMetrics.length}`);

      if (validMetrics.length === 0) {
        console.warn('⚠️ [getAllBranchesComparison] No se obtuvieron métricas válidas');
        return null;
      }

      // Calcular totales del sistema
      const totalSystemRevenue = validMetrics.reduce((sum, m) => sum + m.total_revenue, 0);
      const totalSystemSales = validMetrics.reduce((sum, m) => sum + m.total_sales, 0);

      // Encontrar mejor y peor sucursal
      const sortedByRevenue = [...validMetrics].sort((a, b) => b.total_revenue - a.total_revenue);
      const bestBranch = sortedByRevenue[0];
      const worstBranch = sortedByRevenue[sortedByRevenue.length - 1];

      const comparison: ComparisonMetrics = {
        branches: validMetrics,
        total_system_revenue: totalSystemRevenue,
        total_system_sales: totalSystemSales,
        best_performing_branch: bestBranch.branch_name,
        worst_performing_branch: worstBranch.branch_name,
      };

      console.log('✅ [getAllBranchesComparison] Comparación completada:', {
        total_branches: validMetrics.length,
        total_revenue: totalSystemRevenue,
        total_sales: totalSystemSales,
      });

      return comparison;
    } catch (error) {
      console.error('❌ Error in getAllBranchesComparison:', error);
      return null;
    }
  }

  /**
   * Obtener top 10 vinos más vendidos por sucursal
   */
  static async getTopSellingWines(branchId: string, ownerId: string, limit: number = 10): Promise<WineMetrics[]> {
    try {
      const metrics = await this.getAllWinesMetrics(branchId, ownerId);
      return metrics.sort((a, b) => b.total_sales - a.total_sales).slice(0, limit);
    } catch (error) {
      console.error('Error in getTopSellingWines:', error);
      return [];
    }
  }

  /**
   * Obtener top 10 vinos con más ingresos por sucursal
   */
  static async getTopRevenueWines(branchId: string, ownerId: string, limit: number = 10): Promise<WineMetrics[]> {
    try {
      const metrics = await this.getAllWinesMetrics(branchId, ownerId);
      return metrics.sort((a, b) => b.total_revenue - a.total_revenue).slice(0, limit);
    } catch (error) {
      console.error('Error in getTopRevenueWines:', error);
      return [];
    }
  }

  /**
   * Obtener vinos con mayor rotación (más vendidos en menos tiempo)
   */
  static async getFastestMovingWines(branchId: string, ownerId: string, limit: number = 10): Promise<WineMetrics[]> {
    try {
      const metrics = await this.getAllWinesMetrics(branchId, ownerId);
      return metrics
        .filter(m => m.sales_per_day > 0)
        .sort((a, b) => b.sales_per_day - a.sales_per_day)
        .slice(0, limit);
    } catch (error) {
      console.error('Error in getFastestMovingWines:', error);
      return [];
    }
  }

  /**
   * Obtener vinos con menor rotación (más lentos en venderse o sin ventas)
   */
  static async getSlowestMovingWines(branchId: string, ownerId: string, limit: number = 10): Promise<WineMetrics[]> {
    try {
      const metrics = await this.getAllWinesMetrics(branchId, ownerId);
      // Ordenar por total_sales (ascendente) para obtener los menos vendidos primero
      return metrics
        .sort((a, b) => {
          // Si ambos tienen 0 ventas, ordenar por días sin venta
          if (a.total_sales === 0 && b.total_sales === 0) {
            const aDays = a.last_sale_date ? Math.floor((Date.now() - new Date(a.last_sale_date).getTime()) / (1000 * 60 * 60 * 24)) : 999;
            const bDays = b.last_sale_date ? Math.floor((Date.now() - new Date(b.last_sale_date).getTime()) / (1000 * 60 * 60 * 24)) : 999;
            return bDays - aDays;
          }
          return a.total_sales - b.total_sales;
        })
        .slice(0, limit);
    } catch (error) {
      console.error('Error in getSlowestMovingWines:', error);
      return [];
    }
  }
}


