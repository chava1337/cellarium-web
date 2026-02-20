import { supabase } from './supabase';

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

export class InventoryService {
  /**
   * Obtener todo el inventario de una sucursal
   */
  static async getInventoryByBranch(branchId: string, ownerId: string): Promise<InventoryItem[]> {
    try {
      console.log(`📦 InventoryService: Obteniendo inventario para branch ${branchId}, owner ${ownerId}`);
      
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
        console.error('Error fetching inventory:', error);
        throw error;
      }

      console.log(`📦 InventoryService: Registros obtenidos:`, data?.length || 0);
      console.log(`📦 InventoryService: Detalle:`, data?.map(item => ({
        stock_id: item.id,
        wine_id: item.wine_id,
        wine_name: item.wines?.name || 'SIN DATOS',
        wine_owner_id: item.wines?.owner_id || 'SIN OWNER',
        stock_quantity: item.stock_quantity
      })));

      return data || [];
    } catch (error) {
      console.error('Error in getInventoryByBranch:', error);
      throw error;
    }
  }

  /**
   * Actualizar cantidad de stock (entrada o salida)
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
        console.error('Error fetching current stock:', fetchError);
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
        console.error('Error updating stock:', updateError);
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
          console.log('⚠️ Tabla inventory_movements no existe, continuando sin registrar movimiento');
        } else {
          // Re-lanzar otros errores
          throw movementError;
        }
      }

      console.log(`✅ Stock actualizado: ${previousQuantity} → ${newQuantity}`);
      return updatedStock;
    } catch (error) {
      console.error('Error in updateStock:', error);
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
        console.warn('⚠️ No hay sesión activa, intentando refrescar...');
        // Intentar refrescar la sesión
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          console.error('❌ No se pudo obtener usuario autenticado:', userError);
          // Continuar de todas formas - el movimiento puede no registrarse pero el stock se actualizó
          console.warn('⚠️ Continuando sin registrar movimiento debido a falta de sesión');
          return;
        }
      }

      // Debug: obtener auth.uid() para comparar
      const { data: { user: authUser } } = await supabase.auth.getUser();
      console.log('🔍 Debug recordMovement:', {
        ownerId_passed: ownerId,
        auth_uid: authUser?.id,
        movement_type: movement.movement_type,
        wine_id: movement.wine_id,
        branch_id: movement.branch_id,
      });

      const { error } = await supabase
        .from('inventory_movements')
        .insert({
          ...movement,
          owner_id: ownerId, // AGREGAR owner_id
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error recording movement:', error);
        console.error('🔍 Debug: ownerId enviado:', ownerId, 'vs auth.uid():', authUser?.id);
        // Si es error RLS, solo logueamos pero no fallamos (el stock ya se actualizó)
        if (error.code === '42501') {
          console.warn('⚠️ Error RLS al registrar movimiento, continuando...');
          return; // No lanzar error para que el stock update sea exitoso
        }
        throw error;
      }

      console.log(`📝 Movimiento registrado: ${movement.movement_type} - ${movement.quantity} unidades`);
    } catch (error) {
      console.error('Error in recordMovement:', error);
      // No lanzar error para que el stock update sea exitoso
      // El movimiento es opcional, el stock ya se actualizó
      console.warn('⚠️ No se pudo registrar movimiento, pero el stock se actualizó correctamente');
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
        console.error('Error fetching movement history:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getMovementHistory:', error);
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
        totalValue: inventory.reduce((sum, item) => sum + (item.stock_quantity * (item.price_by_bottle || 0)), 0),
        lowStockCount: 0, // Stock mínimo removido según solicitud del usuario
      };

      return stats;
    } catch (error) {
      console.error('Error in getInventoryStats:', error);
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
      console.error('Error in getLowStockWines:', error);
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
      console.error('Error in processSale:', error);
      throw error;
    }
  }
}
