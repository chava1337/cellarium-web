-- =====================================================
-- CELLARIUM - Script de Base de Datos
-- Sistema de Catálogo de Vinos para Restaurantes
-- =====================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLAS PRINCIPALES
-- =====================================================

-- Tabla de sucursales
CREATE TABLE branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de vinos
CREATE TABLE wines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  grape_variety VARCHAR(100) NOT NULL,
  region VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  vintage INTEGER NOT NULL,
  alcohol_content DECIMAL(4,2) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de stock por sucursal
CREATE TABLE wine_branch_stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wine_id UUID REFERENCES wines(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(wine_id, branch_id)
);

-- Tabla de movimientos de inventario
CREATE TABLE inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wine_id UUID REFERENCES wines(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment')),
  quantity INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de tokens QR
CREATE TABLE qr_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de sesiones de invitados
CREATE TABLE guest_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  qr_token_id UUID REFERENCES qr_tokens(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  session_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  session_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de usuarios (extiende auth.users de Supabase)
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'gerente', 'sommelier', 'supervisor')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  branch_id UUID REFERENCES branches(id),
  invited_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- =====================================================

-- Índices para búsquedas frecuentes
CREATE INDEX idx_wines_grape_variety ON wines(grape_variety);
CREATE INDEX idx_wines_region ON wines(region);
CREATE INDEX idx_wines_country ON wines(country);
CREATE INDEX idx_wines_vintage ON wines(vintage);
CREATE INDEX idx_wines_price ON wines(price);

-- Índices para stock
CREATE INDEX idx_stock_branch ON wine_branch_stock(branch_id);
CREATE INDEX idx_stock_wine ON wine_branch_stock(wine_id);
CREATE INDEX idx_stock_quantity ON wine_branch_stock(quantity);

-- Índices para movimientos
CREATE INDEX idx_movements_branch ON inventory_movements(branch_id);
CREATE INDEX idx_movements_wine ON inventory_movements(wine_id);
CREATE INDEX idx_movements_date ON inventory_movements(created_at);

-- Índices para tokens QR
CREATE INDEX idx_qr_tokens_branch ON qr_tokens(branch_id);
CREATE INDEX idx_qr_tokens_active ON qr_tokens(is_active);
CREATE INDEX idx_qr_tokens_expires ON qr_tokens(expires_at);

-- Índices para sesiones
CREATE INDEX idx_sessions_branch ON guest_sessions(branch_id);
CREATE INDEX idx_sessions_token ON guest_sessions(qr_token_id);
CREATE INDEX idx_sessions_start ON guest_sessions(session_start);

-- =====================================================
-- FUNCIONES Y TRIGGERS
-- =====================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wines_updated_at BEFORE UPDATE ON wines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON wine_branch_stock
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para limpiar tokens QR expirados
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    UPDATE qr_tokens 
    SET is_active = false 
    WHERE expires_at < NOW() AND is_active = true;
END;
$$ language 'plpgsql';

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE wines ENABLE ROW LEVEL SECURITY;
ALTER TABLE wine_branch_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Políticas para branches
CREATE POLICY "Owner and Gerente can view all branches" ON branches
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.status = 'active'
            AND users.role IN ('owner', 'gerente')
        )
    );

CREATE POLICY "Managers can view their branch" ON branches
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'manager'
            AND users.branch_id = branches.id
        )
    );

CREATE POLICY "Staff can view their branch" ON branches
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'staff'
            AND users.branch_id = branches.id
        )
    );

-- Políticas para wines
CREATE POLICY "Everyone can view wines" ON wines
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage wines" ON wines
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Políticas para wine_branch_stock
CREATE POLICY "Admins can view all stock" ON wine_branch_stock
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Managers can view their branch stock" ON wine_branch_stock
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'manager'
            AND users.branch_id = wine_branch_stock.branch_id
        )
    );

CREATE POLICY "Staff can view their branch stock" ON wine_branch_stock
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'staff'
            AND users.branch_id = wine_branch_stock.branch_id
        )
    );

-- Políticas para inventory_movements
CREATE POLICY "Admins can view all movements" ON inventory_movements
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Managers can view their branch movements" ON inventory_movements
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'manager'
            AND users.branch_id = inventory_movements.branch_id
        )
    );

CREATE POLICY "Staff can view their branch movements" ON inventory_movements
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'staff'
            AND users.branch_id = inventory_movements.branch_id
        )
    );

CREATE POLICY "Staff can insert movements" ON inventory_movements
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('staff', 'manager')
            AND users.branch_id = inventory_movements.branch_id
        )
    );

-- Políticas para qr_tokens
CREATE POLICY "Admins can manage all tokens" ON qr_tokens
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Managers can manage their branch tokens" ON qr_tokens
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'manager'
            AND users.branch_id = qr_tokens.branch_id
        )
    );

-- Políticas para guest_sessions
CREATE POLICY "Admins can view all sessions" ON guest_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Managers can view their branch sessions" ON guest_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'manager'
            AND users.branch_id = guest_sessions.branch_id
        )
    );

