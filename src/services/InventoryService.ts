import { supabase } from './supabase';
import { isValidPrice } from '../utils/wineCatalogUtils';

export interface InventoryItem {
  id: string;
  wine_id: string;
  branch_id: string;
  stock_quantity: number;
  price_by_glass: number | null;
  price_by_bottle: number | null;
  created_at: string;
  updated_at: string;
  wines: {
    id: string;
    name: string;
    grape_variety: string;
    region: string;
    country: string;
    vintage: number;
    image_url: string | null;
  };
}

export interface InventoryMovement {
  id?: string;
  wine_id: string;
  branch_id: string;
  movement_type: 'entrada' | 'salida' | 'ajuste' | 'venta';
  quantity: number;
  reason: string;
  user_id: string;
  previous_quantity: number;
  new_quantity: number;
  created_at?: string;
}

export interface InventoryStats {
  totalWines: number;
  totalBottles: number;
  totalValue: number;
  lowStockCount: number;
}

/** Resultado del RPC register_inventory_count */
export interface RegisterCountResult {
  movement_id: string;
  previous_count: number;
  new_count: number;
  received: number;
  estimated_sold: number;
}

/** Fila para reporte de ventas estimadas (conteos) */
export interface EstimatedSalesRow {
  wine_id: string;
  wine_name: string;
  sold_estimated_total: number;
  received_total: number;
  last_count_at: string;
  price_by_bottle: number | null;
  revenue_estimated: number | null;
}

/** Fila de ventas calculadas desde cortes (conteo inicial + eventos + conteo final) */
export interface SalesFromCountsRow {
  wine_id: string;
  wine_name: string;
  sold_estimated: number;
  entries_total: number;
  special_out_total: number;
  start_count: number;
  end_count: number;
  last_count_at: string;
  price_by_bottle: number | null;
  revenue_estimated: number | null;
}

/** Resumen de getSalesFromCountsByPeriod */
export interface SalesFromCountsSummary {
  total_sold_estimated: number;
  total_revenue_estimated: number | null;
  total_entries: number;
  total_special_outs: number;
  count_start_at: string | null;
  count_end_at: string | null;
  sufficient: boolean;
  /** Número de vinos con ventas estimadas calculables (con count_inicio y count_final) */
  valid_wines_count: number;
  /** Suma de sold_estimated de vinos sin price_by_bottle válido (consumo sin precio configurado) */
  unpriced_consumption_total: number;
  /** Número de vinos con consumo > 0 y sin precio válido */
  unpriced_wines_count: number;
}

/** Fila por sucursal para comparativa desde cortes (misma lógica que Ventas estimadas) */
export interface BranchComparisonRow {
  branch_id: string;
  branch_name: string;
  total_revenue_estimated: number | null;
  total_consumption_estimated: number;
  valid_wines_count: number;
  unpriced_consumption_total: number;
  top_wine: { wine_name: string; sold_estimated: number } | null;
  bottom_wine: { wine_name: string; sold_estimated: number } | null;
}

/** Resumen de getBranchesComparisonFromCounts */
export interface BranchComparisonSummary {
  total_revenue_estimated: number | null;
  total_consumption_estimated: number;
  best_branch: string;
  worst_branch: string;
  valid_branches_count: number;
}

export class InventoryService {
  /**
   * Obtener todo el inventario de una sucursal
   */
  static async getInventoryByBranch(branchId: string, ownerId: string): Promise<InventoryItem[]> {
    try {
      if (__DEV__) {
        console.log(`📦 InventoryService: Obteniendo inventario para branch ${branchId}, owner ${ownerId}`);
      }

      const { data, error } = await supabase
        .from('wine_branch_stock')
        .select(`
          id,
          wine_id,
          branch_id,
          stock_quantity,
          price_by_glass,
          price_by_bottle,
          created_at,
          updated_at,
          wines (
            id,
            name,
            winery,
            grape_variety,
            region,
            country,
            vintage,
            description,
            tasting_notes,
            image_url,
            owner_id
          )
        `)
        .eq('branch_id', branchId)
        .eq('wines.owner_id', ownerId) // FILTRO POR OWNER
        .order('wines(name)', { ascending: true });

      if (error) {
        if (__DEV__) console.error('Error fetching inventory:', error);
        throw error;
      }

      if (__DEV__) {
        console.log(`📦 InventoryService: Registros obtenidos:`, data?.length || 0);
        console.log(`📦 InventoryService: Detalle:`, data?.map(item => ({
          stock_id: item.id,
          wine_id: item.wine_id,
          wine_name: item.wines?.name || 'SIN DATOS',
          wine_owner_id: item.wines?.owner_id || 'SIN OWNER',
          stock_quantity: item.stock_quantity
        })));
      }

      return data || [];
    } catch (error) {
      if (__DEV__) console.error('Error in getInventoryByBranch:', error);
      throw error;
    }
  }

