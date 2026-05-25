#!/usr/bin/env node
/**
 * Genera src/i18n/ptBRP1Screens.ts desde bloques es en LanguageContext.
 * Uso: node scripts/generate-pt-p1-screens.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LC = path.join(__dirname, '../src/contexts/LanguageContext.tsx');
const OUT = path.join(__dirname, '../src/i18n/ptBRP1Screens.ts');

const PREFIXES = [
  'subscription.',
  'users.',
  'cocktail.',
  'wine_mgmt.',
  'add_wine.',
  'qr_gen.',
  'roles.',
];

function extractEsBlock(raw) {
  const m = raw.match(/^\s*es:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*en:/m);
  return m?.[1] ?? '';
}

function extractEntries(block) {
  const entries = new Map();
  const re = /'([^']+)':\s*(?:'((?:\\'|[^'])*)'|"([^"]*)")/g;
  let m;
  while ((m = re.exec(block))) {
    const key = m[1];
    const val = (m[2] ?? m[3] ?? '').replace(/\\n/g, '\n').replace(/\\'/g, "'");
    if (PREFIXES.some((p) => key.startsWith(p))) entries.set(key, val);
  }
  return entries;
}

function esToPt(text) {
  return text
    .replace(/Suscripciones/g, 'Assinaturas')
    .replace(/suscripción/gi, 'assinatura')
    .replace(/suscripciones/gi, 'assinaturas')
    .replace(/Sucursales/g, 'Unidades')
    .replace(/sucursales/g, 'unidades')
    .replace(/Sucursal/g, 'Unidade')
    .replace(/sucursal/g, 'unidade')
    .replace(/vinos/gi, 'vinhos')
    .replace(/Vinos/g, 'Vinhos')
    .replace(/cócteles/gi, 'coquetéis')
    .replace(/Coctelería/g, 'Coquetéis')
    .replace(/cocteles/gi, 'coquetéis')
    .replace(/Plan actual/g, 'Plano atual')
    .replace(/Estado actual/g, 'Estado atual')
    .replace(/Incluye:/g, 'Inclui:')
    .replace(/No incluye:/g, 'Não inclui:')
    .replace(/Gratis/g, 'Grátis')
    .replace(/mes\b/g, 'mês')
    .replace(/MXN\/mes/g, 'MXN/mês')
    .replace(/al mes/g, 'por mês')
    .replace(/Gerente/g, 'Gerente')
    .replace(/Dueño/g, 'Titular')
    .replace(/owner/gi, 'titular')
    .replace(/Mejorar/g, 'Melhorar')
    .replace(/Actualizar/g, 'Atualizar')
    .replace(/Cancelar/g, 'Cancelar')
    .replace(/Confirmar/g, 'Confirmar')
    .replace(/Ver Planes/g, 'Ver Planos')
    .replace(/Gestión de Usuarios/g, 'Gestão de Usuários')
    .replace(/Pendientes de Aprobación/g, 'Pendentes de Aprovação')
    .replace(/Activos/g, 'Ativos')
    .replace(/Cambiar Rol/g, 'Alterar Papel')
    .replace(/Menú de Coctelería/g, 'Menu de Coquetéis')
    .replace(/bebidas disponibles/g, 'bebidas disponíveis')
    .replace(/Ingreso manual de botella/g, 'Entrada manual de garrafa')
    .replace(/Anverso de la etiqueta/g, 'Frente do rótulo')
    .replace(/obligatorio/g, 'obrigatório')
    .replace(/Galería/g, 'Galeria')
    .replace(/Bien enfocada y sin reflejos/g, 'Nítida e sem reflexos')
    .replace(/Espumoso/g, 'Espumante')
    .replace(/ilimitado/g, 'ilimitado')
    .replace(/Ilimitado/g, 'Ilimitado')
    .replace(/desbloqueadas/g, 'desbloqueadas')
    .replace(/miembros de staff/g, 'membros da equipe')
    .replace(/Funciones premium/g, 'Recursos premium')
    .replace(/Recomendado/g, 'Recomendado')
    .replace(/Sí/g, 'Sim')
    .replace(/No se puede/g, 'Não é possível')
    .replace(/No tienes/g, 'Você não tem')
    .replace(/Por favor/g, 'Por favor')
    .replace(/Intenta de nuevo/g, 'Tente novamente')
    .replace(/correo/g, 'e-mail')
    .replace(/Cargando/g, 'Carregando');
}

const QR_EXTRA = {
  'qr_gen.title': 'Geração de QR',
  'qr_gen.tab_guest': 'Clientes',
  'qr_gen.tab_admin': 'Convite Admin',
  'qr_gen.guest_info': 'Acesso temporário ao catálogo de vinhos da unidade',
  'qr_gen.duration_1w': '1 semana',
  'qr_gen.duration_2w': '2 semanas',
  'qr_gen.duration_1m': '1 mês',
  'qr_gen.branch_not_assigned_title': 'Unidade não atribuída',
  'qr_gen.branch_not_assigned_body': 'Você só pode gerar QR para sua unidade atribuída.',
  'qr_gen.no_permission_title': 'Sem permissão',
  'qr_gen.no_permission_guest_body':
    'Seu plano ou papel não permite gerar QR para clientes nesta unidade.',
  'qr_gen.generate_guest': 'Gerar QR para Clientes',
  'qr_gen.admin_info': 'Convite para nova equipe\nUso único\nRequer aprovação do titular/gerente',
  'qr_gen.generate_admin': 'Gerar QR de Convite',
  'qr_gen.restricted_title': 'Acesso restrito',
  'qr_gen.restricted_admin_body':
    'Você não tem permissão para gerar códigos QR de convite de administradores.',
  'qr_gen.restricted_admin_body2': 'Apenas titulares e gerentes podem criar este tipo de código.',
  'qr_gen.share_title_guest': 'Cellarium – Menu de vinhos',
  'qr_gen.share_title_admin': 'Cellarium – Convite da equipe',
  'qr_gen.branch_fallback': 'Unidade',
  'qr_gen.valid_until': 'Válido até',
  'qr_gen.valid_temporarily': 'Válido temporariamente',
  'qr_gen.display_guest': 'QR para Clientes',
  'qr_gen.display_admin': 'QR Convite Admin',
  'qr_gen.label_branch': 'Unidade:',
  'qr_gen.label_expires': 'Expira:',
  'qr_gen.not_specified': 'Não especificada',
  'qr_gen.existing_title': 'QRs gerados',
  'qr_gen.type_guest': 'Cliente',
  'qr_gen.type_admin': 'Admin',
  'qr_gen.type_owner': 'Titular',
  'qr_gen.copy_link': 'Copiar link',
  'qr_gen.copy_message': 'Copiar mensagem',
  'qr_gen.share_image': 'Compartilhar imagem',
  'qr_gen.error_load': 'Não foi possível carregar os códigos QR existentes',
  'qr_gen.error_no_branch': 'Nenhuma unidade selecionada ou usuário não autenticado',
  'qr_gen.verify_required_title': 'Verificação necessária',
  'qr_gen.verify_required_body':
    'Para gerar QR você deve verificar seu e-mail em Assinaturas.',
  'qr_gen.go_subscriptions': 'Ir para Assinaturas',
  'qr_gen.error_no_permission_branch': 'Você não tem permissão para gerar QR nesta unidade.',
  'qr_gen.generated_title': 'QR gerado',
  'qr_gen.error_guest': 'Não foi possível gerar o código QR para clientes',
  'qr_gen.error_admin': 'Não foi possível gerar o código QR de convite',
  'qr_gen.insufficient_title': 'Permissões insuficientes',
  'qr_gen.share_dialog_title': 'Compartilhar QR Cellarium',
  'qr_gen.share_fallback_title': 'Compartilhar como link',
  'qr_gen.share_fallback_body':
    'Não foi possível compartilhar a imagem. A opção de copiar o link foi aberta.',
  'qr_gen.link_copied_title': 'Link copiado',
  'qr_gen.link_copied_body': 'O link do QR foi copiado para a área de transferência.',
  'qr_gen.message_copied_title': 'Mensagem copiada',
  'qr_gen.message_copied_body': 'O texto foi copiado para a área de transferência.',
};

const ADD_WINE_EXTRA = {
  'add_wine.title': 'Adicionar ao Catálogo',
  'add_wine.price_bottle': 'Preço por garrafa',
  'add_wine.price_bottle_ph': 'Ex.: 450',
  'add_wine.price_glass': 'Preço por taça (opcional)',
  'add_wine.price_glass_ph': 'Ex.: 120',
  'add_wine.stock': 'Estoque inicial (opcional)',
  'add_wine.stock_ph': 'Ex.: 6',
  'add_wine.saving': 'Salvando…',
  'add_wine.error_title': 'Erro',
  'add_wine.error_no_user': 'Usuário ou unidade não identificados',
  'add_wine.branch_name_required_title': 'Nome do restaurante obrigatório',
  'add_wine.branch_name_required_owner':
    'Antes de adicionar vinhos, defina o nome do seu restaurante ou centro de consumo. Você pode editá-lo em Gestão de Unidades.',
  'add_wine.branch_name_required_staff':
    'O titular deve definir o nome do restaurante ou centro de consumo antes de adicionar vinhos. Entre em contato com o responsável.',
  'add_wine.configure_now': 'Configurar agora',
  'add_wine.go_branch_mgmt': 'Ir para Gestão',
  'add_wine.understood': 'Entendido',
  'add_wine.invalid_title': 'Dado inválido',
  'add_wine.invalid_bottle': 'Preço por garrafa não é um número',
  'add_wine.invalid_glass': 'Preço por taça não é um número',
  'add_wine.invalid_stock': 'Estoque deve ser um número',
  'add_wine.success_title': 'Vinho adicionado',
  'add_wine.success_body': 'Foi adicionado corretamente ao catálogo.',
  'add_wine.branch_short_owner': 'Defina o nome do restaurante antes de adicionar vinhos.',
  'add_wine.branch_short_staff': 'Peça ao titular para definir o nome do restaurante.',
};

const ROLES_EXTRA = {
  'roles.owner': 'Titular',
  'roles.gerente': 'Gerente',
  'roles.sommelier': 'Sommelier',
  'roles.supervisor': 'Supervisor',
  'roles.personal': 'Operacional',
};

const SUB_VERIFY_EXTRA = {
  'subscription.owner_only': 'Apenas o titular pode gerenciar assinaturas.',
  'subscription.verify_block_title': 'Verificar e-mail',
  'subscription.verify_block_subtitle':
    'Para ativar assinaturas e geração de QR, verifique seu e-mail com o código que enviamos.',
  'subscription.verify_send_code': 'Enviar código',
  'subscription.verify_code_label': 'Código de 6 dígitos',
  'subscription.verify_submit': 'Verificar',
  'subscription.verify_notice_title': 'Aviso',
  'subscription.verify_send_fail': 'Não foi possível enviar o código',
  'subscription.verify_code_sent_title': 'Código enviado',
  'subscription.verify_code_sent_body': 'Verifique seu e-mail. O código é válido por 15 minutos.',
  'subscription.verify_send_error': 'Não foi possível enviar o código. Tente novamente.',
  'subscription.verify_invalid_title': 'Código inválido',
  'subscription.verify_invalid_body': 'Digite os 6 dígitos que recebeu por e-mail.',
  'subscription.verify_fail': 'Código inválido ou expirado',
  'subscription.verify_success_title': 'E-mail verificado',
  'subscription.verify_success_body': 'Agora você pode usar assinaturas e gerar QR.',
  'subscription.verify_error': 'Não foi possível verificar. Tente novamente.',
};

const USERS_EXTRA = {
  'users.empty_pending_hint': 'As solicitações de acesso aparecerão aqui.',
  'users.not_allowed_title': 'Não permitido',
  'users.cannot_change_owner_alert': 'Não é possível alterar o papel de um titular',
  'users.permission_denied_title': 'Permissão negada',
  'users.permission_denied_modify': 'Você não tem permissão para modificar o papel de',
};

function escapeTs(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function main() {
  const raw = fs.readFileSync(LC, 'utf8');
  const esBlock = extractEsBlock(raw);
  const entries = extractEntries(esBlock);
  for (const [k, v] of Object.entries(QR_EXTRA)) entries.set(k, v);
  for (const [k, v] of Object.entries(ADD_WINE_EXTRA)) entries.set(k, v);
  for (const [k, v] of Object.entries(ROLES_EXTRA)) entries.set(k, v);
  for (const [k, v] of Object.entries(SUB_VERIFY_EXTRA)) entries.set(k, v);
  for (const [k, v] of Object.entries(USERS_EXTRA)) entries.set(k, v);

  const lines = [
    "/**",
    " * Traduções pt-BR P1/P2 (pantallas visibles). Generado/curado — no editar a mano el bloque es.",
    " * Regenerar base: node scripts/generate-pt-p1-screens.mjs",
    " */",
    "export const ptBRP1Screens: Record<string, string> = {",
  ];

  const sorted = [...entries.keys()].sort();
  for (const key of sorted) {
    const esVal = entries.get(key);
    const ptVal = PREFIXES.some((p) => key.startsWith(p) && !key.startsWith('qr_gen') && !key.startsWith('add_wine') && !key.startsWith('roles') && !USERS_EXTRA[key] && !SUB_VERIFY_EXTRA[key])
      ? esToPt(esVal)
      : esVal;
    lines.push(`  '${key}': '${escapeTs(ptVal)}',`);
  }
  lines.push('};', '');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${sorted.length} keys → ${OUT}`);
}

main();
