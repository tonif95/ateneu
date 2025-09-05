import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, AlertCircle, RotateCcw, User, XCircle, UserCheck, Calendar, Clock, Volume2, Heart } from 'lucide-react';

interface CaptureState {
  status: 'idle' | 'camera-active' | 'capturing' | 'sending' | 'success' | 'error' | 'user-found' | 'user-not-found' | 'no-face';
  message: string;
  recognitionData?: {
    personId?: string;
    similarity?: number;
    confidence?: number;
    scheduleData?: {
      PatientID: string;
      Nombre: string;
      Lunes?: string;
      Martes?: string;
      Miércoles?: string;
      Jueves?: string;
      Viernes?: string;
      Sábado?: string;
      Domingo?: string;
      [key: string]: any;
    };
    ui?: {
      title: string;
      subtitle: string;
      color: string;
      icon: string;
    };
    currentContext?: {
      day: string;
      time: string;
      currentActivity?: {
        time: string;
        activityName: string;
        description: string;
        room?: string;
        fullDescription: string;
      } | null;
      nextActivity?: {
        time: string;
        activityName: string;
        description: string;
        room?: string;
        fullDescription: string;
      } | null;
      statusInfo: string;
      completedToday: number;
      upcomingToday: number;
      totalActivitiesToday: number;
    };
  };
}