  /**
   * Registrar conteo físico (RPC). Actualiza stock a counted_quantity y devuelve estimated_sold.
   */
  static async registerInventoryCount(params: {
    ownerId: string;
    branchId: string;
    wineId: string;
    countedQuantity: number;
    receivedQuantity?: number;
    reason?: string | null;
    notes?: string | null;
  }): Promise<RegisterCountResult> {
    const {
      ownerId,
      branchId,
      wineId,
      countedQuantity,
      receivedQuantity = 0,
      reason = null,
      notes = null,
    } = params;

    const { data, error } = await supabase.rpc('register_inventory_count', {
      p_owner_id: ownerId,
      p_branch_id: branchId,
      p_wine_id: wineId,
      p_counted_quantity: countedQuantity,
      p_received_quantity: receivedQuantity,
      p_reason: reason,
      p_notes: notes,
    });

    if (error) {
      if (__DEV__) console.error('Error register_inventory_count:', error);
      throw error;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error('El conteo no devolvió datos');
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      movement_id: row.movement_id,
      previous_count: row.previous_count ?? 0,
      new_count: row.new_count ?? countedQuantity,
      received: row.received ?? receivedQuantity,
      estimated_sold: row.estimated_sold ?? 0,
    };
  }

  /**
   * Registrar evento de inventario (entrada o salida). Actualiza stock y registra movimiento.
   * reason: compra | cortesia_proveedor | cortesia_cliente | rotura
   */
  static async registerInventoryEvent(params: {
    ownerId: string;
    branchId: string;
    wineId: string;
    stockId: string;
    userId: string;
    direction: 'in' | 'out';
    qty: number;
    reason: string;
    notes?: string | null;
  }): Promise<InventoryItem> {
    const { ownerId, branchId, wineId, stockId, userId, direction, qty, reason } = params;
    if (qty <= 0) {
      throw new Error('La cantidad debe ser mayor a 0');
    }
    const quantityChange = direction === 'in' ? qty : -qty;
    const movementType = direction === 'in' ? 'entrada' : 'salida';
    return this.updateStock(
      stockId,
      wineId,
      branchId,
      quantityChange,
      movementType,
      reason,
      userId,
      ownerId
    );
  }

