import { supabase } from './supabase';
import { Wine } from '../types';

// =====================================================
// TIPOS E INTERFACES
// =====================================================

export interface TastingExam {
  id: string;
  branch_id: string;
  owner_id: string;
  created_by: string;
  name: string;
  description?: string;
  enabled: boolean;
  enabled_at?: string;
  enabled_until?: string;
  duration_hours?: number; // 1, 3, o 6
  permanently_disabled: boolean;
  disabled_reason?: string;
  created_at: string;
  updated_at: string;
  wines?: TastingExamWine[];
  wines_count?: number;
}

export interface TastingExamWine {
  id: string;
  exam_id: string;
  wine_id: string;
  order_index: number;
  wine?: Wine;
}

export interface TastingResponse {
  id: string;
  exam_id: string;
  user_id: string;
  user_name: string;
  completed_at: string;
  created_at: string;
  wine_responses?: TastingWineResponse[];
}

export interface TastingWineResponse {
  id: string;
  response_id: string;
  wine_id: string;
  // FASE VISUAL
  body_intensity?: number; // 1-5 (solo tintos)
  clarity?: number; // 1-5 (blancos y rosados)
  effervescence?: number; // 1-5 (solo espumosos)
  alcohol_level?: number; // 1-10 (basado en lágrimas/piernas)
  // FASE OLFATIVA
  detected_aromas?: string[];
  other_aromas?: string;
  aroma_intensity?: 'fuertes' | 'sutiles';
  aroma_quality?: 'agradables' | 'desagradables';
  aroma_complexity?: 'varios_mezclados' | 'uno_destacado';
  // FASE GUSTATIVA
  first_impact?: string; // suave, vibrante, dulce, ácido, cálido, otra
  other_first_impact?: string;
  recognized_flavors?: string[];
  other_flavors?: string;
  acidity_level?: number; // 1-10
  tannin_level?: number; // 1-10 (solo tintos)
  alcohol_sensation?: number; // 1-5
  body?: 'ligero' | 'medio' | 'robusto';
  persistence?: 'baja' | 'media' | 'alta';
  detected_tastes?: string;
  created_at: string;
  updated_at: string;
}

// =====================================================
// SERVICIO
// =====================================================

export class TastingExamService {
  /**
   * Obtener todos los exámenes de una sucursal
   */
  static async getExamsByBranch(
    branchId: string,
    ownerId: string
  ): Promise<TastingExam[]> {
    try {
      const { data, error } = await supabase
        .from('tasting_exams')
        .select(`
          *,
          tasting_exam_wines (
            id,
            wine_id,
            order_index
          )
        `)
        .eq('branch_id', branchId)
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Contar vinos por examen
      const exams = (data || []).map((exam: any) => ({
        ...exam,
        wines_count: exam.tasting_exam_wines?.length || 0,
      }));

      return exams;
    } catch (error) {
      console.error('Error fetching tasting exams:', error);
      throw error;
    }
  }

  /**
   * Obtener un examen específico con sus vinos
   */
  static async getExamById(
    examId: string,
    ownerId: string
  ): Promise<TastingExam | null> {
    try {
      // Primero obtener el examen
      const { data: examData, error: examError } = await supabase
        .from('tasting_exams')
        .select('*')
        .eq('id', examId)
        .eq('owner_id', ownerId)
        .single();

      if (examError) throw examError;
      if (!examData) return null;

      // Luego obtener los vinos del examen
      const { data: examWinesData, error: winesError } = await supabase
        .from('tasting_exam_wines')
        .select(`
          id,
          wine_id,
          order_index,
          wines (
            id,
            name,
            winery,
            grape_variety,
            region,
            country,
            vintage,
            alcohol_content,
            description,
            image_url,
            type,
            body_level,
            sweetness_level,
            acidity_level,
            intensity_level,
            fizziness_level,
            food_pairings,
            serving_temperature,
            owner_id
          )
        `)
        .eq('exam_id', examId)
        .order('order_index', { ascending: true });

      if (winesError) {
        console.error('Error fetching exam wines:', winesError);
        // Si hay error obteniendo vinos, devolver el examen sin vinos
        return {
          ...examData,
          wines: [],
          wines_count: 0,
        };
      }

      // Filtrar vinos que pertenezcan al owner (por si las políticas RLS no funcionan en el join)
      const filteredWines = (examWinesData || [])
        .map((ew: any) => ({
          id: ew.id,
          wine_id: ew.wine_id,
          order_index: ew.order_index,
          wine: ew.wines && ew.wines.owner_id === ownerId ? ew.wines : null,
        }))
        .filter((ew: any) => ew.wine !== null);

      return {
        ...examData,
        wines: filteredWines,
        wines_count: filteredWines.length,
      };
    } catch (error) {
      console.error('Error fetching tasting exam:', error);
      throw error;
    }
  }