function App() {
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: 'idle',
    message: ''
  });
  const [isHelpActive, setIsHelpActive] = useState(false);
  const [speechSynthesis, setSpeechSynthesis] = useState<SpeechSynthesis | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setCaptureState({ status: 'camera-active', message: 'Activando cámara...' });
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await (videoRef.current as HTMLVideoElement).play();
      }
      
      setCaptureState({ status: 'camera-active', message: 'Cámara lista. Toque para tomar foto.' });
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCaptureState({ 
        status: 'error', 
        message: 'No se pudo acceder a la cámara. Verifique los permisos.' 
      });
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      setCaptureState({ status: 'capturing', message: 'Tomando foto...' });

      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');

      if (!context) throw new Error('No se pudo obtener el contexto del canvas');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.8);
      });

      await sendToWebhook(blob);

    } catch (error) {
      console.error('Error capturing photo:', error);
      setCaptureState({ 
        status: 'error', 
        message: 'Error al tomar la foto. Intente nuevamente.' 
      });
    }
  }, []);

  const sendToWebhook = async (imageBlob: Blob) => {
    try {
      setCaptureState({ status: 'sending', message: 'Procesando reconocimiento facial...' });

      const formData = new FormData();
      formData.append('image', imageBlob, 'patient-photo.jpg');
      formData.append('timestamp', new Date().toISOString());

      const response = await fetch('https://test.mamaencalma.com/webhook/facial-recognition', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        const resultData = Array.isArray(result) ? result[0] : result;
        handleRecognitionResult(resultData);
        stopCamera();
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error sending to webhook:', error);
      setCaptureState({ 
        status: 'error', 
        message: 'Error al procesar la imagen. Verifique la conexión.' 
      });
    }
  };

  const handleRecognitionResult = (result: any) => {
    console.log('Recognition result:', result);

    if (result.status === 'user_found') {
      setCaptureState({
        status: 'user-found',
        message: result.message,
        recognitionData: result
      });
    } else if (result.status === 'user_not_found') {
      setCaptureState({
        status: 'user-not-found',
        message: result.message,
        recognitionData: result
      });
    } else if (result.status === 'no_face_detected') {
      setCaptureState({
        status: 'no-face',
        message: result.message,
        recognitionData: result
      });
    } else {
      setCaptureState({
        status: 'error',
        message: result.message || 'Error desconocido en el reconocimiento'
      });
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      (videoRef.current as HTMLVideoElement).srcObject = null;
    }
  }, []);

  const resetCapture = useCallback(() => {
    stopCamera();
    setCaptureState({ status: 'idle', message: '' });
  }, [stopCamera]);

  const speak = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.8;
      utterance.volume = 0.9;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const toggleHelp = useCallback(() => {
    setIsHelpActive(!isHelpActive);
    
    if (isHelpActive) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isHelpActive]);

  const getHelpInstructions = useCallback(() => {
    switch (captureState.status) {
      case 'idle':
        return "Bienvenido al Asistente de Rehabilitación ATENEU Castelló. Para comenzar, busque y toque el botón azul que dice 'Activar Cámara' que está debajo. La aplicación necesita acceso a su cámara para reconocer su rostro y mostrarle sus horarios de actividades.";
      
      case 'camera-active':
        return "Perfecto, la cámara está funcionando. Colóquese frente a la cámara para que pueda ver claramente su rostro en la pantalla. Cuando esté bien posicionado y listo, toque el botón verde que dice 'Tomar Foto'. Si prefiere cancelar, puede tocar el botón gris 'Cancelar'.";
      
      case 'capturing':
        return "Tomando su fotografía ahora. Por favor, manténgase muy quieto durante unos segundos mientras capturamos y procesamos su imagen.";
      
      case 'sending':
        return "Ahora estamos procesando su imagen para el reconocimiento facial. Este proceso puede tomar entre 10 y 30 segundos. Por favor, tenga paciencia.";
      
      case 'user-found':
        return (() => {
          const scheduleData = captureState.recognitionData?.scheduleData;
          const currentContext = captureState.recognitionData?.currentContext;
          const name = scheduleData?.Nombre || 'Usuario';
          
          let message = `Excelente ${name}, le hemos reconocido correctamente. `;
          
          if (currentContext?.currentActivity) {
            const activity = currentContext.currentActivity;
            message += `Su actividad actual es: ${activity.description} a las ${activity.time}. `;
          } else if (currentContext?.nextActivity) {
            const activity = currentContext.nextActivity;
            message += `Su próxima actividad es: ${activity.description} a las ${activity.time}. `;
          }
          
          message += "En la pantalla puede ver toda su información del día, incluyendo horarios y salas asignadas. Para consultar otra vez o tomar una nueva foto, toque el botón 'Comenzar de Nuevo'.";
          
          return message;
        })();
      
      case 'user-not-found':
        return "No hemos podido encontrar su información en nuestro sistema de pacientes. Por favor, consulte con el personal del centro de rehabilitación para verificar su registro. Puede intentar tomar otra foto tocando el botón 'Comenzar de Nuevo'.";
      
      case 'no-face':
        return "No hemos podido detectar claramente un rostro en la imagen. Por favor, asegúrese de estar bien posicionado frente a la cámara, que haya suficiente luz en el ambiente, y que no haya obstáculos tapando su cara. Toque 'Comenzar de Nuevo' para intentar otra vez.";
      
      case 'error':
        return "Ha ocurrido un error técnico. Por favor, verifique que la cámara funcione correctamente, que tenga una buena conexión a internet, y que el navegador tenga permisos para usar la cámara. Toque 'Comenzar de Nuevo' para intentar otra vez.";
      
      default:
        return "Sistema de reconocimiento facial para pacientes del centro de rehabilitación ATENEU Castelló. Active la ayuda por voz tocando este botón cuando necesite instrucciones detalladas paso a paso.";
    }
  }, [captureState.status, captureState.recognitionData]);

  useEffect(() => {
    if (isHelpActive) {
      const helpText = getHelpInstructions();
      const timer = setTimeout(() => {
        speak(helpText);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [captureState.status, isHelpActive, getHelpInstructions, speak]);

  const getCurrentDay = () => {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const today = new Date();
    return days[today.getDay()];
  };

  const parseActivities = (activitiesString: string) => {
    if (!activitiesString || activitiesString.toLowerCase().includes('descanso')) {
      return [];
    }
    
    return activitiesString
      .split(',')
      .map((raw) => raw.trim())
      .map((entry) => {
        const [timePart, ...rest] = entry.split('-');
        const time = timePart?.trim();
        const desc = rest.join('-').trim();

        let activityName = desc;
        let room: string | undefined = undefined;

        const parts = desc.split('-').map((p) => p.trim());
        if (parts.length > 1) {
          const last = parts[parts.length - 1];
          if (/^sala\b/i.test(last)) {
            room = last;
            activityName = parts.slice(0, -1).join(' ').trim();
          }
        }

        const fullDescription = room ? `${activityName} • ${room}` : activityName;
        return { time, description: desc, activityName, room, fullDescription };
      })
      .filter((a) => a.time && a.activityName);
  };

  const activityImageMap: Record<string, string> = {
    'fisioterapia': 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop',
    'terapia ocupacional': 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=400&h=300&fit=crop',
    'ejercicios': 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
    'rehabilitación': 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&h=300&fit=crop',
    'hidroterapia': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=300&fit=crop',
    'evaluación': 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=400&h=300&fit=crop',
    'descanso': 'https://images.unsplash.com/photo-1540553016722-983e48a2cd10?w=400&h=300&fit=crop',
  };

  const roomImageMap: Record<string, string> = {
    'sala a': 'https://images.unsplash.com/photo-1571772996211-2f02c9727629?w=400&h=300&fit=crop',
    'sala b': 'https://images.unsplash.com/photo-1559757175-8a5a08d3b745?w=400&h=300&fit=crop',
    'sala c': 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=400&h=300&fit=crop',
    'gimnasio': 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
    'piscina': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=300&fit=crop',
  };

  function resolveImages(activity: any, room: string) {
    const actName = activity?.activityName || activity?.description || '';
    const actKey = actName.toLowerCase().trim();
    
    const activityImage = activityImageMap[actKey] || 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop';
    const roomImage = roomImageMap[room?.toLowerCase()?.trim()] || 'https://images.unsplash.com/photo-1571772996211-2f02c9727629?w=400&h=300&fit=crop';

    return { activityImage, roomImage };
  }

  function inferContextFromSchedule(
    scheduleData: any,
    dayName: string,
    now: Date = new Date()
  ) {
    if (!scheduleData || !dayName) return { currentActivity: null, nextActivity: null };

    const raw = scheduleData[dayName] || '';
    const activities = parseActivities(raw);

    if (activities.length === 0) return { currentActivity: null, nextActivity: null };

    const nowMin = now.getHours() * 60 + now.getMinutes();

    let current: any = null;
    let next: any = null;

    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      if (!a.time) continue;
      
      const [h, m] = a.time.split(':').map(Number);
      const t = h * 60 + m;

      const isCurrent = Math.abs(nowMin - t) <= 30 && nowMin >= t - 15;
      if (isCurrent && !current) {
        current = { ...a };
      }
      
      if (t > nowMin && !next) {
        next = { ...a };
      }
    }

    if (!current && activities.length > 0) {
      const sortedActivities = activities.sort((a, b) => {
        const [ah, am] = a.time.split(':').map(Number);
        const [bh, bm] = b.time.split(':').map(Number);
        const aMin = ah * 60 + am;
        const bMin = bh * 60 + bm;
        return Math.abs(nowMin - aMin) - Math.abs(nowMin - bMin);
      });
      
      const closest = sortedActivities[0];
      if (closest) {
        const [h, m] = closest.time.split(':').map(Number);
        const t = h * 60 + m;
        if (Math.abs(nowMin - t) <= 120) {
          current = { ...closest };
        }
      }
    }

    return { currentActivity: current, nextActivity: next };
  }

  const getStatusColor = () => {
    switch (captureState.status) {
      case 'user-found': return 'text-emerald-600';
      case 'user-not-found': return 'text-amber-600';
      case 'no-face': case 'error': return 'text-red-500';
      case 'sending': case 'capturing': return 'text-sky-600';
      default: return 'text-slate-600';
    }
  };

  const getStatusIcon = () => {
    switch (captureState.status) {
      case 'user-found': return <UserCheck className="w-10 h-10 sm:w-14 sm:h-14" />;
      case 'user-not-found': return <AlertCircle className="w-10 h-10 sm:w-14 sm:h-14" />;
      case 'no-face': return <XCircle className="w-10 h-10 sm:w-14 sm:h-14" />;
      case 'error': return <AlertCircle className="w-10 h-10 sm:w-14 sm:h-14" />;
      case 'camera-active': return <Camera className="w-10 h-10 sm:w-14 sm:h-14" />;
      default: return <User className="w-10 h-10 sm:w-14 sm:h-14" />;
    }
  };

  const getStatusBackground = () => {
    switch (captureState.status) {
      case 'user-found': return 'bg-emerald-50 border-emerald-200';
      case 'user-not-found': return 'bg-amber-50 border-amber-200';
      case 'no-face': case 'error': return 'bg-red-50 border-red-200';
      case 'sending': case 'capturing': return 'bg-sky-50 border-sky-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  const shouldShowCamera = ['idle', 'camera-active', 'capturing', 'sending'].includes(captureState.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50 to-blue-100 p-2 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Botón de Ayuda por Voz - Posición fija */}
        <div className="fixed top-3 right-3 sm:top-4 sm:right-4 md:top-6 md:right-6 z-50">
          <button
            onClick={toggleHelp}
            className={`
              ${isHelpActive 
                ? 'bg-red-500 hover:bg-red-600 ring-4 ring-red-200 shadow-2xl' 
                : 'bg-sky-600 hover:bg-sky-700 ring-3 ring-sky-200/50 shadow-xl'
              } 
              text-white p-5 rounded-full 
              transform transition-all duration-300 hover:scale-110 active:scale-95
              flex items-center justify-center
              focus:outline-none focus:ring-4 focus:ring-sky-300
              min-w-[56px] min-h-[56px] sm:min-w-[64px] sm:min-h-[64px] md:min-w-[80px] md:min-h-[80px]
            `}
            aria-label={isHelpActive ? "Detener ayuda por voz" : "Activar ayuda por voz"}
            title={isHelpActive ? "Detener ayuda por voz" : "Activar ayuda por voz"}
          >
            <Volume2 className={`w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 ${isHelpActive ? 'animate-pulse' : ''}`} />
            {isHelpActive && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-400 rounded-full animate-ping" />
            )}
          </button>
        </div>

        {/* Header con branding ATENEU */}
        <div className="text-center mb-4 sm:mb-6 md:mb-8 lg:mb-12">
          {/* Logo y branding */}
          <div className="flex items-center justify-center mb-3 sm:mb-4 md:mb-6">
            <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 shadow-lg border border-slate-200">
              <div className="flex items-center justify-center space-x-4">
                {/* Logo simulado de ATENEU */}
                <div className="relative">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-sky-600 rounded-full flex items-center justify-center">
                    <Heart className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
                  </div>
                  <div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                  </div>
                  <div className="absolute -bottom-0.5 -left-0.5 sm:-bottom-1 sm:-left-1 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 bg-amber-500 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                  </div>
                </div>
                
                <div className="text-left ml-2 sm:ml-3 md:ml-4">
                  <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-slate-800 leading-tight">
                    daño cerebral
                  </h1>
                  <p className="text-sky-600 font-semibold text-sm sm:text-base md:text-lg lg:text-xl">
                    ATENEU CASTELLÓ
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-slate-800 mb-2 sm:mb-3">
            Asistente Personal
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-slate-600 font-medium">
            Sistema de Reconocimiento y Horarios
          </p>
          <div className="mt-2 sm:mt-3 md:mt-4 w-16 sm:w-20 md:w-24 h-0.5 sm:h-1 bg-gradient-to-r from-sky-400 to-blue-500 mx-auto rounded-full"></div>
        </div>

        {/* Contenido Principal */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 p-3 sm:p-6 md:p-8 lg:p-10 mb-4 sm:mb-6 md:mb-8">
          {/* Sección de Cámara */}
          {shouldShowCamera && (
            <div className="relative mb-4 sm:mb-6 md:mb-8 lg:mb-10">
              <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl sm:rounded-2xl overflow-hidden border-2 sm:border-3 md:border-4 border-slate-300 relative shadow-inner">
                {(captureState.status === 'camera-active' || captureState.status === 'capturing') ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="bg-slate-300 rounded-full p-4 sm:p-6 md:p-8 lg:p-12 mx-auto mb-3 sm:mb-4 md:mb-6 shadow-lg">
                        <Camera className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 lg:w-24 lg:h-24 text-slate-500 mx-auto" />
                      </div>
                      <p className="text-base sm:text-lg md:text-xl lg:text-3xl text-slate-500 font-semibold">
                        Cámara desactivada
                      </p>
                    </div>
                  </div>
                )}
                
                {captureState.status === 'capturing' && (
                  <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center">
                    <div className="bg-sky-600 text-white px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-6 rounded-xl sm:rounded-2xl text-base sm:text-lg md:text-xl lg:text-2xl font-bold shadow-lg">
                      <div className="flex items-center space-x-2 sm:space-x-3">
                        <div className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 border-2 sm:border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Capturando...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mensaje de Estado */}
          <div className="text-center mb-4 sm:mb-6 md:mb-8 lg:mb-10">
            <div className={`inline-block p-4 sm:p-6 md:p-8 lg:p-10 rounded-2xl sm:rounded-3xl border-2 sm:border-3 ${getStatusBackground()} shadow-lg max-w-full`}>
              <div className={`flex items-center justify-center mb-3 sm:mb-4 md:mb-6 ${getStatusColor()}`}>
                {getStatusIcon()}
              </div>
              
              {captureState.status === 'user-found' && captureState.recognitionData?.scheduleData ? (
                <div className="space-y-4 sm:space-y-6 md:space-y-8">
                  <div>
                    <h2 className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 ${getStatusColor()}`}>
                      Bienvenido/a {captureState.recognitionData.scheduleData.Nombre}
                    </h2>
                    <p className={`text-sm sm:text-base md:text-lg lg:text-2xl mb-4 sm:mb-6 ${getStatusColor()}`}>
                      {(() => {
                        const ctxBackend = captureState.recognitionData?.currentContext;
                        let targetActivity = ctxBackend?.currentActivity || ctxBackend?.nextActivity;
                        
                        if (targetActivity && targetActivity.description) {
                          const desc = targetActivity.description;
                          const parts = desc.split('-');
                          let activityName = '';
                          
                          if (parts.length >= 2 && parts[parts.length - 1].toLowerCase().includes('sala')) {
                            activityName = parts.slice(0, -1).join('-').trim();
                          } else {
                            activityName = desc;
                          }
                          
                          return `Tu próxima actividad: ${activityName} - ${targetActivity.time}`;
                        }
                        
                        return `Paciente ID: ${captureState.recognitionData.scheduleData.PatientID} • Hoy es ${getCurrentDay()}`;
                      })()}
                    </p>
                  </div>

                  {/* Tarjetas de Actividad y Sala */}
                  {(() => {
                    const ctxBackend = captureState.recognitionData?.currentContext;
                    const scheduleData = captureState.recognitionData?.scheduleData;
                    const day = ctxBackend?.day || getCurrentDay();
                    
                    let targetActivity = ctxBackend?.currentActivity || ctxBackend?.nextActivity;
                    let activityName = '';
                    let targetRoom = '';
                    let activityTime = '';

                    if (targetActivity && targetActivity.description) {
                      const desc = targetActivity.description;
                      const parts = desc.split('-');
                      
                      if (parts.length >= 2 && parts[parts.length - 1].toLowerCase().includes('sala')) {
                        activityName = parts.slice(0, -1).join('-').trim();
                        targetRoom = parts[parts.length - 1].trim();
                      } else {
                        activityName = desc;
                      }
                      
                      activityTime = targetActivity.time || '';
                    } else {
                      const todaySchedule = scheduleData?.[day] || '';
                      const activities = parseActivities(todaySchedule);
                      if (activities.length > 0) {
                        const firstActivity = activities[0];
                        activityName = firstActivity.activityName || '';
                        targetRoom = firstActivity.room || '';
                        activityTime = firstActivity.time || '';
                      }
                    }

                    const showActivity = !!activityName;
                    const { activityImage, roomImage } = resolveImages({ activityName }, targetRoom);

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mb-4 sm:mb-6 md:mb-8">
                        {/* Tarjeta Actividad */}
                        <div className="bg-white border-2 sm:border-3 border-sky-200 rounded-xl sm:rounded-2xl shadow-xl overflow-hidden transform hover:scale-105 transition-transform duration-200">
                          <div className="relative aspect-[16/10] bg-gradient-to-br from-sky-100 to-sky-200 overflow-hidden">
                            <img
                              src={activityImage}
                              alt={activityName || 'Actividad'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop';
                              }}
                            />
                            {showActivity && activityTime && (
                              <div className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 bg-sky-600 text-white px-2 py-1 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-full text-xs sm:text-sm md:text-base lg:text-lg font-bold shadow-lg">
                                {activityTime}
                              </div>
                            )}
                            <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 md:bottom-4 md:left-4 bg-black bg-opacity-60 text-white px-2 py-1 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-full text-xs sm:text-sm md:text-base lg:text-lg font-semibold">
                              Actividad
                            </div>
                          </div>
                          <div className="p-3 sm:p-4 md:p-6 lg:p-8">
                            <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-slate-800 mb-2 sm:mb-3">
                              {showActivity ? activityName : 'Día de descanso'}
                            </h3>
                            {showActivity && activityTime && (
                              <p className="text-sm sm:text-base md:text-lg lg:text-xl text-slate-600">
                                Horario: {activityTime}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Tarjeta Sala */}
                        <div className="bg-white border-2 sm:border-3 border-emerald-200 rounded-xl sm:rounded-2xl shadow-xl overflow-hidden transform hover:scale-105 transition-transform duration-200">
                          <div className="relative aspect-[16/10] bg-gradient-to-br from-emerald-100 to-emerald-200 overflow-hidden">
                            <img
                              src={roomImage}
                              alt={targetRoom || 'Sala'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = 'https://images.unsplash.com/photo-1571772996211-2f02c9727629?w=400&h=300&fit=crop';
                              }}
                            />
                            <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 md:bottom-4 md:left-4 bg-black bg-opacity-60 text-white px-2 py-1 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-full text-xs sm:text-sm md:text-base lg:text-lg font-semibold">
                              Ubicación
                            </div>
                          </div>
                          <div className="p-3 sm:p-4 md:p-6 lg:p-8">
                            <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-slate-800 mb-2 sm:mb-3">
                              {targetRoom ? targetRoom.charAt(0).toUpperCase() + targetRoom.slice(1) : 'Sin asignar'}
                            </h3>
                            {targetRoom && (
                              <p className="text-sm sm:text-base md:text-lg lg:text-xl text-slate-600">
                                Dirígete aquí para tu actividad
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Mensaje contextual */}
                  <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-sky-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 lg:p-8 mb-4 sm:mb-6 md:mb-8 border-l-4 sm:border-l-6 border-sky-500 shadow-lg">
                    <div className="flex items-center mb-2 sm:mb-3 md:mb-4">
                      <div className="bg-sky-600 rounded-full p-2 sm:p-3 mr-2 sm:mr-3 md:mr-4">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-white" />
                      </div>
                      <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-sky-800">Información Actual</h3>
                    </div>
                    <p className="text-sm sm:text-base md:text-lg lg:text-xl text-sky-900 leading-relaxed font-medium">
                      {captureState.message}
                    </p>
                  </div>

                  {/* Resumen del día */}
                  {captureState.recognitionData.currentContext && (
                    <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 lg:p-8 mb-4 sm:mb-6 md:mb-8 shadow-lg border border-slate-200">
                      <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-slate-800 mb-3 sm:mb-4 md:mb-6 text-center">Resumen de Hoy</h3>
                      <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6 text-center">
                        <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-5 shadow-md">
                          <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-sky-600 mb-2">
                            {captureState.recognitionData.currentContext.totalActivitiesToday}
                          </div>
                          <div className="text-sm sm:text-base md:text-lg text-slate-600 font-semibold leading-tight">Total</div>
                        </div>
                        <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-5 shadow-md">
                          <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-emerald-600 mb-2">
                            {captureState.recognitionData.currentContext.completedToday}
                          </div>
                          <div className="text-sm sm:text-base md:text-lg text-slate-600 font-semibold leading-tight">Completadas</div>
                        </div>
                        <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-5 shadow-md">
                          <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-amber-600 mb-2">
                            {captureState.recognitionData.currentContext.upcomingToday}
                          </div>
                          <div className="text-sm sm:text-base md:text-lg text-slate-600 font-semibold leading-tight">Pendientes</div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Horario del día */}
                  <div className="bg-white rounded-2xl p-6 sm:p-8 mb-8 shadow-lg border-2 border-slate-200">
                    <div className="flex items-center mb-6">
                      <div className="bg-sky-600 rounded-full p-3 mr-4">
                        <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                      </div>
                      <h3 className="text-xl sm:text-3xl font-bold text-slate-800">Horario de Hoy</h3>
                    </div>
                    
                    {(() => {
                      const currentDay = getCurrentDay();
                      const todayActivities = captureState.recognitionData?.scheduleData?.[currentDay];
                      const activities = parseActivities(todayActivities || '');
                      
                      if (activities.length === 0) {
                        return (
                          <div className="text-center py-12">
                            <div className="bg-slate-100 rounded-full p-8 mx-auto mb-6 w-fit">
                              <Clock className="w-16 h-16 text-slate-400 mx-auto" />
                            </div>
                            <p className="text-2xl sm:text-3xl text-slate-600 font-semibold mb-2">Hoy es tu día de descanso</p>
                            <p className="text-lg sm:text-xl text-slate-500">Disfruta tu tiempo libre</p>
                          </div>
                        );
                      }

                      const currentTime = new Date();
                      const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
                      
                      return (
                        <div className="space-y-4">
                          {activities.map((activity, index) => {
                            const [hours, minutes] = activity.time.split(':').map(Number);
                            const activityMinutes = hours * 60 + minutes;
                            const isPast = activityMinutes < currentMinutes;
                            const isCurrent = Math.abs(currentMinutes - activityMinutes) <= 30 && currentMinutes >= activityMinutes - 15;
                            
                            return (
                              <div 
                                key={index} 
                                className={`flex items-center p-3 sm:p-4 md:p-5 lg:p-6 rounded-lg sm:rounded-xl border-2 sm:border-3 shadow-md ${
                                  isCurrent 
                                    ? 'bg-emerald-50 border-emerald-300 shadow-lg scale-105' 
                                    : isPast 
                                      ? 'bg-slate-100 border-slate-300' 
                                      : 'bg-sky-50 border-sky-200'
                                } transition-all duration-200`}
                              >
                                <div className={`rounded-full p-2 sm:p-3 mr-2 sm:mr-3 md:mr-4 ${
                                  isCurrent 
                                    ? 'bg-emerald-600' 
                                    : isPast 
                                      ? 'bg-slate-500' 
                                      : 'bg-sky-600'
                                }`}>
                                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
                                </div>
                                
                                <div className="flex-grow">
                                  <div className={`text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2 ${
                                    isCurrent 
                                      ? 'text-emerald-800' 
                                      : isPast 
                                        ? 'text-slate-600' 
                                        : 'text-sky-800'
                                  }`}>
                                    {activity.time}
                                  </div>
                                  <div className={`text-sm sm:text-base md:text-lg lg:text-xl ${
                                    isCurrent 
                                      ? 'text-emerald-700' 
                                      : isPast 
                                        ? 'text-slate-600' 
                                        : 'text-slate-700'
                                  }`}>
                                    {activity.room ? activity.fullDescription : activity.description}
                                  </div>
                                </div>
                                
                                {isCurrent && (
                                  <div className="bg-emerald-600 text-white px-2 py-1 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-full text-xs sm:text-sm md:text-base lg:text-lg font-bold flex-shrink-0">
                                    AHORA
                                  </div>
                                )}
                                {isPast && (
                                  <div className="bg-slate-500 text-white px-2 py-1 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-full text-xs sm:text-sm md:text-base lg:text-lg font-bold flex-shrink-0">
                                    OK
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Estadísticas de reconocimiento */}
                  <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 shadow-lg border border-slate-200">
                    <div className="text-sm sm:text-base font-semibold text-slate-600 mb-3 sm:mb-4 text-center">Datos del reconocimiento:</div>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 text-center">
                      <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-md">
                        <div className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-slate-700 mb-2">Similitud:</div>
                        <div className="text-xl sm:text-2xl md:text-3xl font-bold text-emerald-600">
                          {captureState.recognitionData.similarity}%
                        </div>
                      </div>
                      <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-md">
                        <div className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-slate-700 mb-2">Confianza:</div>
                        <div className="text-xl sm:text-2xl md:text-3xl font-bold text-emerald-600">
                          {captureState.recognitionData.confidence}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {captureState.recognitionData?.ui && (
                    <div className="mb-6">
                      <h2 className={`text-2xl sm:text-4xl font-bold mb-4 ${getStatusColor()}`}>
                        {captureState.recognitionData.ui.title}
                      </h2>
                      <p className={`text-lg sm:text-2xl mb-6 ${getStatusColor()}`}>
                        {captureState.recognitionData.ui.subtitle}
                      </p>
                    </div>
                  )}
                  <p className={`text-xl sm:text-3xl font-semibold ${getStatusColor()}`}>
                    {captureState.message || 'Listo para comenzar'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex flex-col gap-3 sm:gap-4 md:gap-6 justify-center max-w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
            {captureState.status === 'idle' && (
              <button
                onClick={startCamera}
                className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white px-6 py-4 sm:px-8 sm:py-6 md:px-10 md:py-6 lg:px-14 lg:py-8 rounded-xl sm:rounded-2xl text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold shadow-xl transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 sm:gap-3 md:gap-4 lg:gap-6 min-h-[60px] sm:min-h-[70px] md:min-h-[80px] lg:min-h-[100px] border-2 border-sky-500"
              >
                <Camera className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10" />
                Activar Cámara
              </button>
            )}

            {captureState.status === 'camera-active' && (
              <>
                <button
                  onClick={capturePhoto}
                  className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white px-6 py-4 sm:px-8 sm:py-6 md:px-10 md:py-6 lg:px-14 lg:py-8 rounded-xl sm:rounded-2xl text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold shadow-xl transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 sm:gap-3 md:gap-4 lg:gap-6 min-h-[60px] sm:min-h-[70px] md:min-h-[80px] lg:min-h-[100px] border-2 border-emerald-500"
                >
                  <Camera className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10" />
                  Tomar Foto
                </button>
                <button
                  onClick={resetCapture}
                  className="bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white px-6 py-4 sm:px-8 sm:py-6 md:px-10 md:py-6 lg:px-14 lg:py-8 rounded-xl sm:rounded-2xl text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold shadow-xl transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 sm:gap-3 md:gap-4 lg:gap-6 min-h-[60px] sm:min-h-[70px] md:min-h-[80px] lg:min-h-[100px] border-2 border-slate-500"
                >
                  <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10" />
                  Cancelar
                </button>
              </>
            )}

            {(['user-found', 'user-not-found', 'no-face', 'error'].includes(captureState.status)) && (
              <button
                onClick={resetCapture}
                className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white px-6 py-4 sm:px-8 sm:py-6 md:px-10 md:py-6 lg:px-14 lg:py-8 rounded-xl sm:rounded-2xl text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold shadow-xl transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 sm:gap-3 md:gap-4 lg:gap-6 min-h-[60px] sm:min-h-[70px] md:min-h-[80px] lg:min-h-[100px] border-2 border-sky-500"
              >
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10" />
                Comenzar de Nuevo
              </button>
            )}

            {(captureState.status === 'capturing' || captureState.status === 'sending') && (
              <div className="bg-slate-300 text-slate-500 px-6 py-4 sm:px-8 sm:py-6 md:px-10 md:py-6 lg:px-14 lg:py-8 rounded-xl sm:rounded-2xl text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold flex items-center justify-center gap-2 sm:gap-3 md:gap-4 lg:gap-6 min-h-[60px] sm:min-h-[70px] md:min-h-[80px] lg:min-h-[100px] cursor-not-allowed border-2 border-slate-400">
                <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 lg:h-10 lg:w-10 border-3 sm:border-4 border-slate-600 border-t-transparent"></div>
                Procesando...
              </div>
            )}
          </div>
        </div>

        {/* Instrucciones mejoradas */}
        {shouldShowCamera && (
          <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-sky-100 border-2 sm:border-3 border-sky-200 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 shadow-lg">
            <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-sky-800 mb-4 sm:mb-6 text-center flex items-center justify-center">
              <div className="bg-sky-600 rounded-full p-1.5 sm:p-2 mr-2 sm:mr-3">
                <User className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              Instrucciones de Uso
            </h2>
            <div className="space-y-3 sm:space-y-4 text-sm sm:text-base md:text-lg lg:text-xl text-sky-700">
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4 bg-white p-3 sm:p-4 rounded-lg sm:rounded-xl shadow-md">
                <div className="bg-sky-600 text-white rounded-full w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center font-bold text-sm sm:text-base md:text-lg lg:text-xl flex-shrink-0">1</div>
                <span className="font-semibold">Toque "Activar Cámara" para comenzar</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4 bg-white p-3 sm:p-4 rounded-lg sm:rounded-xl shadow-md">
                <div className="bg-sky-600 text-white rounded-full w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center font-bold text-sm sm:text-base md:text-lg lg:text-xl flex-shrink-0">2</div>
                <span className="font-semibold">Posicione su rostro frente a la cámara</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4 bg-white p-3 sm:p-4 rounded-lg sm:rounded-xl shadow-md">
                <div className="bg-sky-600 text-white rounded-full w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center font-bold text-sm sm:text-base md:text-lg lg:text-xl flex-shrink-0">3</div>
                <span className="font-semibold">Toque "Tomar Foto" para ver sus horarios</span>
              </div>
            </div>
            
            {/* Footer con branding */}
            <div className="mt-4 sm:mt-6 md:mt-8 pt-3 sm:pt-4 md:pt-6 border-t border-sky-200 sm:border-t-2 text-center">
              <p className="text-sky-600 font-semibold text-sm sm:text-base md:text-lg">
                Fundación Daño Cerebral Adquirido - ATENEU Castelló
              </p>
              <p className="text-sky-500 text-xs sm:text-sm md:text-base mt-1 sm:mt-2">
                Cuidando y apoyando tu rehabilitación cada día
              </p>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

export default App;