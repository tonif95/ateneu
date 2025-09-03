import React, { useState, useRef, useCallback } from 'react';
import { Camera, CheckCircle, AlertCircle, RotateCcw, User, XCircle, UserCheck, Calendar, Clock } from 'lucide-react';

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
        await videoRef.current.play();
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
        handleRecognitionResult(result);
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
      videoRef.current.srcObject = null;
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

  const parseActivities = (activitiesString: string) => {
    if (!activitiesString || activitiesString.toLowerCase().includes('descanso')) {
      return [];
    }
    
    return activitiesString.split(',').map(activity => {
      const [time, ...descParts] = activity.trim().split('-');
      return {
        time: time.trim(),
        description: descParts.join('-').trim()
      };
    }).filter(activity => activity.time && activity.description);
  };

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
          {/* Camera Section */}
          <div className="relative mb-8">
            <div className="aspect-video bg-gray-100 rounded-2xl overflow-hidden border-4 border-gray-200 relative">
              {captureState.status === 'camera-active' || captureState.status === 'capturing' ? (
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
                    {captureState.recognitionData?.currentContext?.statusInfo || `Paciente ID: ${captureState.recognitionData.scheduleData.PatientID} • ${getCurrentDay()}`}
                  </p>

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
                            {captureState.recognitionData.currentContext.nextActivity.time}
                          </p>
                          <p className="text-orange-800">
                            {captureState.recognitionData.currentContext.nextActivity.description}
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
                                    {activity.description}
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

        {/* Instructions */}
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

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

export default App;