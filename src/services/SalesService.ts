import { supabase } from './supabase';
import { InventoryService } from './InventoryService';

export interface SaleItem {
  wine_id: string;
  quantity: number;
  unit_price: number;
  is_bottle: boolean; // true = botella completa, false = copa
}

export interface Sale {
  id?: string;
  branch_id: string;
  guest_session_id: string | null;
  user_id: string | null; // Staff que registró la venta
  sale_type: 'guest' | 'table' | 'direct'; // guest = comensal QR, table = mesa, direct = venta directa
  items: SaleItem[];
  total_amount: number;
  payment_status: 'pending' | 'paid' | 'cancelled';
  created_at?: string;
  owner_id: string;
  idempotency_key?: string; // Clave de idempotencia para prevenir ventas duplicadas
}

export interface SaleRecord {
  id: string;
  branch_id: string;
  guest_session_id: string | null;
  user_id: string | null;
  sale_type: string;
  total_amount: number;
  payment_status: string;
  created_at: string;
  owner_id: string;
}

export class SalesService {
  /**
   * Procesar una venta (comensales o staff)
   * Automáticamente actualiza el inventario
   */
  static async processSale(sale: Sale): Promise<SaleRecord> {
    try {
      console.log('🛒 Procesando venta:', sale);

      // 1. Validar que hay suficiente stock para todos los items
      for (const item of sale.items) {
        if (item.is_bottle) {
          const { data: stockData, error: stockError } = await supabase
            .from('wine_branch_stock')
            .select('quantity, wines(name)')
            .eq('wine_id', item.wine_id)
            .eq('branch_id', sale.branch_id)
            .single();

          if (stockError) {
            throw new Error(`Error al verificar stock: ${stockError.message}`);
          }

          if (!stockData || stockData.quantity < item.quantity) {
            throw new Error(
              `Stock insuficiente para ${stockData?.wines?.name || 'el vino'}. ` +
                `Disponible: ${stockData?.quantity || 0}, Solicitado: ${item.quantity}`
            );
          }
        }
      }

      // 2. Crear registro de venta con idempotencia
      let saleRecord: any;
      
      if (sale.idempotency_key) {
        // Usar upsert para idempotencia: si ya existe, devolver la existente
        const { data: existingSale, error: selectError } = await supabase
          .from('sales')
          .select('*')
          .eq('owner_id', sale.owner_id)
          .eq('idempotency_key', sale.idempotency_key)
          .single();

        if (existingSale && !selectError) {
          // Venta ya existe, devolver la existente (idempotencia)
          console.log('✅ Venta idempotente encontrada (ya existía):', existingSale.id);
          saleRecord = existingSale;
        } else {
          // Intentar insertar con upsert
          const { data: upsertData, error: upsertError } = await supabase
            .from('sales')
            .upsert(
              {
                branch_id: sale.branch_id,
                guest_session_id: sale.guest_session_id,
                user_id: sale.user_id,
                sale_type: sale.sale_type,
                total_amount: sale.total_amount,
                payment_status: sale.payment_status,
                owner_id: sale.owner_id,
                idempotency_key: sale.idempotency_key,
                created_at: new Date().toISOString(),
              },
              {
                onConflict: 'owner_id,idempotency_key',
                ignoreDuplicates: false,
              }
            )
            .select()
            .single();

          if (upsertError) {
            // Si hay error de unique constraint, intentar obtener la venta existente
            if (upsertError.code === '23505' || upsertError.message.includes('unique')) {
              console.log('⚠️ Conflicto de idempotencia, recuperando venta existente...');
              const { data: recoveredSale, error: recoverError } = await supabase
                .from('sales')
                .select('*')
                .eq('owner_id', sale.owner_id)
                .eq('idempotency_key', sale.idempotency_key)
                .single();

              if (recoveredSale && !recoverError) {
                console.log('✅ Venta recuperada (idempotencia):', recoveredSale.id);
                saleRecord = recoveredSale;
              } else {
                console.error('Error recuperando venta existente:', recoverError);
                throw new Error(`Error al registrar venta: ${upsertError.message}`);
              }
            } else {
              console.error('Error creando venta:', upsertError);
              throw new Error(`Error al registrar venta: ${upsertError.message}`);
            }
          } else {
            saleRecord = upsertData;
          }
        }
      } else {
        // Sin idempotency_key: comportamiento normal (insert)
        const { data: insertData, error: insertError } = await supabase
          .from('sales')
          .insert({
            branch_id: sale.branch_id,
            guest_session_id: sale.guest_session_id,
            user_id: sale.user_id,
            sale_type: sale.sale_type,
            total_amount: sale.total_amount,
            payment_status: sale.payment_status,
            owner_id: sale.owner_id,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creando venta:', insertError);
          throw new Error(`Error al registrar venta: ${insertError.message}`);
        }

        saleRecord = insertData;
      }

      console.log('✅ Venta registrada:', saleRecord.id);

      // 3. Verificar si la venta ya tenía items (idempotencia)
      const { data: existingItems, error: checkItemsError } = await supabase
        .from('sale_items')
        .select('id')
        .eq('sale_id', saleRecord.id)
        .limit(1);

      if (checkItemsError) {
        console.error('Error verificando items existentes:', checkItemsError);
      }

      // Solo crear items si la venta es nueva (no tiene items)
      if (!existingItems || existingItems.length === 0) {
        const saleItemsData = sale.items.map((item) => ({
          sale_id: saleRecord.id,
          wine_id: item.wine_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          is_bottle: item.is_bottle,
          subtotal: item.quantity * item.unit_price,
        }));

        const { error: itemsError } = await supabase.from('sale_items').insert(saleItemsData);

        if (itemsError) {
          console.error('Error creando items de venta:', itemsError);
          // Si falla y la venta es nueva (no idempotente), eliminarla
          if (!sale.idempotency_key) {
            await supabase.from('sales').delete().eq('id', saleRecord.id);
          }
          throw new Error(`Error al registrar items de venta: ${itemsError.message}`);
        }

        console.log(`✅ ${saleItemsData.length} items registrados`);
      } else {
        console.log('✅ Items ya existían (idempotencia), omitiendo creación');
      }

      // 4. Actualizar inventario (solo para botellas completas)
      for (const item of sale.items) {
        if (item.is_bottle && item.quantity > 0) {
          // Obtener el stock_id
          const { data: stockData, error: stockError } = await supabase
            .from('wine_branch_stock')
            .select('id')
            .eq('wine_id', item.wine_id)
            .eq('branch_id', sale.branch_id)
            .single();

          if (stockError) {
            console.error('Error obteniendo stock_id:', stockError);
            continue;
          }

          try {
            await InventoryService.processSale(
              stockData.id,
              item.wine_id,
              sale.branch_id,
              item.quantity,
              sale.user_id || 'guest',
              sale.owner_id,
              `Venta ${sale.sale_type} - ID: ${saleRecord.id}`
            );
            console.log(`✅ Inventario actualizado para wine_id: ${item.wine_id}`);
          } catch (invError) {
            console.error('Error actualizando inventario:', invError);
            // No lanzar error aquí para no bloquear la venta, pero registrar el problema
          }
        }
      }

      console.log('🎉 Venta procesada exitosamente');
      return saleRecord;
    } catch (error) {
      console.error('Error en processSale:', error);
      throw error;
    }
  }

  /**
   * Obtener historial de ventas de una sucursal
   */
  static async getSalesByBranch(branchId: string, ownerId: string, limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(
          `
          id,
          sale_type,
          total_amount,
          payment_status,
          created_at,
          owner_id,
          guest_sessions(id),
          users(username)
        `
        )
        .eq('branch_id', branchId)
        .eq('owner_id', ownerId) // FILTRO POR OWNER
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching sales:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getSalesByBranch:', error);
      throw error;
    }
  }

