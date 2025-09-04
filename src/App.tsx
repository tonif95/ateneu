import React, { useState, useRef, useCallback } from 'react';
import { Camera, AlertCircle, RotateCcw, User, XCircle, UserCheck, Calendar, Clock } from 'lucide-react';

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
        // Si la respuesta es un array, tomamos el primer elemento
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

  const getCurrentDay = () => {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const today = new Date();
    return days[today.getDay()];
  };

  // ==== PARSE ACTIVITIES (mejorado: soporta "actividad - sala") ====
  const parseActivities = (activitiesString: string) => {
    if (!activitiesString || activitiesString.toLowerCase().includes('descanso')) {
      return [];
    }
    
    return activitiesString
      .split(',')
      .map((raw) => raw.trim())
      .map((entry) => {
        // formatos:
        // "09:00-Fisioterapia"
        // "09:30-Hidroterapia-Sala A"
        const [timePart, ...rest] = entry.split('-');
        const time = timePart?.trim();
        const desc = rest.join('-').trim(); // "Hidroterapia-Sala A" o "Fisioterapia"

        let activityName = desc;
        let room: string | undefined = undefined;

        const parts = desc.split('-').map((p) => p.trim());
        if (parts.length > 1) {
          const last = parts[parts.length - 1];
          if (/^sala\b/i.test(last)) {
            room = last;
            activityName = parts.slice(0, -1).join(' - ');
          }
        }

        const fullDescription = room ? `${activityName} • ${room}` : activityName;
        return { time, description: desc, activityName, room, fullDescription };
      })
      .filter((a) => a.time && a.activityName);
  };

  // ==== RESOLVER DE IMÁGENES ====
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

  // ==== INFERENCIA DE ACTIVIDAD/SALA DESDE EL HORARIO ====
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
      const [h, m] = a.time.split(':').map(Number);
      const t = h * 60 + m;

      const isCurrent = Math.abs(nowMin - t) <= 30 && nowMin >= t - 15;
      if (isCurrent && !current) {
        current = { ...a };
      }
      if (t > nowMin) {
        next = { ...a };
        break;
      }
    }

    if (!current && !next) {
      const last = activities[activities.length - 1];
      const [h, m] = last.time.split(':').map(Number);
      const t = h * 60 + m;
      if (t <= nowMin) current = { ...last };
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
      case 'user-found': return <UserCheck className="w-12 h-12" />;
      case 'user-not-found': return <AlertCircle className="w-12 h-12" />;
      case 'no-face': return <XCircle className="w-12 h-12" />;
      case 'error': return <AlertCircle className="w-12 h-12" />;
      case 'camera-active': return <Camera className="w-12 h-12" />;
      default: return <User className="w-12 h-12" />;
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

  // Determinar si mostrar la cámara
  const shouldShowCamera = ['idle', 'camera-active', 'capturing', 'sending'].includes(captureState.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-600 p-4 rounded-full shadow-lg">
              <User className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Asistente de Rehabilitación
          </h1>
          <p className="text-xl text-gray-600">
            Sistema de Reconocimiento Facial
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6">
          {/* Camera Section - Solo se muestra cuando es necesario */}
          {shouldShowCamera && (
            <div className="relative mb-8">
              <div className="aspect-video bg-gray-100 rounded-2xl overflow-hidden border-4 border-gray-200 relative">
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
                      <Camera className="w-24 h-24 text-gray-400 mx-auto mb-4" />
                      <p className="text-2xl text-gray-500 font-medium">
                        Cámara inactiva
                      </p>
                    </div>
                  </div>
                )}
                
                {captureState.status === 'capturing' && (
                  <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
                    <div className="bg-blue-600 text-white px-6 py-3 rounded-full text-xl font-semibold">
                      📸 Capturando...
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status Message */}
          <div className="text-center mb-8">
            <div className={`inline-block p-8 rounded-3xl border-2 ${getStatusBackground()}`}>
              <div className={`flex items-center justify-center mb-4 ${getStatusColor()}`}>
                {getStatusIcon()}
              </div>
              
              {captureState.status === 'user-found' && captureState.recognitionData?.scheduleData ? (
                <div className="max-w-4xl">
                  <h2 className={`text-3xl font-bold mb-2 ${getStatusColor()}`}>
                    ¡Hola {captureState.recognitionData.scheduleData.Nombre}!
                  </h2>
                  <p className={`text-xl mb-6 ${getStatusColor()}`}>
                    {(() => {
                      const statusInfo = captureState.recognitionData?.currentContext?.statusInfo;
                      if (statusInfo && !statusInfo.includes('undefined')) {
                        return statusInfo;
                      }
                      // Si hay próxima actividad, construir un mensaje adecuado
                      const nextActivity = captureState.recognitionData?.currentContext?.nextActivity;
                      if (nextActivity) {
                        const actName = nextActivity.activityName || nextActivity.description?.split('-')[0]?.trim() || 'Actividad';
                        return `Próxima actividad: ${actName} - ${nextActivity.time || ''}`;
                      }
                      return `Paciente ID: ${captureState.recognitionData.scheduleData.PatientID} • ${getCurrentDay()}`;
                    })()}
                  </p>

                  {/* === TARJETAS: ACTIVIDAD y SALA === */}
                  {(() => {
                    const ctxBackend = captureState.recognitionData?.currentContext;
                    const day = ctxBackend?.day || getCurrentDay();
                    const hasActivities = !!(ctxBackend?.currentActivity || ctxBackend?.nextActivity);

                    let targetActivity = null;
                    let targetRoom = '';

                    if (hasActivities) {
                      // Usar datos del backend
                      targetActivity = ctxBackend?.currentActivity || ctxBackend?.nextActivity;
                      // Obtener la sala del targetActivity o inferirla desde la descripción
                      if (targetActivity) {
                        targetRoom = targetActivity.room || '';
                        // Si no hay sala pero hay descripción, intentar extraerla
                        if (!targetRoom && targetActivity.description) {
                          const parts = targetActivity.description.split('-').map(p => p.trim());
                          const lastPart = parts[parts.length - 1];
                          if (lastPart && /^sala\s/i.test(lastPart)) {
                            targetRoom = lastPart;
                          }
                        }
                      }
                    } else {
                      // Inferir desde el horario
                      const inferred = inferContextFromSchedule(captureState.recognitionData?.scheduleData, day);
                      targetActivity = inferred.currentActivity || inferred.nextActivity;
                      targetRoom = targetActivity?.room || '';
                    }

                    const showActivity = !!targetActivity;
                    const { activityImage, roomImage } = resolveImages(targetActivity, targetRoom);

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Tarjeta Actividad */}
                        <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg overflow-hidden transform transition-all duration-300 hover:shadow-xl">
                          <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
                            <img
                              src={activityImage}
                              alt={targetActivity?.activityName || 'Actividad'}
                              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                              onError={(e) => {
                                e.currentTarget.src = 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop';
                              }}
                            />
                            {showActivity && targetActivity?.time && (
                              <div className="absolute top-3 right-3 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                                {targetActivity.time}
                              </div>
                            )}
                          </div>
                          <div className="p-6">
                            <div className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-2">
                              ACTIVIDAD
                            </div>
                            <div className="text-2xl font-bold text-gray-900 mb-2">
                              {showActivity ? (() => {
                                // Extraer solo el nombre de la actividad, sin la sala
                                const actName = targetActivity.activityName || '';
                                const desc = targetActivity.description || '';
                                if (actName) {
                                  return actName;
                                }
                                // Si no hay activityName, extraer de description quitando la sala
                                const parts = desc.split('-').map(p => p.trim());
                                // Filtrar partes que parecen ser salas
                                const nameParts = parts.filter(p => !/^sala\s/i.test(p));
                                return nameParts.join(' - ') || 'Actividad programada';
                              })() : 'Día de descanso'}
                            </div>
                            {showActivity && targetActivity?.time && (
                              <div className="text-gray-600 text-lg">
                                Horario: {targetActivity.time}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tarjeta Sala */}
                        <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg overflow-hidden transform transition-all duration-300 hover:shadow-xl">
                          <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
                            <img
                              src={roomImage}
                              alt={targetRoom || 'Sala'}
                              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                              onError={(e) => {
                                e.currentTarget.src = 'https://images.unsplash.com/photo-1571772996211-2f02c9727629?w=400&h=300&fit=crop';
                              }}
                            />
                            {targetRoom && (
                              <div className="absolute bottom-3 left-3 bg-black bg-opacity-60 text-white px-3 py-1 rounded-full text-sm font-semibold">
                                📍 Ubicación
                              </div>
                            )}
                          </div>
                          <div className="p-6">
                            <div className="text-sm font-semibold text-green-600 uppercase tracking-wide mb-2">
                              SALA
                            </div>
                            <div className="text-2xl font-bold text-gray-900 mb-2">
                              {targetRoom ? targetRoom.charAt(0).toUpperCase() + targetRoom.slice(1) : 'Sin asignar'}
                            </div>
                            {targetRoom && (
                              <div className="text-gray-600 text-lg">
                                Dirígete aquí para tu actividad
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Mensaje contextual principal */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl p-6 mb-6 border-l-4 border-blue-500">
                    <div className="flex items-center mb-3">
                      <Clock className="w-8 h-8 text-blue-600 mr-3" />
                      <h3 className="text-2xl font-bold text-blue-800">Información Actual</h3>
                    </div>
                    <p className="text-lg text-blue-900 leading-relaxed">
                      {captureState.message}
                    </p>
                  </div>

                  {/* Panel de actividad actual/próxima */}
                  {captureState.recognitionData.currentContext && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {captureState.recognitionData.currentContext.currentActivity && (
                        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
                          <div className="flex items-center mb-2">
                            <div className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                            <h4 className="font-bold text-green-800">ACTIVIDAD ACTUAL</h4>
                          </div>
                          <p className="text-2xl font-bold text-green-700">
                            {captureState.recognitionData.currentContext.currentActivity.time}
                          </p>
                          <p className="text-green-800">
                            {captureState.recognitionData.currentContext.currentActivity.description}
                          </p>
                        </div>
                      )}
                      
                      {captureState.recognitionData.currentContext.nextActivity && (
                        <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
                          <div className="flex items-center mb-2">
                            <Clock className="w-4 h-4 text-orange-600 mr-2" />
                            <h4 className="font-bold text-orange-800">PRÓXIMA ACTIVIDAD</h4>
                          </div>
                          <p className="text-2xl font-bold text-orange-700">
                            {captureState.recognitionData.currentContext.nextActivity.time || '---'}
                          </p>
                          <p className="text-orange-800">
                            {captureState.recognitionData.currentContext.nextActivity.activityName || 
                             captureState.recognitionData.currentContext.nextActivity.description || 
                             'Sin actividad'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resumen del día */}
                  {captureState.recognitionData.currentContext && (
                    <div className="bg-gray-50 rounded-2xl p-4 mb-6 shadow-inner">
                      <h3 className="text-lg font-bold text-gray-800 mb-3">Resumen de Hoy</h3>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-blue-600">
                            {captureState.recognitionData.currentContext.totalActivitiesToday}
                          </div>
                          <div className="text-sm text-gray-600">Total</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-600">
                            {captureState.recognitionData.currentContext.completedToday}
                          </div>
                          <div className="text-sm text-gray-600">Completadas</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-orange-600">
                            {captureState.recognitionData.currentContext.upcomingToday}
                          </div>
                          <div className="text-sm text-gray-600">Pendientes</div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Horario del día actual */}
                  <div className="bg-white rounded-2xl p-6 mb-6 shadow-inner text-left">
                    <div className="flex items-center mb-4">
                      <Calendar className="w-6 h-6 text-blue-600 mr-2" />
                      <h3 className="text-2xl font-bold text-gray-800">Horario Detallado - {getCurrentDay()}</h3>
                    </div>
                    
                    {(() => {
                      const currentDay = getCurrentDay();
                      const todayActivities = captureState.recognitionData?.scheduleData?.[currentDay];
                      const activities = parseActivities(todayActivities || '');
                      
                      if (activities.length === 0) {
                        return (
                          <div className="text-center py-8">
                            <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                            <p className="text-xl text-gray-600">Hoy es tu día de descanso</p>
                            <p className="text-gray-500">¡Disfruta tu tiempo libre!</p>
                          </div>
                        );
                      }

                      const currentTime = new Date();
                      const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
                      
                      return (
                        <div className="space-y-3">
                          {activities.map((activity, index) => {
                            const [hours, minutes] = activity.time.split(':').map(Number);
                            const activityMinutes = hours * 60 + minutes;
                            const isPast = activityMinutes < currentMinutes;
                            const isCurrent = Math.abs(currentMinutes - activityMinutes) <= 30 && currentMinutes >= activityMinutes - 15;
                            
                            return (
                              <div 
                                key={index} 
                                className={`flex items-center p-4 rounded-xl border-2 ${
                                  isCurrent 
                                    ? 'bg-green-100 border-green-300 shadow-lg' 
                                    : isPast 
                                      ? 'bg-gray-100 border-gray-300' 
                                      : 'bg-blue-50 border-blue-200'
                                }`}
                              >
                                <Clock className={`w-6 h-6 mr-4 flex-shrink-0 ${
                                  isCurrent 
                                    ? 'text-green-600' 
                                    : isPast 
                                      ? 'text-gray-500' 
                                      : 'text-blue-600'
                                }`} />
                                <div className="flex-grow">
                                  <div className={`text-2xl font-bold ${
                                    isCurrent 
                                      ? 'text-green-800' 
                                      : isPast 
                                        ? 'text-gray-600' 
                                        : 'text-blue-800'
                                  }`}>
                                    {activity.time}
                                  </div>
                                  <div className={`text-lg ${
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
                                  <div className="text-green-600 font-bold text-lg">
                                    ● AHORA
                                  </div>
                                )}
                                {isPast && (
                                  <div className="text-gray-500 font-medium text-sm">
                                    ✓ Completada
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Horario semanal completo - simplificado */}
                  <div className="bg-gray-50 rounded-2xl p-6 shadow-inner text-left">
                    <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Horario Semanal</h3>
                    <div className="grid gap-2">
                      {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => {
                        const dayActivities = captureState.recognitionData?.scheduleData?.[day];
                        const activities = parseActivities(dayActivities || '');
                        const isToday = day === getCurrentDay();
                        
                        return (
                          <div 
                            key={day} 
                            className={`p-3 rounded-lg border ${
                              isToday 
                                ? 'bg-blue-100 border-blue-300 font-semibold' 
                                : 'bg-white border-gray-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <h4 className={`font-bold ${
                                isToday ? 'text-blue-800' : 'text-gray-700'
                              }`}>
                                {day} {isToday && '(HOY)'}
                              </h4>
                              <span className="text-sm text-gray-500">
                                {activities.length} actividades
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Estadísticas de reconocimiento */}
                  <div className="bg-white rounded-2xl p-4 mt-6 shadow-inner">
                    <div className="text-sm text-gray-600 mb-2">Datos del reconocimiento:</div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-semibold">Similitud:</span>
                        <div className="text-lg font-bold text-green-600">
                          {captureState.recognitionData.similarity}%
                        </div>
                      </div>
                      <div>
                        <span className="font-semibold">Confianza:</span>
                        <div className="text-lg font-bold text-green-600">
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
                      <h2 className={`text-3xl font-bold mb-2 ${getStatusColor()}`}>
                        {captureState.recognitionData.ui.title}
                      </h2>
                      <p className={`text-xl mb-4 ${getStatusColor()}`}>
                        {captureState.recognitionData.ui.subtitle}
                      </p>
                    </>
                  )}
                  <p className={`text-2xl font-semibold ${getStatusColor()}`}>
                    {captureState.message || 'Listo para comenzar'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {captureState.status === 'idle' && (
              <button
                onClick={startCamera}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-4 min-h-[80px]"
              >
                <Camera className="w-8 h-8" />
                Activar Cámara
              </button>
            )}

            {captureState.status === 'camera-active' && (
              <>
                <button
                  onClick={capturePhoto}
                  className="bg-green-600 hover:bg-green-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-4 min-h-[80px]"
                >
                  <Camera className="w-8 h-8" />
                  Tomar Foto
                </button>
                <button
                  onClick={resetCapture}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-4 min-h-[80px]"
                >
                  <RotateCcw className="w-8 h-8" />
                  Cancelar
                </button>
              </>
            )}

            {(['user-found', 'user-not-found', 'no-face', 'error'].includes(captureState.status)) && (
              <button
                onClick={resetCapture}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-4 min-h-[80px]"
              >
                <RotateCcw className="w-8 h-8" />
                Comenzar de Nuevo
              </button>
            )}

            {(captureState.status === 'capturing' || captureState.status === 'sending') && (
              <div className="bg-gray-300 text-gray-500 px-12 py-6 rounded-2xl text-2xl font-bold flex items-center justify-center gap-4 min-h-[80px] cursor-not-allowed">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
                Procesando...
              </div>
            )}
          </div>
        </div>

        {/* Instructions - Solo se muestran cuando no hay resultados */}
        {shouldShowCamera && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
            <h2 className="text-2xl font-bold text-blue-800 mb-4 text-center">
              Instrucciones
            </h2>
            <div className="space-y-3 text-lg text-blue-700">
              <div className="flex items-center gap-3">
                <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">1</span>
                <span>Toque "Activar Cámara" para comenzar</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">2</span>
                <span>Posicione su rostro frente a la cámara</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">3</span>
                <span>Toque "Tomar Foto" para ver sus horarios de rehabilitación</span>
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