  /**
   * Crear un nuevo examen
   */
  static async createExam({
    branchId,
    ownerId,
    userId,
    name,
    description,
    wineIds,
  }: {
    branchId: string;
    ownerId: string;
    userId: string;
    name: string;
    description?: string;
    wineIds: string[];
  }): Promise<TastingExam> {
    try {
      // Verificar límite de 10 exámenes
      const existingExams = await this.getExamsByBranch(branchId, ownerId);
      if (existingExams.length >= 10) {
        throw new Error('No se pueden crear más de 10 exámenes por sucursal');
      }

      // Crear el examen
      const { data: exam, error: examError } = await supabase
        .from('tasting_exams')
        .insert({
          branch_id: branchId,
          owner_id: ownerId,
          created_by: userId,
          name,
          description,
          enabled: false,
        })
        .select()
        .single();

      if (examError) throw examError;
      if (!exam) throw new Error('No se pudo crear el examen');

      // Agregar vinos al examen
      if (wineIds.length > 0) {
        const examWines = wineIds.map((wineId, index) => ({
          exam_id: exam.id,
          wine_id: wineId,
          order_index: index,
        }));

        const { error: winesError } = await supabase
          .from('tasting_exam_wines')
          .insert(examWines);

        if (winesError) {
          // Si falla, eliminar el examen creado
          await supabase.from('tasting_exams').delete().eq('id', exam.id);
          throw winesError;
        }
      }

      // Obtener el examen completo con vinos
      const fullExam = await this.getExamById(exam.id, ownerId);
      if (!fullExam) throw new Error('No se pudo obtener el examen creado');

      return fullExam;
    } catch (error) {
      console.error('Error creating tasting exam:', error);
      throw error;
    }
  }

  /**
   * Habilitar un examen por un tiempo determinado
   */
  static async enableExam({
    examId,
    ownerId,
    durationHours,
  }: {
    examId: string;
    ownerId: string;
    durationHours: 1 | 3 | 6;
  }): Promise<void> {
    try {
      const enabledAt = new Date();
      const enabledUntil = new Date(enabledAt.getTime() + durationHours * 60 * 60 * 1000);

      const { error } = await supabase
        .from('tasting_exams')
        .update({
          enabled: true,
          enabled_at: enabledAt.toISOString(),
          enabled_until: enabledUntil.toISOString(),
          duration_hours: durationHours,
          updated_at: new Date().toISOString(),
        })
        .eq('id', examId)
        .eq('owner_id', ownerId);

      if (error) throw error;
    } catch (error) {
      console.error('Error enabling tasting exam:', error);
      throw error;
    }
  }

