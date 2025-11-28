import { User } from 'firebase/auth';

// URL del servicio WebSocket (Cloud Run)
const WEBSOCKET_URL = 'wss://alertas-websocket-687053793381.southamerica-west1.run.app/ws/alertas';

// Para desarrollo local, usar:
// const WEBSOCKET_URL = 'ws://localhost:8080/ws/alertas';

export interface WebSocketMessage {
  tipo: 'conexion_exitosa' | 'nueva_alerta' | 'pong' | 'error';
  mensaje?: string;
  timestamp: string;
  usuario?: string;
  alerta?: any;
}

export type MessageHandler = (message: WebSocketMessage) => void;
export type ErrorHandler = (error: Event) => void;
export type CloseHandler = () => void;

export class AlertasWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private user: User | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private closeHandlers: Set<CloseHandler> = new Set();
  private isManualClose: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 3000; // 3 segundos

  /**
   * Conecta al servicio WebSocket
   * @param user - Usuario autenticado de Firebase
   */
  async connect(user: User): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('🔌 WebSocket ya está conectado');
      return;
    }

    this.user = user;
    this.isManualClose = false;

    try {
      // Obtener token de Firebase
      const token = await user.getIdToken();

      // Construir URL con token
      const wsUrl = `${WEBSOCKET_URL}?token=${token}`;

      console.log('🔌 Conectando a WebSocket...');
      this.ws = new WebSocket(wsUrl);

      // Configurar event handlers
      this.ws.onopen = () => {
        console.log('✅ WebSocket conectado exitosamente');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('📨 Mensaje WebSocket recibido:', message.tipo);

          // Notificar a todos los handlers
          this.messageHandlers.forEach(handler => {
            try {
              handler(message);
            } catch (error) {
              console.error('Error en message handler:', error);
            }
          });
        } catch (error) {
          console.error('Error al parsear mensaje WebSocket:', error);
        }
      };

      this.ws.onerror = (event) => {
        console.error('❌ Error en WebSocket:', event);
        this.errorHandlers.forEach(handler => {
          try {
            handler(event);
          } catch (error) {
            console.error('Error en error handler:', error);
          }
        });
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket desconectado');
        this.stopHeartbeat();

        this.closeHandlers.forEach(handler => {
          try {
            handler();
          } catch (error) {
            console.error('Error en close handler:', error);
          }
        });

        // Intentar reconectar si no fue un cierre manual
        if (!this.isManualClose && this.user) {
          this.scheduleReconnect();
        }
      };

    } catch (error) {
      console.error('Error al conectar WebSocket:', error);
      throw error;
    }
  }

  /**
   * Desconecta del servicio WebSocket
   */
  disconnect(): void {
    this.isManualClose = true;
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.user = null;
    this.reconnectAttempts = 0;
    console.log('🔌 WebSocket desconectado manualmente');
  }

  /**
   * Programa un intento de reconexión
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`⚠️  Máximo de intentos de reconexión alcanzado (${this.maxReconnectAttempts})`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts; // Backoff exponencial

    console.log(`🔄 Reintentando conexión en ${delay / 1000} segundos (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.user && !this.isManualClose) {
        console.log('🔄 Reconectando...');
        this.connect(this.user);
      }
    }, delay);
  }

  /**
   * Inicia el heartbeat para mantener la conexión viva
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    // Enviar ping cada 30 segundos
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 30000);
  }

  /**
   * Detiene el heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Registra un handler para mensajes recibidos
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);

    // Retornar función para remover el handler
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Registra un handler para errores
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);

    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  /**
   * Registra un handler para cierre de conexión
   */
  onClose(handler: CloseHandler): () => void {
    this.closeHandlers.add(handler);

    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  /**
   * Retorna el estado de la conexión
   */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Verifica si está conectado
   */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton para el servicio
let wsServiceInstance: AlertasWebSocketService | null = null;

/**
 * Obtiene la instancia del servicio WebSocket (singleton)
 */
export function getWebSocketService(): AlertasWebSocketService {
  if (!wsServiceInstance) {
    wsServiceInstance = new AlertasWebSocketService();
  }
  return wsServiceInstance;
}

/**
 * Resetea la instancia del servicio (útil para testing o logout)
 */
export function resetWebSocketService(): void {
  if (wsServiceInstance) {
    wsServiceInstance.disconnect();
    wsServiceInstance = null;
  }
}
