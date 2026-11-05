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
}

export interface Vehiculo {
  marca: string; modelo: string; anio: number; patente: string;
  color: string; colorHex: string; carroceria: Carroceria;
  motor?: string; chasis?: string;
}

export interface Usuario { id: string; nombre: string; rol: 'maestro' | 'admin'; cargo: string; pin: string; }

export interface Pagador {
  tipo: 'aseguradora' | 'particular';
  aseguradora?: string; siniestro?: string; liquidador?: string; deducible?: number;
}

export interface Orden {
  id: string; numero: number; codigo: string; creada: string; entrega: string;
  maestroId: string; vehiculo: Vehiculo;
  cliente: { nombre: string; rut: string; telefono: string };
  pagador: Pagador; items: Item[]; notas: string;
  cobrada: boolean; imagenIA?: string;
}