  /**
   * Deshabilitar un examen
   */
  static async disableExam({
    examId,
    ownerId,
  }: {
    examId: string;
    ownerId: string;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('tasting_exams')
        .update({
          enabled: false,
          enabled_at: null,
          enabled_until: null,
          duration_hours: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', examId)
        .eq('owner_id', ownerId);

      if (error) throw error;
    } catch (error) {
      console.error('Error disabling tasting exam:', error);
      throw error;
    }
  }

  /**
   * Eliminar un examen
   */
  static async deleteExam({
    examId,
    ownerId,
  }: {
    examId: string;
    ownerId: string;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('tasting_exams')
        .delete()
        .eq('id', examId)
        .eq('owner_id', ownerId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting tasting exam:', error);
      throw error;
    }
  }

  /**
   * Obtener exámenes habilitados para un usuario
   */
  static async getEnabledExams(
    branchId: string,
    ownerId: string,
    userId: string
  ): Promise<TastingExam[]> {
    try {
      const now = new Date().toISOString();

      // Obtener exámenes habilitados
      const { data: exams, error: examsError } = await supabase
        .from('tasting_exams')
        .select(`
          *,
          tasting_exam_wines (
            id,
            wine_id,
            order_index
          )
        `)
        .eq('branch_id', branchId)
        .eq('owner_id', ownerId)
        .eq('enabled', true)
        .eq('permanently_disabled', false)
        .gte('enabled_until', now)
        .order('created_at', { ascending: false });

      if (examsError) throw examsError;

      // Filtrar exámenes que el usuario ya completó
      const { data: completedResponses, error: responsesError } = await supabase
        .from('tasting_responses')
        .select('exam_id')
        .eq('user_id', userId)
        .in(
          'exam_id',
          (exams || []).map((e) => e.id)
        );

      if (responsesError) throw responsesError;

      const completedExamIds = new Set(
        (completedResponses || []).map((r) => r.exam_id)
      );

      const availableExams = (exams || []).filter(
        (exam) => !completedExamIds.has(exam.id)
      );

      return availableExams.map((exam: any) => ({
        ...exam,
        wines_count: exam.tasting_exam_wines?.length || 0,
      }));
    } catch (error) {
      console.error('Error fetching enabled exams:', error);
      throw error;
    }
  }

  /**
   * Verificar si un examen está disponible para un usuario
   */
  static async isExamAvailable(
    examId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      // Verificar si el examen está habilitado
      const { data: exam, error: examError } = await supabase
        .from('tasting_exams')
        .select('id, enabled, enabled_until, permanently_disabled')
        .eq('id', examId)
        .single();

      if (examError || !exam) return false;
      if (!exam.enabled || exam.permanently_disabled) return false;
      if (exam.enabled_until && exam.enabled_until < now) return false;

      // Verificar si el usuario ya completó el examen
      const { data: response, error: responseError } = await supabase
        .from('tasting_responses')
        .select('id')
        .eq('exam_id', examId)
        .eq('user_id', userId)
        .single();

      if (responseError && responseError.code !== 'PGRST116') {
        // PGRST116 = no rows returned (esperado si no ha completado)
        throw responseError;
      }

      return !response; // Disponible si no hay respuesta
    } catch (error) {
      console.error('Error checking exam availability:', error);
      return false;
    }
  }

  /**
   * Crear una respuesta completa a un examen
   */
  static async createResponse({
    examId,
    userId,
    userName,
    wineResponses,
  }: {
    examId: string;
    userId: string;
    userName: string;
    wineResponses: Omit<TastingWineResponse, 'id' | 'response_id' | 'created_at' | 'updated_at'>[];
  }): Promise<TastingResponse> {
    try {
      // Verificar que el examen esté disponible
      const isAvailable = await this.isExamAvailable(examId, userId);
      if (!isAvailable) {
        throw new Error('El examen no está disponible o ya fue completado');
      }

      // Crear la respuesta principal
      const { data: response, error: responseError } = await supabase
        .from('tasting_responses')
        .insert({
          exam_id: examId,
          user_id: userId,
          user_name: userName,
        })
        .select()
        .single();

      if (responseError) throw responseError;
      if (!response) throw new Error('No se pudo crear la respuesta');

      // Crear respuestas por vino
      if (wineResponses.length > 0) {
        const wineResponsesData = wineResponses.map((wr) => ({
          response_id: response.id,
          wine_id: wr.wine_id,
          body_intensity: wr.body_intensity,
          clarity: wr.clarity,
          effervescence: wr.effervescence,
          alcohol_level: wr.alcohol_level,
          detected_aromas: wr.detected_aromas,
          other_aromas: wr.other_aromas,
          aroma_intensity: wr.aroma_intensity,
          aroma_quality: wr.aroma_quality,
          aroma_complexity: wr.aroma_complexity,
          first_impact: wr.first_impact,
          other_first_impact: wr.other_first_impact,
          recognized_flavors: wr.recognized_flavors,
          other_flavors: wr.other_flavors,
          acidity_level: wr.acidity_level,
          tannin_level: wr.tannin_level,
          alcohol_sensation: wr.alcohol_sensation,
          body: wr.body,
          persistence: wr.persistence,
          detected_tastes: wr.detected_tastes,
        }));

        const { error: winesError } = await supabase
          .from('tasting_wine_responses')
          .insert(wineResponsesData);

        if (winesError) {
          // Si falla, eliminar la respuesta principal
          await supabase.from('tasting_responses').delete().eq('id', response.id);
          throw winesError;
        }
      }

      // Obtener la respuesta completa
      const fullResponse = await this.getResponseById(response.id);
      if (!fullResponse) throw new Error('No se pudo obtener la respuesta creada');

      return fullResponse;
    } catch (error) {
      console.error('Error creating tasting response:', error);
      throw error;
    }
  }

  /**
   * Obtener una respuesta específica con sus respuestas por vino
   */
  static async getResponseById(responseId: string): Promise<TastingResponse | null> {
    try {
      const { data, error } = await supabase
        .from('tasting_responses')
        .select(`
          *,
          tasting_wine_responses (
            *,
            wines (
              id,
              name,
              winery,
              type,
              image_url
            )
          )
        `)
        .eq('id', responseId)
        .single();

      if (error) throw error;
      return data || null;
    } catch (error) {
      console.error('Error fetching tasting response:', error);
      throw error;
    }
  }

  /**
   * Obtener todas las respuestas de un examen
   */
  static async getResponsesByExam(
    examId: string,
    ownerId: string
  ): Promise<TastingResponse[]> {
    try {
      // Verificar que el examen pertenezca al owner
      const exam = await supabase
        .from('tasting_exams')
        .select('id, owner_id')
        .eq('id', examId)
        .eq('owner_id', ownerId)
        .single();

      if (exam.error || !exam.data) {
        throw new Error('Examen no encontrado o sin permisos');
      }

      const { data, error } = await supabase
        .from('tasting_responses')
        .select(`
          *,
          tasting_wine_responses (
            *,
            wines (
              id,
              name,
              winery,
              type,
              image_url
            )
          )
        `)
        .eq('exam_id', examId)
        .order('completed_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching exam responses:', error);
      throw error;
    }
  }

  /**
   * Obtener vinos disponibles para seleccionar en un examen
   */
  static async getAvailableWines(
    branchId: string,
    ownerId: string
  ): Promise<Wine[]> {
    try {
      // Obtener vinos del catálogo de la sucursal
      const { data: stock, error } = await supabase
        .from('wine_branch_stock')
        .select(`
          wines (
            id,
            name,
            winery,
            grape_variety,
            region,
            country,
            vintage,
            alcohol_content,
            description,
            image_url,
            type,
            body_level,
            sweetness_level,
            acidity_level,
            intensity_level,
            fizziness_level,
            food_pairings,
            serving_temperature,
            owner_id
          )
        `)
        .eq('branch_id', branchId)
        .eq('wines.owner_id', ownerId)
        .gte('stock_quantity', 0);

      if (error) throw error;

      // Extraer y formatear vinos
      const wines = (stock || [])
        .map((item: any) => item.wines)
        .filter((wine: any) => wine && wine.id)
        .map((wine: any) => ({
          ...wine,
          price: 0, // No necesario para selección
          price_per_glass: 0,
        }));

      return wines;
    } catch (error) {
      console.error('Error fetching available wines:', error);
      throw error;
    }
  }
}