  /**
   * Actualizar cantidad de stock (entrada o salida). Usado por SalesService/otros; no usar para conteo.
   */
  static async updateStock(
    stockId: string,
    wineId: string,
    branchId: string,
    quantityChange: number,
    movementType: 'entrada' | 'salida' | 'ajuste' | 'venta',
    reason: string,
    userId: string,
    ownerId: string
  ): Promise<InventoryItem> {
    try {
      // 1. Obtener stock actual y VERIFICAR que pertenece al owner
      const { data: currentStock, error: fetchError } = await supabase
        .from('wine_branch_stock')
        .select(`
          stock_quantity,
          wine_id,
          wines!inner(owner_id)
        `)
        .eq('id', stockId)
        .eq('wines.owner_id', ownerId) // SEGURIDAD: Solo del owner
        .single();

      if (fetchError || !currentStock) {
        if (__DEV__) console.error('Error fetching current stock:', fetchError);
        throw new Error('Stock no encontrado o no tienes permisos');
      }

      // VERIFICACIÓN ADICIONAL: Asegurar que el wine pertenece al owner
      const wineOwnerId = (currentStock.wines as any)?.owner_id;
      if (wineOwnerId !== ownerId) {
        throw new Error('No tienes permisos para modificar este stock');
      }

      const previousQuantity = currentStock.stock_quantity;
      const newQuantity = Math.max(0, previousQuantity + quantityChange);

      // 2. Actualizar stock (solo si pertenece al owner)
      const { data: updatedStock, error: updateError } = await supabase
        .from('wine_branch_stock')
        .update({
          stock_quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stockId)
        .eq('wine_id', wineId) // SEGURIDAD: Verificar wine_id también
        .select(`
          id,
          wine_id,
          branch_id,
          stock_quantity,
          price_by_glass,
          price_by_bottle,
          created_at,
          updated_at,
          wines!inner (
            id,
            name,
            grape_variety,
            region,
            country,
            vintage,
            image_url,
            owner_id
          )
        `)
        .eq('wines.owner_id', ownerId) // SEGURIDAD: Solo del owner
        .single();

      if (updateError) {
        if (__DEV__) console.error('Error updating stock:', updateError);
        throw updateError;
      }

      // 3. Registrar movimiento (opcional - si la tabla existe)
      try {
        await this.recordMovement({
          wine_id: wineId,
          branch_id: branchId,
          movement_type: movementType,
          quantity: Math.abs(quantityChange),
          reason,
          user_id: userId,
          previous_quantity: previousQuantity,
          new_quantity: newQuantity,
        }, ownerId);
      } catch (movementError: any) {
        // Si la tabla no existe, solo logueamos pero no fallamos
        if (movementError?.code === 'PGRST205' && movementError?.message?.includes('inventory_movements')) {
          if (__DEV__) console.log('⚠️ Tabla inventory_movements no existe, continuando sin registrar movimiento');
        } else {
          // Re-lanzar otros errores
          throw movementError;
        }
      }

      if (__DEV__) console.log(`✅ Stock actualizado: ${previousQuantity} → ${newQuantity}`);
      return updatedStock;
    } catch (error) {
      if (__DEV__) console.error('Error in updateStock:', error);
      throw error;
    }
  }

  /**
   * Registrar movimiento de inventario
   */
  static async recordMovement(movement: InventoryMovement, ownerId: string): Promise<void> {
    try {
      // Asegurar que la sesión esté activa antes de insertar
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        if (__DEV__) console.warn('⚠️ No hay sesión activa, intentando refrescar...');
        // Intentar refrescar la sesión
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          if (__DEV__) console.error('❌ No se pudo obtener usuario autenticado:', userError);
          // Continuar de todas formas - el movimiento puede no registrarse pero el stock se actualizó
          if (__DEV__) console.warn('⚠️ Continuando sin registrar movimiento debido a falta de sesión');
          return;
        }
      }

      // Debug: obtener auth.uid() para comparar
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (__DEV__) {
        console.log('🔍 Debug recordMovement:', {
          ownerId_passed: ownerId,
          auth_uid: authUser?.id,
          movement_type: movement.movement_type,
          wine_id: movement.wine_id,
          branch_id: movement.branch_id,
        });
      }

      const { error } = await supabase
        .from('inventory_movements')
        .insert({
          ...movement,
          owner_id: ownerId, // AGREGAR owner_id
          created_at: new Date().toISOString(),
        });

      if (error) {
        if (__DEV__) {
          console.error('Error recording movement:', error);
          console.error('🔍 Debug: ownerId enviado:', ownerId, 'vs auth.uid():', authUser?.id);
        }
        // Si es error RLS, solo logueamos pero no fallamos (el stock ya se actualizó)
        if (error.code === '42501') {
          if (__DEV__) console.warn('⚠️ Error RLS al registrar movimiento, continuando...');
          return; // No lanzar error para que el stock update sea exitoso
        }
        throw error;
      }

      if (__DEV__) console.log(`📝 Movimiento registrado: ${movement.movement_type} - ${movement.quantity} unidades`);
    } catch (error) {
      if (__DEV__) {
        console.error('Error in recordMovement:', error);
        console.warn('⚠️ No se pudo registrar movimiento, pero el stock se actualizó correctamente');
      }
    }
  }

  /**
   * Ventas estimadas desde cortes (conteo inicial + eventos + conteo final).
   * Por vino: start_count = último count con created_at <= startDate, end_count = último count con created_at <= endDate.
   * No exige que ambos conteos estén dentro del rango (ej.: conteo hace 40 días + conteo hace 3 días en periodo 30 días es válido).
   * sold_estimated = start_count + entradas_periodo - end_count - salidas_especiales (solo cortesia_cliente, rotura).
   */
  static async getSalesFromCountsByPeriod(params: {
    ownerId: string;
    branchId: string;
    days: number;
  }): Promise<{ rows: SalesFromCountsRow[]; summary: SalesFromCountsSummary }> {
    const { ownerId, branchId, days } = params;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const bufferStart = new Date(startDate);
    bufferStart.setDate(bufferStart.getDate() - 3650);
    const startIso = bufferStart.toISOString();
    const endIso = endDate.toISOString();

    const { data: movements, error } = await supabase
      .from('inventory_movements')
      .select('wine_id, movement_type, reason, quantity, previous_quantity, new_quantity, created_at')
      .eq('branch_id', branchId)
      .eq('owner_id', ownerId)
      .in('movement_type', ['count', 'entrada', 'salida'])
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: true });

    if (error) {
      if (__DEV__) console.error('getSalesFromCountsByPeriod:', error);
      throw error;
    }

    const startTs = startDate.getTime();
    const endTs = endDate.getTime();
    const byWine = new Map<string, {
      counts: Array<{ new_quantity: number; created_at: string }>;
      entries: Array<{ qty: number; at: string }>;
      salidas: Array<{ qty: number; at: string; reason: string | null }>;
    }>();

    for (const row of movements || []) {
      const wineId = row.wine_id;
      if (!byWine.has(wineId)) {
        byWine.set(wineId, { counts: [], entries: [], salidas: [] });
      }
      const w = byWine.get(wineId)!;
      const at = row.created_at;
      if (row.movement_type === 'count') {
        w.counts.push({ new_quantity: row.new_quantity ?? 0, created_at: at });
      } else if (row.movement_type === 'entrada') {
        w.entries.push({ qty: row.quantity ?? 0, at });
      } else if (row.movement_type === 'salida') {
        w.salidas.push({ qty: row.quantity ?? 0, at, reason: row.reason ?? null });
      }
    }

    const inventory = await this.getInventoryByBranch(branchId, ownerId);
    const rows: SalesFromCountsRow[] = [];
    let total_sold = 0;
    let total_revenue: number | null = 0;
    let total_entries = 0;
    let total_special_outs = 0;
    let count_start_at: string | null = null;
    let count_end_at: string | null = null;
    let unpriced_consumption_total = 0;
    let unpriced_wines_count = 0;
    const specialReasons = ['cortesia_cliente', 'rotura'];

    for (const [wineId, w] of byWine) {
      w.counts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const startCount = w.counts.filter(c => new Date(c.created_at).getTime() <= startTs).pop();
      const endCount = w.counts.filter(c => new Date(c.created_at).getTime() <= endTs).pop();
      if (!startCount || !endCount) continue;

      const start_at = new Date(startCount.created_at).getTime();
      const end_at = new Date(endCount.created_at).getTime();
      if (!count_start_at || startCount.created_at < count_start_at) count_start_at = startCount.created_at;
      if (!count_end_at || endCount.created_at > count_end_at) count_end_at = endCount.created_at;

      const entries_total = w.entries
        .filter(e => { const t = new Date(e.at).getTime(); return t > start_at && t <= end_at; })
        .reduce((s, e) => s + e.qty, 0);
      const special_out_total = w.salidas
        .filter(e => {
          const t = new Date(e.at).getTime();
          const inRange = t > start_at && t <= end_at;
          const isSpecial = e.reason != null && specialReasons.includes(e.reason);
          return inRange && isSpecial;
        })
        .reduce((s, e) => s + e.qty, 0);

      const sold_estimated = startCount.new_quantity + entries_total - endCount.new_quantity - special_out_total;
      total_sold += sold_estimated;
      total_entries += entries_total;
      total_special_outs += special_out_total;

      const item = inventory.find(i => i.wine_id === wineId);
      const price = item?.price_by_bottle ?? null;
      const revenue_estimated = isValidPrice(price) ? sold_estimated * price : null;
      if (revenue_estimated != null) total_revenue = (total_revenue ?? 0) + revenue_estimated;
      if (sold_estimated > 0 && !isValidPrice(price)) {
        unpriced_consumption_total += sold_estimated;
        unpriced_wines_count += 1;
      }

      if (__DEV__) {
        console.log({
          wine_id: wineId,
          start_count: startCount.new_quantity,
          end_count: endCount.new_quantity,
          sold_estimated,
        });
      }

      rows.push({
        wine_id: wineId,
        wine_name: item?.wines?.name ?? 'Vino',
        sold_estimated,
        entries_total,
        special_out_total,
        start_count: startCount.new_quantity,
        end_count: endCount.new_quantity,
        last_count_at: endCount.created_at,
        price_by_bottle: price,
        revenue_estimated,
      });
    }

    rows.sort((a, b) => b.sold_estimated - a.sold_estimated);
    const valid_wines_count = rows.length;
    const summary: SalesFromCountsSummary = {
      total_sold_estimated: total_sold,
      total_revenue_estimated: total_revenue != null && total_revenue > 0 ? total_revenue : null,
      total_entries,
      total_special_outs,
      count_start_at,
      count_end_at,
      sufficient: valid_wines_count > 0,
      valid_wines_count,
      unpriced_consumption_total,
      unpriced_wines_count,
    };
    return { rows, summary };
  }

  /**
   * Comparativa entre sucursales usando la misma lógica que Ventas estimadas (cortes físicos).
   * No usa sale_items ni sales. Reutiliza getSalesFromCountsByPeriod por sucursal.
   */
  static async getBranchesComparisonFromCounts(params: {
    ownerId: string;
    days: number;
  }): Promise<{ branches: BranchComparisonRow[]; summary: BranchComparisonSummary }> {
    const { ownerId, days } = params;

    const { data: branchesData, error: branchesError } = await supabase
      .from('branches')
      .select('id, name')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });

    if (branchesError) {
      if (__DEV__) console.error('getBranchesComparisonFromCounts branches:', branchesError);
      return { branches: [], summary: { total_revenue_estimated: null, total_consumption_estimated: 0, best_branch: '—', worst_branch: '—', valid_branches_count: 0 } };
    }

    const branchesList = branchesData || [];
    if (branchesList.length === 0) {
      return { branches: [], summary: { total_revenue_estimated: null, total_consumption_estimated: 0, best_branch: '—', worst_branch: '—', valid_branches_count: 0 } };
    }

    const rows: BranchComparisonRow[] = [];
    for (const b of branchesList) {
      const branchId = b.id;
      const branchName = b.name;
      try {
        const { rows: salesRows, summary: salesSummary } = await this.getSalesFromCountsByPeriod({
          ownerId,
          branchId,
          days,
        });

        const total_revenue_estimated = salesSummary.total_revenue_estimated != null && isValidPrice(salesSummary.total_revenue_estimated)
          ? salesSummary.total_revenue_estimated
          : null;
        const total_consumption_estimated = salesSummary.total_sold_estimated ?? 0;

        let top_wine: { wine_name: string; sold_estimated: number } | null = null;
        let bottom_wine: { wine_name: string; sold_estimated: number } | null = null;
        if (salesRows.length > 0) {
          const bySold = [...salesRows].sort((a, b) => b.sold_estimated - a.sold_estimated);
          const top = bySold[0];
          top_wine = { wine_name: top.wine_name, sold_estimated: top.sold_estimated };
          const withPositive = bySold.filter(r => r.sold_estimated > 0);
          if (withPositive.length > 0) {
            const bottom = withPositive[withPositive.length - 1];
            bottom_wine = { wine_name: bottom.wine_name, sold_estimated: bottom.sold_estimated };
          }
        }

        rows.push({
          branch_id: branchId,
          branch_name: branchName,
          total_revenue_estimated,
          total_consumption_estimated,
          valid_wines_count: salesSummary.valid_wines_count,
          unpriced_consumption_total: salesSummary.unpriced_consumption_total ?? 0,
          top_wine,
          bottom_wine,
        });
      } catch (e) {
        if (__DEV__) console.warn('getBranchesComparisonFromCounts branch', branchId, e);
        rows.push({
          branch_id: branchId,
          branch_name: branchName,
          total_revenue_estimated: null,
          total_consumption_estimated: 0,
          valid_wines_count: 0,
          unpriced_consumption_total: 0,
          top_wine: null,
          bottom_wine: null,
        });
      }
    }

    const withData = rows.filter(r => r.valid_wines_count > 0);
    const total_revenue_estimated = withData.reduce((s, r) => s + (r.total_revenue_estimated ?? 0), 0);
    const total_consumption_estimated = rows.reduce((s, r) => s + r.total_consumption_estimated, 0);

    let best_branch = '—';
    let worst_branch = '—';
    if (withData.length > 0) {
      const byRevenue = [...withData].sort((a, b) => (b.total_revenue_estimated ?? 0) - (a.total_revenue_estimated ?? 0));
      best_branch = byRevenue[0].branch_name;
      worst_branch = byRevenue[byRevenue.length - 1].branch_name;
    }

    const summary: BranchComparisonSummary = {
      total_revenue_estimated: total_revenue_estimated > 0 ? total_revenue_estimated : null,
      total_consumption_estimated,
      best_branch,
      worst_branch,
      valid_branches_count: withData.length,
    };

    return { branches: rows, summary };
  }

  /**
   * Ventas estimadas por periodo (conteos tipo count). Para reporte PDF (legacy/alternativo).
   */
  static async getEstimatedSalesByPeriod(
    branchId: string,
    ownerId: string,
    fromDate: string,
    toDate: string
  ): Promise<EstimatedSalesRow[]> {
    try {
      const { data: movements, error } = await supabase
        .from('inventory_movements')
        .select('wine_id, estimated_sold, received_quantity, created_at')
        .eq('branch_id', branchId)
        .eq('owner_id', ownerId)
        .eq('movement_type', 'count')
        .gte('created_at', fromDate)
        .lte('created_at', toDate);

      if (error) {
        if (__DEV__) console.error('Error getEstimatedSalesByPeriod:', error);
        throw error;
      }

      const byWine = new Map<string, { sold: number; received: number; lastAt: string }>();
      for (const row of movements || []) {
        const wineId = row.wine_id;
        const current = byWine.get(wineId) || { sold: 0, received: 0, lastAt: row.created_at };
        current.sold += Number((row as any).estimated_sold ?? 0);
        current.received += Number((row as any).received_quantity ?? 0);
        if (row.created_at && (!current.lastAt || row.created_at > current.lastAt)) {
          current.lastAt = row.created_at;
        }
        byWine.set(wineId, current);
      }

      const inventory = await this.getInventoryByBranch(branchId, ownerId);
      const rows: EstimatedSalesRow[] = [];
      for (const [wineId, agg] of byWine) {
        const item = inventory.find((i) => i.wine_id === wineId);
        const price = item?.price_by_bottle ?? null;
        const revenue = isValidPrice(price) ? agg.sold * price : null;
        rows.push({
          wine_id: wineId,
          wine_name: item?.wines?.name ?? 'Vino',
          sold_estimated_total: agg.sold,
          received_total: agg.received,
          last_count_at: agg.lastAt,
          price_by_bottle: price,
          revenue_estimated: revenue,
        });
      }
      return rows.sort((a, b) => b.sold_estimated_total - a.sold_estimated_total);
    } catch (e) {
      if (__DEV__) console.error('getEstimatedSalesByPeriod:', e);
      throw e;
    }
  }

  /**
   * Obtener historial de movimientos de un vino
   */
  static async getMovementHistory(wineId: string, branchId: string, ownerId: string): Promise<InventoryMovement[]> {
    try {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('wine_id', wineId)
        .eq('branch_id', branchId)
        .eq('owner_id', ownerId) // FILTRO POR OWNER
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        if (__DEV__) console.error('Error fetching movement history:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      if (__DEV__) console.error('Error in getMovementHistory:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas del inventario
   */
  static async getInventoryStats(branchId: string, ownerId: string): Promise<InventoryStats> {
    try {
      const inventory = await this.getInventoryByBranch(branchId, ownerId);

      const stats: InventoryStats = {
        totalWines: inventory.length,
        totalBottles: inventory.reduce((sum, item) => sum + item.stock_quantity, 0),
        totalValue: inventory.reduce((sum, item) => {
          if (!isValidPrice(item.price_by_bottle)) return sum;
          return sum + item.stock_quantity * item.price_by_bottle;
        }, 0),
        lowStockCount: 0, // Stock mínimo removido según solicitud del usuario
      };

      return stats;
    } catch (error) {
      if (__DEV__) console.error('Error in getInventoryStats:', error);
      throw error;
    }
  }

  /**
   * Obtener vinos con stock bajo (función deshabilitada - stock mínimo removido)
   */
  static async getLowStockWines(branchId: string, ownerId: string): Promise<InventoryItem[]> {
    try {
      const inventory = await this.getInventoryByBranch(branchId, ownerId);
      return []; // Retornar array vacío ya que el stock mínimo fue removido
    } catch (error) {
      if (__DEV__) console.error('Error in getLowStockWines:', error);
      throw error;
    }
  }

  /**
   * Procesar venta (reduce stock automáticamente)
   */
  static async processSale(
    stockId: string,
    wineId: string,
    branchId: string,
    quantity: number,
    userId: string,
    ownerId: string,
    saleDetails: string
  ): Promise<InventoryItem> {
    try {
      return await this.updateStock(
        stockId,
        wineId,
        branchId,
        -quantity, // Cantidad negativa para reducir stock
        'venta',
        saleDetails,
        userId,
        ownerId
      );
    } catch (error) {
      if (__DEV__) console.error('Error in processSale:', error);
      throw error;
    }
  }
}
