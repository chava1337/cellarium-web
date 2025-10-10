import { supabase } from './supabase';
import { WineStock, InventoryMovement, BranchStats } from '../types';

export class InventoryService {
  // Obtener stock de vinos por sucursal
  static async getStockByBranch(branchId: string): Promise<WineStock[]> {
    try {
      const { data, error } = await supabase
        .from('wine_branch_stock')
        .select(`
          id,
          wine_id,
          branch_id,
          quantity,
          min_stock,
          created_at,
          updated_at,
          wines (
            id,
            name,
            grape_variety,
            region,
            country,
            vintage,
            alcohol_content,
            description,
            price,
            image_url,
            created_at,
            updated_at
          )
        `)
        .eq('branch_id', branchId);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching stock by branch:', error);
      throw error;
    }
  }

  // Actualizar stock de un vino
  static async updateStock(
    wineId: string,
    branchId: string,
    newQuantity: number,
    reason: string = 'Ajuste manual'
  ): Promise<void> {
    try {
      // Obtener stock actual
      const { data: currentStock, error: stockError } = await supabase
        .from('wine_branch_stock')
        .select('quantity')
        .eq('wine_id', wineId)
        .eq('branch_id', branchId)
        .single();

      if (stockError) {
        throw stockError;
      }

      const currentQuantity = currentStock?.quantity || 0;
      const quantityDifference = newQuantity - currentQuantity;

      // Actualizar stock
      const { error: updateError } = await supabase
        .from('wine_branch_stock')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('wine_id', wineId)
        .eq('branch_id', branchId);

      if (updateError) {
        throw updateError;
      }

      // Registrar movimiento de inventario
      const movementType = quantityDifference > 0 ? 'in' : quantityDifference < 0 ? 'out' : 'adjustment';
      
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          wine_id: wineId,
          branch_id: branchId,
          movement_type: movementType,
          quantity: Math.abs(quantityDifference),
          reason: reason,
          created_at: new Date().toISOString(),
        });

      if (movementError) {
        console.error('Error recording inventory movement:', movementError);
        // No lanzamos error aquí porque el stock ya se actualizó
      }
    } catch (error) {
      console.error('Error updating stock:', error);
      throw error;
    }
  }

  // Agregar stock a un vino
  static async addStock(
    wineId: string,
    branchId: string,
    quantity: number,
    reason: string = 'Entrada de stock'
  ): Promise<void> {
    try {
      // Obtener stock actual
      const { data: currentStock, error: stockError } = await supabase
        .from('wine_branch_stock')
        .select('quantity')
        .eq('wine_id', wineId)
        .eq('branch_id', branchId)
        .single();

      if (stockError) {
        throw stockError;
      }

      const currentQuantity = currentStock?.quantity || 0;
      const newQuantity = currentQuantity + quantity;

      // Actualizar stock
      const { error: updateError } = await supabase
        .from('wine_branch_stock')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('wine_id', wineId)
        .eq('branch_id', branchId);

      if (updateError) {
        throw updateError;
      }

      // Registrar movimiento de inventario
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          wine_id: wineId,
          branch_id: branchId,
          movement_type: 'in',
          quantity: quantity,
          reason: reason,
          created_at: new Date().toISOString(),
        });

      if (movementError) {
        console.error('Error recording inventory movement:', movementError);
      }
    } catch (error) {
      console.error('Error adding stock:', error);
      throw error;
    }
  }

  // Reducir stock de un vino
  static async reduceStock(
    wineId: string,
    branchId: string,
    quantity: number,
    reason: string = 'Salida de stock'
  ): Promise<void> {
    try {
      // Obtener stock actual
      const { data: currentStock, error: stockError } = await supabase
        .from('wine_branch_stock')
        .select('quantity')
        .eq('wine_id', wineId)
        .eq('branch_id', branchId)
        .single();

      if (stockError) {
        throw stockError;
      }

      const currentQuantity = currentStock?.quantity || 0;
      
      if (currentQuantity < quantity) {
        throw new Error('Stock insuficiente');
      }

      const newQuantity = currentQuantity - quantity;

      // Actualizar stock
      const { error: updateError } = await supabase
        .from('wine_branch_stock')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('wine_id', wineId)
        .eq('branch_id', branchId);

      if (updateError) {
        throw updateError;
      }

      // Registrar movimiento de inventario
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          wine_id: wineId,
          branch_id: branchId,
          movement_type: 'out',
          quantity: quantity,
          reason: reason,
          created_at: new Date().toISOString(),
        });

      if (movementError) {
        console.error('Error recording inventory movement:', movementError);
      }
    } catch (error) {
      console.error('Error reducing stock:', error);
      throw error;
    }
  }

  // Obtener vinos con stock bajo
  static async getLowStockWines(branchId: string): Promise<WineStock[]> {
    try {
      const { data, error } = await supabase
        .from('wine_branch_stock')
        .select(`
          id,
          wine_id,
          branch_id,
          quantity,
          min_stock,
          created_at,
          updated_at,
          wines (
            id,
            name,
            grape_variety,
            region,
            country,
            vintage,
            alcohol_content,
            description,
            price,
            image_url,
            created_at,
            updated_at
          )
        `)
        .eq('branch_id', branchId)
        .lte('quantity', 'min_stock');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching low stock wines:', error);
      throw error;
    }
  }

  // Obtener movimientos de inventario
  static async getInventoryMovements(
    branchId: string,
    wineId?: string,
    limit: number = 50
  ): Promise<InventoryMovement[]> {
    try {
      let query = supabase
        .from('inventory_movements')
        .select(`
          id,
          wine_id,
          branch_id,
          movement_type,
          quantity,
          reason,
          created_at,
          wines (
            id,
            name
          )
        `)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (wineId) {
        query = query.eq('wine_id', wineId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching inventory movements:', error);
      throw error;
    }
  }

  // Obtener estadísticas de inventario por sucursal
  static async getBranchStats(branchId: string): Promise<BranchStats> {
    try {
      const { data, error } = await supabase
        .from('wine_branch_stock')
        .select(`
          quantity,
          min_stock,
          wines (
            price
          )
        `)
        .eq('branch_id', branchId);

      if (error) {
        throw error;
      }

      const stats: BranchStats = {
        branch_id: branchId,
        branch_name: '', // Se puede obtener por separado
        total_wines: data?.length || 0,
        total_stock: data?.reduce((sum, item) => sum + item.quantity, 0) || 0,
        low_stock_wines: data?.filter(item => item.quantity <= item.min_stock).length || 0,
        total_value: data?.reduce((sum, item) => sum + (item.quantity * ((item.wines as any)?.price || 0)), 0) || 0,
      };

      return stats;
    } catch (error) {
      console.error('Error fetching branch stats:', error);
      throw error;
    }
  }

  // Crear stock inicial para un vino en una sucursal
  static async createInitialStock(
    wineId: string,
    branchId: string,
    quantity: number,
    minStock: number = 5
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('wine_branch_stock')
        .insert({
          wine_id: wineId,
          branch_id: branchId,
          quantity: quantity,
          min_stock: minStock,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (error) {
        throw error;
      }

      // Registrar movimiento inicial
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          wine_id: wineId,
          branch_id: branchId,
          movement_type: 'in',
          quantity: quantity,
          reason: 'Stock inicial',
          created_at: new Date().toISOString(),
        });

      if (movementError) {
        console.error('Error recording initial stock movement:', movementError);
      }
    } catch (error) {
      console.error('Error creating initial stock:', error);
      throw error;
    }
  }
}
