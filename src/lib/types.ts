export type Carroceria = 'sedan' | 'hatchback' | 'suv' | 'pickup';

export type PiezaId =
  | 'capot' | 'techo' | 'maletera' | 'parachoque_del' | 'parachoque_tras'
  | 'tapabarro_del_izq' | 'tapabarro_del_der'
  | 'puerta_del_izq' | 'puerta_del_der' | 'puerta_tras_izq' | 'puerta_tras_der'
  | 'costado_tras_izq' | 'costado_tras_der'
  | 'espejo_izq' | 'espejo_der';

export type EstadoPieza = 'pendiente' | 'proceso' | 'listo';

export type Trabajo = 'desabolladura' | 'pintura' | 'cambio' | 'plastico' | 'pulido';
export type Severidad = 'leve' | 'medio' | 'fuerte';
export type EstadoItem = 'pendiente' | 'proceso' | 'listo';

export type EtapaId = 'aprobar' | 'repuestos' | 'desabolladura' | 'pintura' | 'armado' | 'calidad' | 'entrega' | 'entregado';
export type Aprobacion = 'pendiente' | 'enviada' | 'aprobada' | 'rechazada';

export interface Sugerido { min: number; max: number; fuente: string; enlaces?: string[]; }

export interface Item {
  id: string;
  trabajo: Trabajo | 'general';
  pieza: PiezaId | null;
  titulo?: string;
  severidad?: Severidad;
  estado: EstadoItem;
  monto: number | null;
  sugerido?: Sugerido;
  /** Trabajo descubierto después de aprobar: vuelve a pedir autorización. */
  adicional?: boolean;
}

export interface Vehiculo {
  marca: string; modelo: string; anio: number; patente: string;
  color: string; colorHex: string; carroceria: Carroceria;
  motor?: string; chasis?: string;
}

export interface Usuario { id: string; nombre: string; rol: 'maestro' | 'admin'; cargo: string; }

export interface Pagador {
  tipo: 'aseguradora' | 'particular';
  aseguradora?: string; siniestro?: string; deducible?: number;
}

export interface Evento { fecha: string; texto: string; }
export interface Repuesto { id: string; itemId: string; nombre: string; estado: 'por_pedir' | 'pedido' | 'recibido'; }
export interface FotoRef { id: string; momento: 'antes' | 'despues'; }
export interface Recepcion { km: number | null; combustible: string; observaciones: string; }

export interface Orden {
  id: string; numero: number; codigo: string; creada: string; entrega: string;
  maestroId: string; vehiculo: Vehiculo;
  cliente: { nombre: string; rut: string; telefono: string };
  pagador: Pagador; items: Item[]; notas: string;
  aprobacion: Aprobacion; repuestos: Repuesto[]; fotos: FotoRef[]; historial: Evento[];
  recepcion: Recepcion; entregadaEl: string | null;
  cobrada: boolean; imagenIA?: string;
}

export interface Empresa { id: string; nombre: string; logo?: string; acento: string; whatsapp: string; }