  /**
   * Obtener detalles de una venta específica
   */
  static async getSaleDetails(saleId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(
          `
          id,
          branch_id,
          sale_type,
          total_amount,
          payment_status,
          created_at,
          sale_items(
            wine_id,
            quantity,
            unit_price,
            is_bottle,
            subtotal,
            wines(name, image_url)
          )
        `
        )
        .eq('id', saleId)
        .single();

      if (error) {
        console.error('Error fetching sale details:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in getSaleDetails:', error);
      throw error;
    }
  }

  /**
   * Calcular estadísticas de ventas
   */
  static async getSalesStats(branchId: string, ownerId: string, dateFrom?: Date, dateTo?: Date): Promise<any> {
    try {
      let query = supabase
        .from('sales')
        .select('total_amount, payment_status, created_at, owner_id')
        .eq('branch_id', branchId)
        .eq('owner_id', ownerId); // FILTRO POR OWNER

      if (dateFrom) {
        query = query.gte('created_at', dateFrom.toISOString());
      }

      if (dateTo) {
        query = query.lte('created_at', dateTo.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching sales stats:', error);
        throw error;
      }

      const stats = {
        totalSales: data.length,
        totalRevenue: data.reduce((sum, sale) => sum + sale.total_amount, 0),
        paidSales: data.filter((s) => s.payment_status === 'paid').length,
        pendingSales: data.filter((s) => s.payment_status === 'pending').length,
        averageTicket: data.length > 0 ? data.reduce((sum, sale) => sum + sale.total_amount, 0) / data.length : 0,
      };

      return stats;
    } catch (error) {
      console.error('Error in getSalesStats:', error);
      throw error;
    }
  }

  /**
   * Cancelar una venta (revierte el inventario si aplica)
   */
  static async cancelSale(saleId: string, userId: string, ownerId: string): Promise<void> {
    try {
      // 1. Obtener detalles de la venta
      const saleDetails = await this.getSaleDetails(saleId);

      if (saleDetails.payment_status === 'cancelled') {
        throw new Error('Esta venta ya está cancelada');
      }

      // 2. Revertir inventario
      for (const item of saleDetails.sale_items) {
        if (item.is_bottle && item.quantity > 0) {
          const { data: stockData, error: stockError } = await supabase
            .from('wine_branch_stock')
            .select('id')
            .eq('wine_id', item.wine_id)
            .eq('branch_id', saleDetails.branch_id)
            .single();

          if (stockError) {
            console.error('Error obteniendo stock_id:', stockError);
            continue;
          }

          try {
            await InventoryService.updateStock(
              stockData.id,
              item.wine_id,
              saleDetails.branch_id,
              item.quantity, // Cantidad positiva para devolver al stock
              'ajuste',
              `Cancelación de venta - ID: ${saleId}`,
              userId,
              ownerId
            );
          } catch (invError) {
            console.error('Error revirtiendo inventario:', invError);
          }
        }
      }

      // 3. Marcar venta como cancelada
      const { error: updateError } = await supabase
        .from('sales')
        .update({ payment_status: 'cancelled' })
        .eq('id', saleId);

      if (updateError) {
        console.error('Error cancelando venta:', updateError);
        throw updateError;
      }

      console.log('✅ Venta cancelada y stock revertido');
    } catch (error) {
      console.error('Error in cancelSale:', error);
      throw error;
    }
  }
}





