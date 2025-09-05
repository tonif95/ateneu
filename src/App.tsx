import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, AlertCircle, RotateCcw, User, XCircle, UserCheck, Calendar, Clock, Volume2 } from 'lucide-react';

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
      // If turning off help, cancel any ongoing speech
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
    // Don't speak here anymore - let the useEffect handle it
  }, [isHelpActive]);

  const getHelpInstructions = useCallback(() => {
    switch (captureState.status) {
      case 'idle':
        return "Bienvenido al Asistente de Rehabilitación. Para comenzar, busque y toque el botón azul que dice 'Activar Cámara' que está debajo. La aplicación necesita acceso a su cámara para reconocer su rostro y mostrarle sus horarios de actividades.";
      
      case 'camera-active':
        return "¡Perfecto! La cámara está ahora activada y funcionando. Colóquese frente a la cámara para que pueda ver claramente su rostro en la pantalla. Cuando esté bien posicionado y listo, toque el botón verde que dice 'Tomar Foto'. Si prefiere cancelar, puede tocar el botón gris 'Cancelar'.";
      
      case 'capturing':
        return "Tomando su fotografía ahora. Por favor, manténgase muy quieto durante unos segundos mientras capturamos y procesamos su imagen.";
      
      case 'sending':
        return "Ahora estamos procesando su imagen para el reconocimiento facial. Este proceso puede tomar entre 10 y 30 segundos. Por favor, tenga paciencia.";
      
      case 'user-found':
        return (() => {
          const scheduleData = captureState.recognitionData?.scheduleData;
          const currentContext = captureState.recognitionData?.currentContext;
          const name = scheduleData?.Nombre || 'Usuario';
          
          let message = `¡Excelente ${name}! Le hemos reconocido correctamente. `;
          
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
        return "Sistema de reconocimiento facial para pacientes del centro de rehabilitación. Active la ayuda por voz tocando este botón cuando necesite instrucciones detalladas paso a paso.";
    }
  }, [captureState.status, captureState.recognitionData]);

  // Effect to automatically provide voice guidance when state changes
  useEffect(() => {
    if (isHelpActive) {
      const helpText = getHelpInstructions();
      // Add a small delay to ensure the UI has updated
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
      case 'user-found': return 'text-green-600';
      case 'user-not-found': return 'text-orange-600';
      case 'no-face': case 'error': return 'text-red-600';
      case 'sending': case 'capturing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = () => {
    switch (captureState.status) {
      case 'user-found': return <UserCheck className="w-8 h-8 sm:w-12 sm:h-12" />;
      case 'user-not-found': return <AlertCircle className="w-8 h-8 sm:w-12 sm:h-12" />;
      case 'no-face': return <XCircle className="w-8 h-8 sm:w-12 sm:h-12" />;
      case 'error': return <AlertCircle className="w-8 h-8 sm:w-12 sm:h-12" />;
      case 'camera-active': return <Camera className="w-8 h-8 sm:w-12 sm:h-12" />;
      default: return <User className="w-8 h-8 sm:w-12 sm:h-12" />;
    }
  };

  const getStatusBackground = () => {
    switch (captureState.status) {
      case 'user-found': return 'bg-green-100 border-green-300';
      case 'user-not-found': return 'bg-orange-100 border-orange-300';
      case 'no-face': case 'error': return 'bg-red-100 border-red-300';
      case 'sending': case 'capturing': return 'bg-blue-100 border-blue-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  const shouldShowCamera = ['idle', 'camera-active', 'capturing', 'sending'].includes(captureState.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-3 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Accessibility Help Button - Fixed position at top */}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={toggleHelp}
            className={`
              ${isHelpActive 
                ? 'bg-red-600 hover:bg-red-700 ring-4 ring-red-200' 
                : 'bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-200'
              } 
              text-white p-4 sm:p-5 rounded-full shadow-2xl 
              transform transition-all duration-300 hover:scale-110 active:scale-95
              flex items-center justify-center gap-2
              focus:outline-none focus:ring-4 focus:ring-blue-300
              min-w-[60px] min-h-[60px] sm:min-w-[70px] sm:min-h-[70px]
            `}
            aria-label={isHelpActive ? "Detener ayuda por voz" : "Activar ayuda por voz"}
            title={isHelpActive ? "Detener ayuda por voz" : "Activar ayuda por voz"}
          >
            <Volume2 className={`w-6 h-6 sm:w-7 sm:h-7 ${isHelpActive ? 'animate-pulse' : ''}`} />
            {isHelpActive && (
              <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-red-500 rounded-full animate-ping" />
            )}
          </button>
          
          {/* Help instructions tooltip */}
          {isHelpActive && (
            <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border-2 border-blue-200 p-4 text-sm text-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-blue-800">Ayuda Activada</span>
              </div>
              <p className="leading-relaxed">
                {getHelpInstructions()}
              </p>
              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                Toque el botón rojo para detener la ayuda por voz
              </div>
            </div>
          )}
        </div>
        {/* Header - Optimizado para móvil */}
        <div className="text-center mb-4 sm:mb-8">
          <div className="flex items-center justify-center mb-3 sm:mb-4">
            <div className="bg-blue-600 p-3 sm:p-4 rounded-full shadow-lg">
              <User className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
            </div>
          </div>
          <h1 className="text-xl sm:text-4xl font-bold text-gray-800 mb-2">
            Asistente de Rehabilitación
          </h1>
          <p className="text-sm sm:text-xl text-gray-600">
            Sistema de Reconocimiento Facial
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-8 mb-4 sm:mb-6">
          {/* Camera Section - Optimizado para móvil */}
          {shouldShowCamera && (
            <div className="relative mb-4 sm:mb-8">
              <div className="aspect-video bg-gray-100 rounded-xl sm:rounded-2xl overflow-hidden border-2 sm:border-4 border-gray-200 relative">
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
                      <Camera className="w-16 h-16 sm:w-24 sm:h-24 text-gray-400 mx-auto mb-4" />
                      <p className="text-lg sm:text-2xl text-gray-500 font-medium">
                        Cámara inactiva
                      </p>
                    </div>
                  </div>
                )}
                
                {captureState.status === 'capturing' && (
                  <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
                    <div className="bg-blue-600 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-full text-base sm:text-xl font-semibold">
                      📸 Capturando...
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status Message */}
          <div className="text-center mb-4 sm:mb-8">
            <div className={`inline-block p-4 sm:p-8 rounded-2xl sm:rounded-3xl border-2 ${getStatusBackground()}`}>
              <div className={`flex items-center justify-center mb-3 sm:mb-4 ${getStatusColor()}`}>
                {getStatusIcon()}
              </div>
              
              {captureState.status === 'user-found' && captureState.recognitionData?.scheduleData ? (
                <div className="max-w-4xl">
                  <h2 className={`text-lg sm:text-3xl font-bold mb-2 ${getStatusColor()}`}>
                    ¡Hola {captureState.recognitionData.scheduleData.Nombre}!
                  </h2>
                  <p className={`text-sm sm:text-xl mb-4 sm:mb-6 ${getStatusColor()}`}>
                    {(() => {
                      const ctxBackend = captureState.recognitionData?.currentContext;
                      const scheduleData = captureState.recognitionData?.scheduleData;
                      const day = ctxBackend?.day || getCurrentDay();
                      
                      // Obtener actividad objetivo del backend
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
                        
                        return targetActivity ? 
                          `Próxima actividad: ${activityName} - ${activityTime}` :
                          `Paciente ID: ${captureState.recognitionData.scheduleData.PatientID} • ${getCurrentDay()}`;
                      }
                      
                      return `Paciente ID: ${captureState.recognitionData.scheduleData.PatientID} • ${getCurrentDay()}`;
                    })()}
                  </p>

                  {/* === TARJETAS: ACTIVIDAD y SALA - Optimizadas para móvil === */}
                  {(() => {
                    const ctxBackend = captureState.recognitionData?.currentContext;
                    const scheduleData = captureState.recognitionData?.scheduleData;
                    const day = ctxBackend?.day || getCurrentDay();
                    
                    // Obtener actividad objetivo del backend
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 mb-4 sm:mb-8">
                        {/* Tarjeta Actividad - Móvil optimizada */}
                        <div className="bg-white border border-gray-200 sm:border-2 rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg overflow-hidden">
                          <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
                            <img
                              src={activityImage}
                              alt={activityName || 'Actividad'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop';
                              }}
                            />
                            {showActivity && activityTime && (
                              <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded-full text-xs sm:text-sm font-semibold">
                                {activityTime}
                              </div>
                            )}
                          </div>
                          <div className="p-3 sm:p-6">
                            <div className="text-xs sm:text-sm font-semibold text-blue-600 uppercase tracking-wide mb-1 sm:mb-2">
                              ACTIVIDAD
                            </div>
                            <div className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">
                              {showActivity ? activityName : 'Día de descanso'}
                            </div>
                            {showActivity && activityTime && (
                              <div className="text-sm sm:text-lg text-gray-600">
                                Horario: {activityTime}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tarjeta Sala - Móvil optimizada */}
                        <div className="bg-white border border-gray-200 sm:border-2 rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg overflow-hidden">
                          <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
                            <img
                              src={roomImage}
                              alt={targetRoom || 'Sala'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = 'https://images.unsplash.com/photo-1571772996211-2f02c9727629?w=400&h=300&fit=crop';
                              }}
                            />
                            {targetRoom && (
                              <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white px-2 py-1 rounded-full text-xs font-semibold">
                                📍 Ubicación
                              </div>
                            )}
                          </div>
                          <div className="p-3 sm:p-6">
                            <div className="text-xs sm:text-sm font-semibold text-green-600 uppercase tracking-wide mb-1 sm:mb-2">
                              SALA
                            </div>
                            <div className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">
                              {targetRoom ? targetRoom.charAt(0).toUpperCase() + targetRoom.slice(1) : 'Sin asignar'}
                            </div>
                            {targetRoom && (
                              <div className="text-sm sm:text-lg text-gray-600">
                                Dirígete aquí para tu actividad
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Mensaje contextual principal - Móvil optimizado */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-l-4 border-blue-500">
                    <div className="flex items-center mb-2 sm:mb-3">
                      <Clock className="w-5 h-5 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3" />
                      <h3 className="text-lg sm:text-2xl font-bold text-blue-800">Información Actual</h3>
                    </div>
                    <p className="text-sm sm:text-lg text-blue-900 leading-relaxed">
                      {captureState.message}
                    </p>
                  </div>

                  {/* Resumen del día - Móvil optimizado */}
                  {captureState.recognitionData.currentContext && (
                    <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-inner">
                      <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-2 sm:mb-3">Resumen de Hoy</h3>
                      <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                        <div>
                          <div className="text-lg sm:text-2xl font-bold text-blue-600">
                            {captureState.recognitionData.currentContext.totalActivitiesToday}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600">Total</div>
                        </div>
                        <div>
                          <div className="text-lg sm:text-2xl font-bold text-green-600">
                            {captureState.recognitionData.currentContext.completedToday}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600">Completadas</div>
                        </div>
                        <div>
                          <div className="text-lg sm:text-2xl font-bold text-orange-600">
                            {captureState.recognitionData.currentContext.upcomingToday}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600">Pendientes</div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Horario del día actual - Móvil optimizado */}
                  <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 shadow-inner text-left">
                    <div className="flex items-center mb-3 sm:mb-4">
                      <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 mr-2" />
                      <h3 className="text-lg sm:text-2xl font-bold text-gray-800">Horario de Hoy</h3>
                    </div>
                    
                    {(() => {
                      const currentDay = getCurrentDay();
                      const todayActivities = captureState.recognitionData?.scheduleData?.[currentDay];
                      const activities = parseActivities(todayActivities || '');
                      
                      if (activities.length === 0) {
                        return (
                          <div className="text-center py-6 sm:py-8">
                            <Clock className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
                            <p className="text-base sm:text-xl text-gray-600">Hoy es tu día de descanso</p>
                            <p className="text-sm sm:text-base text-gray-500">¡Disfruta tu tiempo libre!</p>
                          </div>
                        );
                      }

                      const currentTime = new Date();
                      const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
                      
                      return (
                        <div className="space-y-2 sm:space-y-3">
                          {activities.map((activity, index) => {
                            const [hours, minutes] = activity.time.split(':').map(Number);
                            const activityMinutes = hours * 60 + minutes;
                            const isPast = activityMinutes < currentMinutes;
                            const isCurrent = Math.abs(currentMinutes - activityMinutes) <= 30 && currentMinutes >= activityMinutes - 15;
                            
                            return (
                              <div 
                                key={index} 
                                className={`flex items-center p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 ${
                                  isCurrent 
                                    ? 'bg-green-100 border-green-300 shadow-lg' 
                                    : isPast 
                                      ? 'bg-gray-100 border-gray-300' 
                                      : 'bg-blue-50 border-blue-200'
                                }`}
                              >
                                <Clock className={`w-5 h-5 sm:w-6 sm:h-6 mr-3 sm:mr-4 flex-shrink-0 ${
                                  isCurrent 
                                    ? 'text-green-600' 
                                    : isPast 
                                      ? 'text-gray-500' 
                                      : 'text-blue-600'
                                }`} />
                                <div className="flex-grow">
                                  <div className={`text-lg sm:text-2xl font-bold ${
                                    isCurrent 
                                      ? 'text-green-800' 
                                      : isPast 
                                        ? 'text-gray-600' 
                                        : 'text-blue-800'
                                  }`}>
                                    {activity.time}
                                  </div>
                                  <div className={`text-sm sm:text-lg ${
                                    isCurrent 
                                      ? 'text-green-700' 
                                      : isPast 
                                        ? 'text-gray-600' 
                                        : 'text-gray-700'
                                  }`}>
                                    {activity.room ? activity.fullDescription : activity.description}
                                  </div>
                                </div>
                                {isCurrent && (
                                  <div className="text-green-600 font-bold text-sm sm:text-lg">
                                    ● AHORA
                                  </div>
                                )}
                                {isPast && (
                                  <div className="text-gray-500 font-medium text-xs sm:text-sm">
                                    ✓ OK
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Estadísticas de reconocimiento - Móvil optimizado */}
                  <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 mt-4 sm:mt-6 shadow-inner">
                    <div className="text-xs sm:text-sm text-gray-600 mb-2">Datos del reconocimiento:</div>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm">
                      <div>
                        <span className="font-semibold">Similitud:</span>
                        <div className="text-base sm:text-lg font-bold text-green-600">
                          {captureState.recognitionData.similarity}%
                        </div>
                      </div>
                      <div>
                        <span className="font-semibold">Confianza:</span>
                        <div className="text-base sm:text-lg font-bold text-green-600">
                          {captureState.recognitionData.confidence}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {captureState.recognitionData?.ui && (
                    <>
                      <h2 className={`text-xl sm:text-3xl font-bold mb-2 ${getStatusColor()}`}>
                        {captureState.recognitionData.ui.title}
                      </h2>
                      <p className={`text-base sm:text-xl mb-4 ${getStatusColor()}`}>
                        {captureState.recognitionData.ui.subtitle}
                      </p>
                    </>
                  )}
                  <p className={`text-lg sm:text-2xl font-semibold ${getStatusColor()}`}>
                    {captureState.message || 'Listo para comenzar'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons - Optimizados para móvil */}
          <div className="flex flex-col gap-3 sm:gap-4 justify-center">
            {captureState.status === 'idle' && (
              <button
                onClick={startCamera}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 sm:px-12 sm:py-6 rounded-xl sm:rounded-2xl text-lg sm:text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-3 sm:gap-4 min-h-[60px] sm:min-h-[80px]"
              >
                <Camera className="w-6 h-6 sm:w-8 sm:h-8" />
                Activar Cámara
              </button>
            )}

            {captureState.status === 'camera-active' && (
              <>
                <button
                  onClick={capturePhoto}
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 sm:px-12 sm:py-6 rounded-xl sm:rounded-2xl text-lg sm:text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-3 sm:gap-4 min-h-[60px] sm:min-h-[80px]"
                >
                  <Camera className="w-6 h-6 sm:w-8 sm:h-8" />
                  Tomar Foto
                </button>
                <button
                  onClick={resetCapture}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-8 py-4 sm:px-12 sm:py-6 rounded-xl sm:rounded-2xl text-lg sm:text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-3 sm:gap-4 min-h-[60px] sm:min-h-[80px]"
                >
                  <RotateCcw className="w-6 h-6 sm:w-8 sm:h-8" />
                  Cancelar
                </button>
              </>
            )}

            {(['user-found', 'user-not-found', 'no-face', 'error'].includes(captureState.status)) && (
              <button
                onClick={resetCapture}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 sm:px-12 sm:py-6 rounded-xl sm:rounded-2xl text-lg sm:text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-3 sm:gap-4 min-h-[60px] sm:min-h-[80px]"
              >
                <RotateCcw className="w-6 h-6 sm:w-8 sm:h-8" />
                Comenzar de Nuevo
              </button>
            )}

            {(captureState.status === 'capturing' || captureState.status === 'sending') && (
              <div className="bg-gray-300 text-gray-500 px-8 py-4 sm:px-12 sm:py-6 rounded-xl sm:rounded-2xl text-lg sm:text-2xl font-bold flex items-center justify-center gap-3 sm:gap-4 min-h-[60px] sm:min-h-[80px] cursor-not-allowed">
                <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-gray-600"></div>
                Procesando...
              </div>
            )}
          </div>
        </div>

        {/* Instructions - Optimizadas para móvil */}
        {shouldShowCamera && (
          <div className="bg-blue-50 border border-blue-200 sm:border-2 rounded-xl sm:rounded-2xl p-4 sm:p-6">
            <h2 className="text-lg sm:text-2xl font-bold text-blue-800 mb-3 sm:mb-4 text-center">
              Instrucciones
            </h2>
            <div className="space-y-2 sm:space-y-3 text-sm sm:text-lg text-blue-700">
              <div className="flex items-center gap-3">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center font-bold text-sm sm:text-base">1</span>
                <span>Toque "Activar Cámara" para comenzar</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center font-bold text-sm sm:text-base">2</span>
                <span>Posicione su rostro frente a la cámara</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center font-bold text-sm sm:text-base">3</span>
                <span>Toque "Tomar Foto" para ver sus horarios</span>
              </div>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

export default App;