CREATE POLICY "Anyone can insert sessions" ON guest_sessions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update sessions" ON guest_sessions
    FOR UPDATE USING (true);

-- Políticas para users
CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND u.role = 'admin'
        )
    );

CREATE POLICY "Managers can view their branch users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND u.role = 'manager'
            AND u.branch_id = users.branch_id
        )
    );

CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can manage users" ON users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND u.role = 'admin'
        )
    );

-- =====================================================
-- DATOS DE PRUEBA
-- =====================================================

-- Insertar sucursal de prueba
INSERT INTO branches (name, address, phone, email) VALUES
('Restaurante Principal', 'Av. Principal 123, Ciudad', '+1-555-0123', 'info@restaurante.com');

-- Insertar vinos de prueba
INSERT INTO wines (name, grape_variety, region, country, vintage, alcohol_content, description, price) VALUES
('Château Margaux', 'Cabernet Sauvignon', 'Bordeaux', 'Francia', 2018, 13.5, 'Un vino elegante y complejo con aromas de frutas negras y especias.', 450.00),
('Dom Pérignon', 'Chardonnay', 'Champagne', 'Francia', 2015, 12.5, 'Champagne premium con burbujas finas y sabor equilibrado.', 280.00),
('Opus One', 'Cabernet Sauvignon', 'Napa Valley', 'Estados Unidos', 2019, 14.2, 'Vino tinto robusto con taninos suaves y final largo.', 320.00),
('Barolo Brunate', 'Nebbiolo', 'Piemonte', 'Italia', 2017, 14.0, 'Vino italiano clásico con aromas de rosas y trufas.', 180.00),
('Riesling Spätlese', 'Riesling', 'Mosel', 'Alemania', 2020, 8.5, 'Vino blanco dulce con notas de frutas tropicales.', 65.00);

-- Crear stock inicial para la sucursal
INSERT INTO wine_branch_stock (wine_id, branch_id, quantity, min_stock)
SELECT w.id, b.id, 
  CASE 
    WHEN w.name = 'Château Margaux' THEN 12
    WHEN w.name = 'Dom Pérignon' THEN 8
    WHEN w.name = 'Opus One' THEN 15
    WHEN w.name = 'Barolo Brunate' THEN 20
    WHEN w.name = 'Riesling Spätlese' THEN 25
  END,
  5
FROM wines w, branches b
WHERE b.name = 'Restaurante Principal';

-- =====================================================
-- VISTAS ÚTILES
-- =====================================================

-- Vista para vinos con stock bajo
CREATE VIEW low_stock_wines AS
SELECT 
    wbs.id,
    w.name as wine_name,
    w.grape_variety,
    w.region,
    w.country,
    w.vintage,
    w.price,
    b.name as branch_name,
    wbs.quantity,
    wbs.min_stock,
    (wbs.quantity - wbs.min_stock) as stock_difference
FROM wine_branch_stock wbs
JOIN wines w ON wbs.wine_id = w.id
JOIN branches b ON wbs.branch_id = b.id
WHERE wbs.quantity <= wbs.min_stock;

-- Vista para estadísticas de sucursal
CREATE VIEW branch_stats AS
SELECT 
    b.id as branch_id,
    b.name as branch_name,
    COUNT(DISTINCT wbs.wine_id) as total_wines,
    SUM(wbs.quantity) as total_stock,
    SUM(wbs.quantity * w.price) as total_value,
    COUNT(CASE WHEN wbs.quantity <= wbs.min_stock THEN 1 END) as low_stock_count
FROM branches b
LEFT JOIN wine_branch_stock wbs ON b.id = wbs.branch_id
LEFT JOIN wines w ON wbs.wine_id = w.id
GROUP BY b.id, b.name;

-- Vista para movimientos recientes
CREATE VIEW recent_movements AS
SELECT 
    im.id,
    w.name as wine_name,
    b.name as branch_name,
    im.movement_type,
    im.quantity,
    im.reason,
    im.created_at
FROM inventory_movements im
JOIN wines w ON im.wine_id = w.id
JOIN branches b ON im.branch_id = b.id
ORDER BY im.created_at DESC;

-- =====================================================
-- COMENTARIOS FINALES
-- =====================================================

-- Este script crea la estructura completa de la base de datos para Cellarium
-- Incluye todas las tablas, índices, políticas de seguridad y datos de prueba
-- Ejecutar este script en el SQL Editor de Supabase para configurar la base de datos

COMMENT ON TABLE branches IS 'Sucursales del restaurante';
COMMENT ON TABLE wines IS 'Catálogo de vinos disponibles';
COMMENT ON TABLE wine_branch_stock IS 'Stock de vinos por sucursal';
COMMENT ON TABLE inventory_movements IS 'Movimientos de inventario';
COMMENT ON TABLE qr_tokens IS 'Tokens QR para acceso de comensales';
COMMENT ON TABLE guest_sessions IS 'Sesiones de invitados';
COMMENT ON TABLE users IS 'Usuarios del sistema con roles';



